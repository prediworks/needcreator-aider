import { findEmailOnSite, extractSocials, enrichLeadFromSite } from '../services/acquisition/enrich.js';
import { channelLinks } from '../services/acquisition/youtube.js';
import Lead, { LeadRun, LEAD_STATUSES } from '../models/Lead.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { suppressLead } from '../models/LeadSuppression.js';
import { importLeads, parseLeadLines } from '../services/acquisition/importLeads.js';
import { runAcquisition, acquisitionProgress, acquisitionSettings, qualifyOne, metaTokenInfo } from '../services/acquisition/index.js';
import { importCreators } from '../services/externalCreatorsImport.js';
import ExternalCreator from '../models/ExternalCreator.js';
import { config } from '../config/index.js';
import { outreachSettings, pushToMailing, syncFromMailing, sendLeadReply, handleReply, LIST_NAMES, mailingBreakdown } from '../services/acquisition/outreach.js';
import { LeadRun as _LeadRun } from '../models/Lead.js';
import { mailingProvider } from '../services/mailing/index.js';
import logger from '../utils/logger.js';

const esc = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function acquisitionOverview(req, res) {
  try {
    const [settings, byStatus, runs, meta] = await Promise.all([
      acquisitionSettings(),
      Lead.aggregate([{ $group: { _id: { kind: '$kind', status: '$status' }, n: { $sum: 1 }, withEmail: { $sum: { $cond: [{ $gt: ['$email', null] }, 1, 0] } } } }]),
      LeadRun.find({}).sort({ startedAt: -1 }).limit(10).lean(),
      metaTokenInfo(),
    ]);
    const counts = { creator: {}, brand: {} };
    for (const r of byStatus) counts[r._id.kind][r._id.status] = { n: r.n, withEmail: r.withEmail };
    res.json({ settings: { ...settings, creatorKeywords: settings.creatorKeywords.length, brandKeywords: settings.brandKeywords.length, hashtags: settings.hashtags.length }, counts, runs, progress: acquisitionProgress(), meta, statuses: LEAD_STATUSES });
  } catch (error) {
    logger.error('acquisitionOverview failed:', error);
    res.status(500).json({ error: 'Prospection indisponible' });
  }
}

