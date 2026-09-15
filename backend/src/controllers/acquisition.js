import Lead, { LeadRun, LEAD_STATUSES } from '../models/Lead.js';
import { runAcquisition, acquisitionProgress, acquisitionSettings, qualifyOne, metaTokenInfo } from '../services/acquisition/index.js';
import { importCreators } from '../services/externalCreatorsImport.js';
import ExternalCreator from '../models/ExternalCreator.js';
import { config } from '../config/index.js';
import { outreachSettings, pushToMailing, syncFromMailing, LIST_NAMES } from '../services/acquisition/outreach.js';
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
    res.json({ settings: { ...settings, creatorKeywords: settings.creatorKeywords.length, brandKeywords: settings.brandKeywords.length }, counts, runs, progress: acquisitionProgress(), meta, statuses: LEAD_STATUSES });
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

export async function listLeads(req, res) {
  const { kind, status, source, q, hasEmail, minScore, limit = 100, page = 1 } = req.query;
  const filter = {};
  if (kind) filter.kind = kind;
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (hasEmail === '1') filter.email = { $ne: null };
  if (hasEmail === '0') filter.email = null;
  if (minScore) filter.score = { $gte: parseInt(minScore, 10) };
  if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }, { handle: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }, { niche: { $regex: q, $options: 'i' } }];
  const lim = Math.min(500, parseInt(limit, 10) || 100);
  const [leads, total] = await Promise.all([Lead.find(filter).sort({ score: -1, createdAt: -1 }).skip((parseInt(page, 10) - 1) * lim).limit(lim).lean(), Lead.countDocuments(filter)]);
  res.json({ leads, total, page: parseInt(page, 10), limit: lim });
}

export async function updateLead(req, res) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
  const { status, notes, email, contactedVia } = req.body || {};
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

export async function deleteLead(req, res) {
  const r = await Lead.deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Prospect introuvable' });
  res.json({ message: 'Prospect supprimé' });
}

/** Ajout manuel (ou test) d'un prospect, qualifié immédiatement si l'IA est configurée */
export async function createLead(req, res) {
  try {
    const b = req.body || {};
    if (!['creator', 'brand'].includes(b.kind) || !String(b.name || '').trim()) return res.status(400).json({ error: 'Il manque : le type (creator ou brand) et le nom' });
    const externalId = String(b.externalId || b.url || b.website || b.email || b.name).trim().toLowerCase();
    const exists = await Lead.findOne({ source: 'manual', externalId });
    if (exists) return res.status(409).json({ error: 'Ce prospect existe déjà', lead: exists });
    const lead = await Lead.create({ kind: b.kind, source: 'manual', externalId, name: String(b.name).trim(), handle: b.handle, url: b.url, website: b.website, country: b.country || 'FR', description: String(b.description || '').slice(0, 2000), email: b.email ? String(b.email).trim().toLowerCase() : null, emailSource: b.email ? 'manuel' : null, keyword: b.keyword || 'manuel', niche: b.niche, stats: b.stats || {}, status: 'new' });
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
  if (!s.youtube && !s.meta) return res.status(400).json({ error: 'Aucune source configurée : ajoutez YOUTUBE_API_KEY ou le jeton Meta' });
  if (acquisitionProgress()) return res.status(409).json({ error: 'Une exécution est déjà en cours' });
  const kinds = Array.isArray(req.body?.kinds) && req.body.kinds.length ? req.body.kinds : ['creator', 'brand'];
  setImmediate(() => runAcquisition({ trigger: `manual:${req.user._id}`, kinds }).catch(err => logger.error('manual acquisition:', err)));
  res.json({ message: 'Recherche lancée en arrière-plan : suivez l\'avancement ici, comptez quelques minutes', started: true });
}

/** Export CSV pour l'outil de mailing : prospects avec email, colonnes prêtes pour la séquence */
export async function exportLeadsCsv(req, res) {
  const { kind = 'creator', status = 'qualified', minScore = 0, markContacted } = req.query;
  const filter = { kind, email: { $ne: null }, status };
  if (parseInt(minScore, 10) > 0) filter.score = { $gte: parseInt(minScore, 10) };
  const leads = await Lead.find(filter).sort({ score: -1 }).limit(2000).lean();
  const head = kind === 'creator' ? ['email', 'prenom', 'pseudo', 'nom', 'niche', 'abonnes', 'url', 'score', 'paragraphe', 'message', 'inscription'] : ['email', 'entreprise', 'secteur', 'site', 'annonces', 'score', 'paragraphe', 'message', 'inscription'];
  const rows = leads.map(l => kind === 'creator'
    ? [l.email, l.firstName || '', (l.handle || '').replace(/^@/, ''), l.name, l.niche, l.stats?.subscribers ?? '', l.url, l.score ?? '', l.emailParagraph || '', l.message || '', `${config.cors.origin}/register?role=creator&from=${encodeURIComponent((l.handle || '').replace(/^@/, ''))}`]
    : [l.email, l.name, l.niche, l.website || '', l.stats?.ads ?? '', l.score ?? '', l.emailParagraph || '', l.message || '', `${config.cors.origin}/register?role=brand`]);
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