/** État de l'outil de mailing : fournisseur, clé, listes, envoyés aujourd'hui */
export async function mailingStatus(req, res) {
  try {
    const s = await outreachSettings();
    const provider = mailingProvider();
    let account = null, lists = [], error = null;
    if (provider) {
      try { account = await provider.verify(); const all = await provider.listLists(); lists = Object.entries(LIST_NAMES).map(([kind, name]) => ({ kind, name, ...(all.find(l => l.name === name) || { id: null, contacts: 0 }) })); }
      catch (err) { error = err.message; }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [pushedToday, pushedTotal, replied, eligible] = await Promise.all([
      Lead.countDocuments({ 'mailing.pushedAt': { $gte: today } }), Lead.countDocuments({ 'mailing.pushedAt': { $ne: null } }), Lead.countDocuments({ 'mailing.replyAt': { $ne: null } }),
      Lead.countDocuments({ email: { $ne: null }, 'mailing.pushedAt': null, $or: [{ status: 'to_contact' }, { status: 'qualified', score: { $gte: s.minScore } }] }),
    ]);
    res.json({ settings: s, account, lists, error, pushedToday, pushedTotal, replied, eligible });
  } catch (error) {
    logger.error('mailingStatus failed:', error);
    res.status(500).json({ error: 'État du mailing indisponible' });
  }
}

export async function pushLeadsNow(req, res) {
  try {
    const ids = Array.isArray(req.body?.ids) && req.body.ids.length ? req.body.ids.slice(0, 500) : null;
    const r = await pushToMailing({ ids, limit: ids ? ids.length : parseInt(req.body?.limit, 10) || undefined, force: !!ids });
    res.json({ message: r.reason ? r.reason : `${r.pushed} contact(s) poussé(s) vers ${r.provider}${r.skipped ? ` (ignorés : ${r.skipped.lowScore} score bas, ${r.skipped.generic} email générique, ${r.skipped.blocked} bloqués, ${r.skipped.registered} inscrits)` : ''}`, ...r });
  } catch (error) {
    logger.error('pushLeadsNow failed:', error);
    res.status(500).json({ error: `Envoi impossible : ${error.message}` });
  }
}

export async function syncMailingNow(req, res) {
  try {
    const r = await syncFromMailing();
    res.json({ message: r.synced ? `Synchronisé : ${r.replies} réponse(s), ${r.unsubscribed} désabonné(s), ${r.bounced} rebond(s), ${r.removed} inscrit(s) retiré(s)${r.bounceRate != null ? `, taux de rebond ${r.bounceRate} %` : ''}${r.paused ? ' · envoi automatique mis en pause' : ''}` : r.reason, ...r });
  } catch (error) {
    logger.error('syncMailingNow failed:', error);
    res.status(500).json({ error: `Synchronisation impossible : ${error.message}` });
  }
}

/** Envoie la réponse (texte fourni ou proposition de l'IA) dans le fil du prospect */
export async function replyToLead(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
    const text = String(req.body?.text || lead.mailing?.replySuggestion || '').trim();
    if (!text) return res.status(400).json({ error: 'Il manque : le texte de la réponse' });
    await sendLeadReply(lead, text);
    res.json({ message: 'Réponse envoyée depuis l\'outil de mailing', lead });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/** Reclasse une réponse avec l'IA (sans envoyer) */
export async function reclassifyReply(req, res) {
  const lead = await Lead.findById(req.params.id);
  if (!lead || !lead.mailing?.replyText) return res.status(404).json({ error: 'Aucune réponse à classer' });
  const provider = mailingProvider();
  const s = await outreachSettings();
  await handleReply(lead, provider || { findThread: async () => null, sendReply: async () => ({}), removeFromSequences: async () => 0 }, { ...s, autoReply: false });
  res.json({ message: lead.error ? lead.error : 'Réponse classée', lead });
}

/** Tableau de bord : entonnoir par type, conversion par niche et par source, 30 derniers jours et total */
export async function acquisitionDashboard(req, res) {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const funnel = async (match) => {
      const rows = await Lead.aggregate([{ $match: match }, { $group: { _id: '$kind', found: { $sum: 1 }, withEmail: { $sum: { $cond: [{ $gt: ['$email', null] }, 1, 0] } }, qualified: { $sum: { $cond: [{ $in: ['$status', ['qualified', 'to_contact', 'contacted', 'replied', 'registered']] }, 1, 0] } }, contacted: { $sum: { $cond: [{ $or: [{ $ne: [{ $ifNull: ['$contactedAt', null] }, null] }, { $in: ['$status', ['contacted', 'replied', 'registered']] }] }, 1, 0] } }, replied: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$mailing.replyAt', null] }, null] }, 1, 0] } }, interested: { $sum: { $cond: [{ $eq: ['$mailing.replyIntent', 'interested'] }, 1, 0] } }, registered: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } } } }]);
      const out = { creator: { found: 0, withEmail: 0, qualified: 0, contacted: 0, replied: 0, interested: 0, registered: 0 }, brand: { found: 0, withEmail: 0, qualified: 0, contacted: 0, replied: 0, interested: 0, registered: 0 } };
      for (const r of rows) { const { _id, ...rest } = r; out[_id] = rest; }
      return out;
    };
    const [total, last30, byNiche, bySource, byKeyword, runs] = await Promise.all([
      funnel({}), funnel({ createdAt: { $gte: since } }),
      Lead.aggregate([{ $match: { contactedAt: { $ne: null } } }, { $group: { _id: { kind: '$kind', niche: '$niche' }, contacted: { $sum: 1 }, replied: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$mailing.replyAt', null] }, null] }, 1, 0] } }, registered: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } } } }, { $sort: { contacted: -1 } }, { $limit: 30 }]),
      Lead.aggregate([{ $group: { _id: '$source', found: { $sum: 1 }, withEmail: { $sum: { $cond: [{ $gt: ['$email', null] }, 1, 0] } }, registered: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } } } }]),
      Lead.aggregate([{ $match: { keyword: { $ne: null } } }, { $group: { _id: { kind: '$kind', keyword: '$keyword' }, found: { $sum: 1 }, withEmail: { $sum: { $cond: [{ $gt: ['$email', null] }, 1, 0] } }, qualified: { $sum: { $cond: [{ $gte: ['$score', 60] }, 1, 0] } }, registered: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } } } }, { $sort: { qualified: -1 } }, { $limit: 20 }]),
      _LeadRun.countDocuments({ startedAt: { $gte: since } }),
    ]);
    res.json({ total, last30, byNiche: byNiche.map(r => ({ kind: r._id.kind, niche: r._id.niche || '?', contacted: r.contacted, replied: r.replied, registered: r.registered })), bySource: bySource.map(r => ({ source: r._id, ...r, _id: undefined })), byKeyword: byKeyword.map(r => ({ kind: r._id.kind, keyword: r._id.keyword, found: r.found, withEmail: r.withEmail, qualified: r.qualified, registered: r.registered })), runsLast30: runs, aiConfigured: (await outreachSettings()).configured });
  } catch (error) {
    logger.error('acquisitionDashboard failed:', error);
    res.status(500).json({ error: 'Tableau de bord indisponible' });
  }
}

export async function listLeads(req, res) {
  const { kind, status, source, q, hasEmail, minScore, noHandle, limit = 100, page = 1 } = req.query;
  const filter = {};
  if (kind) filter.kind = kind;
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (noHandle === '1') { filter.handle = { $in: [null, ''] }; if (!status) filter.status = { $nin: ['rejected', 'excluded', 'registered'] }; } // publications Instagram dont l'auteur reste à trouver
  if (hasEmail === '1') filter.email = { $ne: null };
  if (hasEmail === '0') filter.email = null;
  if (minScore) filter.score = { $gte: parseInt(minScore, 10) };
  if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }, { handle: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }, { niche: { $regex: q, $options: 'i' } }];
  const lim = Math.min(500, parseInt(limit, 10) || 100);
  const [leads, total] = await Promise.all([Lead.find(filter).sort({ score: -1, createdAt: -1 }).skip((parseInt(page, 10) - 1) * lim).limit(lim).lean(), Lead.countDocuments(filter)]);
  res.json({ leads, total, page: parseInt(page, 10), limit: lim });
}

const SOCIAL_KEYS = ['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook'];
/** Ne garde que des adresses http(s) pour les cinq réseaux connus ; une valeur vide efface */
function cleanSocials(obj = {}) {
  const out = {};
  for (const k of SOCIAL_KEYS) { const v = String(obj[k] || '').trim(); if (/^https?:\/\//i.test(v)) out[k] = v.slice(0, 300); }
  return out;
}

export async function updateLead(req, res) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
  const { status, notes, email, contactedVia, socials, handle, skip } = req.body || {};
  if (skip === true) lead.enrich = { ...(lead.enrich?.toObject?.() || lead.enrich || {}), skippedAt: new Date() }; // « Passer » dans la file du jour : ne revient pas avant 7 jours
  // Auteur d'une publication relevé par l'aperçu intégré : pseudo, nom et lien du profil
  if (handle && /^@?[A-Za-z0-9_.]{2,30}$/.test(String(handle))) { const h = String(handle).replace(/^@/, ''); lead.handle = `@${h}`; if (!lead.name || lead.source === 'instagram') lead.name = `@${h}`; }
  if (socials && typeof socials === 'object') lead.socials = cleanSocials({ ...(lead.socials?.toObject?.() || lead.socials || {}), ...socials });
  if (status && LEAD_STATUSES.includes(status)) { lead.status = status; if (status === 'contacted') { lead.contactedAt = new Date(); lead.contactedVia = contactedVia || lead.contactedVia || 'manuel'; } }
  if (notes !== undefined) lead.notes = String(notes).slice(0, 2000);
  if (email !== undefined) { lead.email = String(email).trim().toLowerCase() || null; lead.emailSource = lead.email ? 'manuel' : null; }
  await lead.save();
  res.json({ message: 'Prospect mis à jour', lead });
}

export async function bulkUpdateLeads(req, res) {
  const { ids = [], status, contactedVia } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !LEAD_STATUSES.includes(status)) return res.status(400).json({ error: 'Identifiants et statut requis' });
  const set = { status };
  if (status === 'contacted') { set.contactedAt = new Date(); set.contactedVia = contactedVia || 'email'; }
  const r = await Lead.updateMany({ _id: { $in: ids.slice(0, 500) } }, { $set: set });
  res.json({ message: `${r.modifiedCount} prospect(s) mis à jour`, updated: r.modifiedCount });
}

/** Suppression définitive : les données sont effacées, seules des empreintes restent en liste d'exclusion (plus jamais collecté ni contacté) */
export async function deleteLead(req, res) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
  await suppressLead(lead);
  await lead.deleteOne();
  res.json({ message: 'Prospect supprimé et placé en liste d\'exclusion' });
}

/** Ajout manuel (ou test) d'un prospect, qualifié immédiatement si l'IA est configurée */
export async function createLead(req, res) {
  try {
    const b = req.body || {};
    if (!['creator', 'brand'].includes(b.kind) || !String(b.name || '').trim()) return res.status(400).json({ error: 'Il manque : le type (creator ou brand) et le nom' });
    const externalId = String(b.externalId || b.url || b.website || b.email || b.name).trim().toLowerCase();
    const exists = await Lead.findOne({ source: 'manual', externalId });
    if (exists) return res.status(409).json({ error: 'Ce prospect existe déjà', lead: exists });
    const lead = await Lead.create({ kind: b.kind, source: 'manual', externalId, name: String(b.name).trim(), handle: b.handle, url: b.url, website: b.website, country: b.country || 'FR', description: String(b.description || '').slice(0, 2000), email: b.email ? String(b.email).trim().toLowerCase() : null, emailSource: b.email ? 'manuel' : null, keyword: b.keyword || 'manuel', niche: b.niche, stats: b.stats || {}, socials: cleanSocials({ ...extractSocials(`${b.description || ''} ${b.url || ''}`), ...(b.socials || {}) }), status: 'new' });
    if (req.body?.qualify !== false) await qualifyOne(lead, []);
    res.status(201).json({ message: 'Prospect ajouté', lead });
  } catch (error) {
    logger.error('createLead failed:', error);
    res.status(500).json({ error: `Ajout impossible : ${error.message}` });
  }
}

/** Relance la qualification IA d'un prospect */
export async function requalifyLead(req, res) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
  if (!['registered', 'excluded'].includes(lead.status)) lead.status = 'new';
  await qualifyOne(lead, []);
  res.json({ message: lead.error ? lead.error : 'Prospect requalifié', lead });
}

export async function startAcquisitionRun(req, res) {
  const s = await acquisitionSettings();
  if (!s.youtube && !s.meta && !s.instagram) return res.status(400).json({ error: 'Aucune source configurée : ajoutez YOUTUBE_API_KEY ou le jeton Meta' });
  if (acquisitionProgress()) return res.status(409).json({ error: 'Une exécution est déjà en cours' });
  const kinds = Array.isArray(req.body?.kinds) && req.body.kinds.length ? req.body.kinds : ['creator', 'brand'];
  const sources = Array.isArray(req.body?.sources) && req.body.sources.length ? req.body.sources : ['youtube', 'instagram', 'meta'];
  setImmediate(() => runAcquisition({ trigger: `manual:${req.user._id}`, kinds, sources }).catch(err => logger.error('manual acquisition:', err)));
  res.json({ message: 'Recherche lancée en arrière-plan : suivez l\'avancement ici, comptez quelques minutes', started: true });
}

/** Export CSV pour l'outil de mailing : prospects avec email, colonnes prêtes pour la séquence */
export async function exportLeadsCsv(req, res) {
  const { kind = 'creator', status = 'qualified', minScore = 0, markContacted } = req.query;
  const filter = { kind, email: { $ne: null }, status };
  if (parseInt(minScore, 10) > 0) filter.score = { $gte: parseInt(minScore, 10) };
  const leads = await Lead.find(filter).sort({ score: -1 }).limit(2000).lean();
  const head = kind === 'creator' ? ['email', 'prenom', 'pseudo', 'nom', 'niche', 'abonnes', 'url', 'instagram', 'tiktok', 'score', 'paragraphe', 'message', 'inscription'] : ['email', 'entreprise', 'secteur', 'site', 'instagram', 'tiktok', 'annonces', 'score', 'paragraphe', 'message', 'inscription'];
  const rows = leads.map(l => kind === 'creator'
    ? [l.email, l.firstName || '', (l.handle || '').replace(/^@/, ''), l.name, l.niche, l.stats?.subscribers ?? '', l.url, l.socials?.instagram || '', l.socials?.tiktok || '', l.score ?? '', l.emailParagraph || '', l.message || '', `${config.cors.origin}/register?role=creator&from=${encodeURIComponent((l.handle || '').replace(/^@/, ''))}`]
    : [l.email, l.name, l.niche, l.website || '', l.socials?.instagram || '', l.socials?.tiktok || '', l.stats?.ads ?? '', l.score ?? '', l.emailParagraph || '', l.message || '', `${config.cors.origin}/register?role=brand`]);
  const csv = '﻿' + [head, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
  if (markContacted === '1' && leads.length) await Lead.updateMany({ _id: { $in: leads.map(l => l._id) } }, { $set: { status: 'contacted', contactedAt: new Date(), contactedVia: 'email' } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="prospects-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}

/** Import des créateurs qualifiés dans l'annuaire des créateurs référencés (fiche publique + séquence email existante) */
export async function importLeadsToDirectory(req, res) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : null;
    const filter = { kind: 'creator', status: { $in: ['qualified', 'to_contact', 'contacted'] }, externalCreatorId: null, ...(ids ? { _id: { $in: ids } } : {}) };
    const leads = await Lead.find(filter).lean();
    const rows = leads.map(l => ({ username: (l.handle || l.name || '').replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60), name: l.name, country: l.country || 'FR', email: l.email || '', youtube: l.url, followers: l.stats?.subscribers || 0, posts: l.stats?.videos || 0, sourceNiche: l.niche })).filter(r => r.username);
    const stats = rows.length ? await importCreators(rows, { scope: 'europe', source: 'prospection' }) : { created: 0, updated: 0 };
    let linked = 0;
    for (const l of leads) {
      const username = (l.handle || l.name || '').replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);
      const ec = username && await ExternalCreator.findOne({ username }).select('_id').lean();
      if (ec) { await Lead.updateOne({ _id: l._id }, { $set: { externalCreatorId: ec._id } }); linked++; }
    }
    res.json({ message: `${stats.created} créateur(s) ajouté(s) à l'annuaire, ${stats.updated} mis à jour`, stats, linked });
  } catch (error) {
    logger.error('importLeadsToDirectory failed:', error);
    res.status(500).json({ error: `Import impossible : ${error.message}` });
  }
}

/** Import groupé : liste collée (une ligne par prospect), dédoublonnée, qualifiée par l'IA à la suite. ?preview=1 renvoie la lecture sans enregistrer. */
export async function importLeadsBulk(req, res) {
  try {
    const { kind = 'creator', text = '', niche = '', origin = '' } = req.body || {};
    if (!['creator', 'brand'].includes(kind)) return res.status(400).json({ error: 'Type attendu : creator ou brand' });
    if (!String(text).trim()) return res.status(400).json({ error: 'Collez au moins une ligne' });
    const lines = String(text).split(/\r?\n/).filter(l => l.trim()).length;
    if (lines > 500) return res.status(400).json({ error: 'Au plus 500 lignes par import' });
    if (req.query.preview === '1') return res.json({ rows: parseLeadLines(text).map(r => ({ name: r.name, url: r.url, website: r.website, email: r.email, socials: r.socials, description: r.description, error: r.error })) });
    const result = await importLeads({ kind, text, niche: String(niche || '').trim().toLowerCase() || null, origin: String(origin || '').trim() });
    // Message en clair : une ligne reconnue n'est pas un rejet, elle complète la fiche ou n'apporte rien de nouveau
    const parts = [
      `${result.total} ligne(s) lue(s)`,
      result.created ? `${result.created} nouveau(x) prospect(s)` : null,
      result.updated ? `${result.updated} fiche(s) existante(s) complétée(s)${result.emailsAdded ? `, dont ${result.emailsAdded} avec un nouvel email` : ''}${result.twins ? `, dont ${result.twins} doublon(s) d'un même créateur mis de côté` : ''}` : null,
      result.unchanged ? `${result.unchanged} fiche(s) déjà connue(s) sans rien de nouveau (ni email ni réseau trouvé en plus)` : null,
      result.duplicates ? `${result.duplicates} ligne(s) en double` : null,
      result.suppressed ? `${result.suppressed} en liste d'exclusion` : null,
      result.invalid ? `${result.invalid} ligne(s) illisible(s)` : null,
    ].filter(Boolean);
    res.status(201).json({ message: `${parts.join(' · ')}.`, ...result });
  } catch (error) {
    logger.error('importLeadsBulk failed:', error);
    res.status(500).json({ error: `Import impossible : ${error.message}` });
  }
}

let socialsJob = null; // une seule passe à la fois
/** Complète en arrière-plan les réseaux (Instagram, TikTok…) des prospects qui n'en ont pas : bio, puis rubrique « Liens » de la chaîne YouTube. Sans appel à l'IA. */
export async function enrichLeadSocials(req, res) {
  if (socialsJob?.running) return res.json({ message: `Déjà en cours : ${socialsJob.done} / ${socialsJob.total}`, ...socialsJob });
  const sinceS = new Date(Date.now() - 30 * 86400000);
  const leads = await Lead.find({ $and: [{ $or: [{ 'socials.instagram': { $in: [null, ''] } }, { 'socials.instagram': { $exists: false } }] }, { $or: [{ 'socials.tiktok': { $in: [null, ''] } }, { 'socials.tiktok': { $exists: false } }] }, { $or: [{ 'enrich.socialsSearchedAt': { $exists: false } }, { 'enrich.socialsSearchedAt': null }, { 'enrich.socialsSearchedAt': { $lt: sinceS } }] }], status: { $nin: ['excluded'] } }).select('_id').limit(1000).lean();
  socialsJob = { running: true, total: leads.length, done: 0, found: 0, startedAt: new Date() };
  res.json({ message: leads.length ? `Recherche des réseaux lancée pour ${leads.length} prospect(s) : comptez une à deux secondes par chaîne YouTube et cinq à quinze par site de marque, rechargez la page dans quelques minutes` : 'Rien à chercher : les prospects sans Instagram ni TikTok ont déjà été visités il y a moins de 30 jours', ...socialsJob });
  setImmediate(async () => {
    for (const { _id } of leads) {
      try {
        const lead = await Lead.findById(_id);
        if (!lead) continue;
        const cur = lead.socials?.toObject?.() || lead.socials || {};
        let soc = { ...extractSocials(`${lead.description || ''} ${lead.url || ''} ${lead.website || ''}`), ...cur };
        if (lead.source === 'youtube' && lead.url && !soc.instagram && !soc.tiktok) { soc = { ...(await channelLinks(lead.url)), ...soc }; await new Promise(r => setTimeout(r, 1200)); }
        // Marque avec un site mais sans réseau connu : les liens Instagram, TikTok, LinkedIn sont sur le site (pied de page, page contact)
        if (lead.kind === 'brand' && lead.website && !soc.instagram && !soc.tiktok && !soc.linkedin) { const r = await findEmailOnSite(lead.website, { maxPages: 3 }).catch(() => null); soc = { ...(r?.socials || {}), ...soc }; if (r?.email && !lead.email) { lead.email = r.email; lead.emailSource = r.source; } }
        if (soc.instagram || soc.tiktok || Object.keys(soc).length > Object.keys(cur).length) { lead.socials = soc; if (soc.instagram || soc.tiktok) socialsJob.found++; }
        lead.enrich = { ...(lead.enrich?.toObject?.() || lead.enrich || {}), socialsSearchedAt: new Date() }; // pas revisité avant 30 jours
        await lead.save();
      } catch (err) { logger.warn(`enrichLeadSocials ${_id}: ${err.message}`); }
      socialsJob.done++;
    }
    socialsJob.running = false; socialsJob.finishedAt = new Date();
    logger.info(`Réseaux complétés : ${socialsJob.found} prospect(s) avec Instagram ou TikTok sur ${socialsJob.total}`);
  });
}

let emailsJob = null; // une seule passe à la fois
const RESEARCH_AFTER_MS = 30 * 86400000; // un prospect déjà cherché n'est pas revisité avant 30 jours
const lastPass = (j, what) => j?.finishedAt ? ` Dernière passe : ${j.found} ${what} trouvé(s) sur ${j.total} prospect(s)${j.noSite ? `, dont ${j.noSite} sans site web connu` : ''}.` : '';
/** Cherche en arrière-plan l'email des prospects sans email : accueil, page contact, mentions légales de leur site. Sans appel à l'IA. Chaque prospect n'est visité qu'une fois par période de 30 jours. */
export async function enrichLeadEmails(req, res) {
  if (emailsJob?.running) return res.json({ message: `Déjà en cours : ${emailsJob.done} / ${emailsJob.total}, ${emailsJob.found} email(s) trouvé(s)`, ...emailsJob });
  const kind = ['creator', 'brand'].includes(req.body?.kind) ? req.body.kind : 'brand';
  const since = new Date(Date.now() - RESEARCH_AFTER_MS);
  const leads = await Lead.find({ kind, email: { $in: [null, ''] }, status: { $nin: ['excluded', 'registered'] }, $or: [{ 'enrich.emailSearchedAt': { $exists: false } }, { 'enrich.emailSearchedAt': null }, { 'enrich.emailSearchedAt': { $lt: since } }] }).select('_id').limit(500).lean();
  const previous = emailsJob;
  if (!leads.length) return res.json({ message: `Rien à chercher : tous les prospects sans email de cet onglet ont déjà été visités il y a moins de 30 jours.${lastPass(previous, 'email(s)')}`, total: 0 });
  emailsJob = { running: true, kind, total: leads.length, done: 0, found: 0, noSite: 0, startedAt: new Date() };
  res.json({ message: `Recherche d'email lancée pour ${leads.length} prospect(s) : 5 à 15 secondes par site, sans IA. Recliquez sur ce bouton pour voir l'avancement.${lastPass(previous, 'email(s)')}`, ...emailsJob });
  setImmediate(async () => {
    for (const { _id } of leads) {
      try {
        const lead = await Lead.findById(_id);
        if (lead && !lead.email) {
          const got = await enrichLeadFromSite(lead);
          if (got) emailsJob.found++;
          const noSite = !lead.website && !(lead.url && !/instagram\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com/i.test(lead.url));
          if (noSite) emailsJob.noSite++;
          lead.enrich = { ...(lead.enrich?.toObject?.() || lead.enrich || {}), emailSearchedAt: new Date(), noSite };
          await lead.save();
        }
      } catch (err) { logger.warn(`enrichLeadEmails ${_id}: ${err.message}`); }
      emailsJob.done++;
    }
    emailsJob.running = false; emailsJob.finishedAt = new Date();
    logger.info(`Emails complétés : ${emailsJob.found} trouvé(s) sur ${emailsJob.total} prospect(s), ${emailsJob.noSite} sans site (${kind})`);
  });
}

/** Explication de l'écart entre les prospects de l'application et les contacts de l'outil de mailing */
export async function mailingBreakdownView(req, res) {
  try { res.json(await mailingBreakdown()); }
  catch (error) { logger.error('mailingBreakdown failed:', error); res.status(500).json({ error: 'Décompte indisponible' }); }
}

/**
 * Lot de profils à donner à l'assistant Chrome : créateurs sans email qui ont un profil Instagram ou TikTok.
 * Les profils remis sont mémorisés 30 jours pour ne pas être redonnés ; ?preview=1 compte sans mémoriser.
 */
export async function assistantBatch(req, res) {
  try {
    const since = new Date(Date.now() - 30 * 86400000);
    const filter = { kind: 'creator', email: { $in: [null, ''] }, status: { $nin: ['rejected', 'excluded', 'registered'] }, $and: [{ $or: [{ 'socials.instagram': { $nin: [null, ''] } }, { 'socials.tiktok': { $nin: [null, ''] } }] }, { $or: [{ 'enrich.assistantAt': { $exists: false } }, { 'enrich.assistantAt': null }, { 'enrich.assistantAt': { $lt: since } }] }] };
    const total = await Lead.countDocuments(filter);
    const noProfile = await Lead.countDocuments({ kind: 'creator', email: { $in: [null, ''] }, status: { $nin: ['rejected', 'excluded', 'registered'] }, 'socials.instagram': { $in: [null, ''] }, 'socials.tiktok': { $in: [null, ''] } });
    if (req.query.preview === '1') return res.json({ total, noProfile, links: [] });
    // Second lot : chaînes YouTube sans aucun réseau connu. L'assistant ouvre la chaîne et cherche le même pseudo sur Instagram.
    if (req.body?.type === 'youtube') {
      const ytFilter = { kind: 'creator', source: 'youtube', url: { $regex: '^https?://' }, email: { $in: [null, ''] }, status: { $nin: ['rejected', 'excluded', 'registered'] }, 'socials.instagram': { $in: [null, ''] }, 'socials.tiktok': { $in: [null, ''] }, $or: [{ 'enrich.assistantYtAt': { $exists: false } }, { 'enrich.assistantYtAt': null }, { 'enrich.assistantYtAt': { $lt: since } }] };
      const ytTotal = await Lead.countDocuments(ytFilter);
      const yts = await Lead.find(ytFilter).sort({ score: -1 }).limit(Math.min(60, parseInt(req.body?.limit, 10) || 40)).select('url name').lean();
      if (yts.length) await Lead.updateMany({ _id: { $in: yts.map(l => l._id) } }, { $set: { 'enrich.assistantYtAt': new Date() } });
      return res.json({ type: 'youtube', links: yts.map(l => `${l.url} ; ${String(l.name || '').replace(/[;\n]/g, ' ')}`), total: ytTotal, remaining: Math.max(0, ytTotal - yts.length), noProfile });
    }
    const leads = await Lead.find(filter).sort({ score: -1 }).limit(Math.min(60, parseInt(req.body?.limit, 10) || 60)).select('socials').lean();
    const links = leads.map(l => l.socials.instagram || l.socials.tiktok);
    if (leads.length) await Lead.updateMany({ _id: { $in: leads.map(l => l._id) } }, { $set: { 'enrich.assistantAt': new Date() } });
    res.json({ links, total, remaining: Math.max(0, total - links.length), noProfile });
  } catch (error) {
    logger.error('assistantBatch failed:', error);
    res.status(500).json({ error: 'Lot indisponible' });
  }
}

/** Prépare (ou retrouve) le brief offert d'une marque et l'ajoute à la réponse proposée. Utile quand la réponse n'a pas été classée « intéressé » ou pour une marque contactée à la main. */
export async function offerBriefToLead(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
    if (lead.kind !== 'brand') return res.status(400).json({ error: 'Le brief offert concerne les marques' });
    if (!lead.website && !lead.offeredBriefId) return res.status(400).json({ error: 'Il manque : le site web de la marque (renseignez-le sur la fiche)' });
    const { prepareOfferedBrief } = await import('../services/acquisition/replies.js');
    const offer = await prepareOfferedBrief(lead);
    if (!offer) return res.status(422).json({ error: 'Brief impossible à préparer : site illisible (protection anti-robot) ou IA indisponible. Préparez-le à la main sur /brief-depuis-url avec la description du produit.' });
    const cur = String(lead.mailing?.replySuggestion || '').trim();
    if (!cur.includes(String(offer.brief._id))) lead.mailing = { ...(lead.mailing?.toObject?.() || lead.mailing || {}), replySuggestion: `${cur ? `${cur}\n\n` : 'Bonjour,\n\n'}${offer.text}`.slice(0, 2400) };
    await lead.save();
    res.json({ message: `Brief préparé${offer.brief.product?.name ? ` pour « ${offer.brief.product.name} »` : ''} et ajouté à la réponse proposée`, briefId: offer.brief._id, lead });
  } catch (error) {
    logger.error('offerBriefToLead failed:', error);
    res.status(500).json({ error: `Préparation impossible : ${error.message}` });
  }
}

/**
 * File « À contacter aujourd'hui » : prospects à joindre en message privé, à la main. Qualifiés ou validés, avec un profil Instagram ou TikTok,
 * jamais encore contactés (ni par email ni à la main), non reportés depuis moins de 7 jours ; les mieux notés d'abord.
 */
export async function dailyQueue(req, res) {
  try {
    const kind = ['creator', 'brand'].includes(req.query.kind) ? req.query.kind : 'creator';
    const goal = Math.min(40, Math.max(1, Number(await getSetting(SETTINGS.manualDailyGoal.key, 15)) || 15));
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const doneToday = await Lead.countDocuments({ kind, contactedAt: { $gte: startOfDay }, contactedVia: { $in: ['instagram', 'tiktok', 'linkedin', 'facebook', 'youtube'] } });
    const filter = { kind, status: { $in: ['qualified', 'to_contact'] }, 'mailing.pushedAt': null, $and: [{ $or: [{ 'socials.instagram': { $nin: [null, ''] } }, { 'socials.tiktok': { $nin: [null, ''] } }, ...(kind === 'brand' ? [{ 'socials.linkedin': { $nin: [null, ''] } }] : [])] }, { $or: [{ 'enrich.skippedAt': { $exists: false } }, { 'enrich.skippedAt': null }, { 'enrich.skippedAt': { $lt: new Date(Date.now() - 7 * 86400000) } }] }] };
    const waiting = await Lead.countDocuments(filter);
    const left = Math.max(0, goal - doneToday);
    // Sans email d'abord : pour eux le message privé est le seul canal ; ensuite par score
    const leads = left ? await Lead.aggregate([{ $match: filter }, { $addFields: { hasEmail: { $cond: [{ $gt: ['$email', null] }, 1, 0] } } }, { $sort: { hasEmail: 1, score: -1, createdAt: 1 } }, { $limit: left }, { $project: { name: 1, handle: 1, niche: 1, score: 1, stats: 1, socials: 1, url: 1, aiSummary: 1, signals: 1, message: 1, email: 1, status: 1, description: 1 } }]) : [];
    res.json({ kind, goal, doneToday, left, waiting, leads });
  } catch (error) {
    logger.error('dailyQueue failed:', error);
    res.status(500).json({ error: 'File du jour indisponible' });
  }
}

/** Réponse reçue en message privé (Instagram, TikTok, LinkedIn) collée à la main : classée par l'IA, email ou formulaire relevés, statut « A répondu » */
export async function pasteReply(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
    const text = String(req.body?.text || '').trim();
    if (text.length < 5) return res.status(400).json({ error: 'Il manque : le texte de la réponse' });
    const via = ['instagram', 'tiktok', 'linkedin', 'facebook', 'email'].includes(req.body?.via) ? req.body.via : 'instagram';
    const { recordReply } = await import('../services/acquisition/replies.js');
    const { extracted, intent } = await recordReply(lead, text, { via });
    const parts = [
      intent === 'redirect' ? 'La marque renvoie vers un autre canal' : intent === 'interested' ? 'Réponse classée « intéressé »' : intent === 'refusal' ? 'Refus : prospect écarté' : intent === 'question' ? 'Question posée : réponse proposée' : 'Réponse enregistrée',
      extracted.email ? `email ${lead.email === extracted.email ? 'ajouté à la fiche' : 'relevé'} : ${extracted.email}${lead.email === extracted.email ? ' (partira par le mailing)' : ''}` : null,
      extracted.form ? 'formulaire noté sur la fiche' : null,
    ].filter(Boolean);
    res.json({ message: `${parts.join(' · ')}.`, lead, extracted, intent });
  } catch (error) {
    logger.error('pasteReply failed:', error);
    res.status(500).json({ error: `Enregistrement impossible : ${error.message}` });
  }
}
