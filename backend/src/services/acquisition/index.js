import Lead, { LeadRun } from '../../models/Lead.js';
import User from '../../models/User.js';
import Campaign from '../../models/Campaign.js';
import ExternalCreator from '../../models/ExternalCreator.js';
import { getSetting, SETTINGS } from '../../models/Setting.js';
import { searchCreators, youtubeConfigured, channelLinks } from './youtube.js';
import { searchBrands, metaConfigured } from './meta.js';
import { extractSocials, enrichLeadFromSite } from './enrich.js';
import { isSuppressed } from '../../models/LeadSuppression.js';
import { searchHashtag, instagramConfigured, oembedBlocked } from './instagram.js';
import { qualifyLead } from './qualify.js';
import { parseKeywordLines, parseHashtags, DEFAULT_CREATOR_KEYWORDS, DEFAULT_BRAND_KEYWORDS, DEFAULT_INSTAGRAM_HASHTAGS } from './keywords.js';
import { aiConfig } from '../ai.js';
import logger from '../../utils/logger.js';

const progress = new Map();
export const acquisitionProgress = () => [...progress.values()].find(p => p.running) || null;

export async function acquisitionSettings() {
  const [enabled, dailyLimit, minSubscribers, maxSubscribers, creatorKw, brandKw] = await Promise.all([
    getSetting(SETTINGS.acquisitionEnabled.key, false), getSetting(SETTINGS.acquisitionDailyLimit.key, 60),
    getSetting(SETTINGS.acquisitionMinSubscribers.key, 0), getSetting(SETTINGS.acquisitionMaxSubscribers.key, 300000),
    getSetting(SETTINGS.acquisitionCreatorKeywords.key, ''), getSetting(SETTINGS.acquisitionBrandKeywords.key, ''),
  ]);
  const hashtags = parseHashtags(await getSetting(SETTINGS.acquisitionInstagramHashtags.key, ''), DEFAULT_INSTAGRAM_HASHTAGS);
  return { enabled: !!enabled, hashtags, instagram: await instagramConfigured(), oembed: !oembedBlocked(), dailyLimit: Number(dailyLimit) || 60, instagramShare: Math.min(100, Math.max(0, Number(await getSetting(SETTINGS.acquisitionInstagramShare.key, 30)))), brandShare: Math.min(100, Math.max(0, Number(await getSetting(SETTINGS.acquisitionBrandShare.key, 30)))), minSubscribers: Number(minSubscribers) || 0, maxSubscribers: Number(maxSubscribers) || 300000, creatorKeywords: parseKeywordLines(creatorKw, DEFAULT_CREATOR_KEYWORDS), brandKeywords: parseKeywordLines(brandKw, DEFAULT_BRAND_KEYWORDS), youtube: youtubeConfigured(), meta: await metaConfigured(), ai: aiConfig().configured };
}

/** Prospect déjà connu ? (compte inscrit par email, créateur référencé, ou déjà en base) */
async function alreadyKnown(cand) {
  if (cand.email) {
    const u = await User.findOne({ email: cand.email }).select('_id role').lean();
    if (u) return { registeredUserId: u._id };
    const ec = await ExternalCreator.findOne({ email: cand.email }).select('_id').lean();
    if (ec) return { externalCreatorId: ec._id };
  }
  if (cand.source === 'youtube' && cand.handle) {
    const ec = await ExternalCreator.findOne({ youtube: new RegExp(cand.handle.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).select('_id').lean();
    if (ec) return { externalCreatorId: ec._id };
  }
  return null;
}

/** Au démarrage du serveur : les exécutions restées « en cours » ont été coupées par un redémarrage ; on les clôture avec ce motif */
export async function closeInterruptedRuns() {
  const r = await LeadRun.updateMany({ finishedAt: null }, { $set: { finishedAt: new Date() }, $push: { issues: 'Interrompue par un redémarrage du serveur (déploiement) avant la fin : les prospects déjà trouvés sont conservés, relancez la recherche' } });
  if (r.modifiedCount) logger.warn(`${r.modifiedCount} exécution(s) de prospection clôturée(s) comme interrompues`);
  return r.modifiedCount;
}

/** Enregistre un candidat s'il est nouveau ; retourne le document créé ou null */
async function upsertCandidate(cand, runId) {
  const exists = await Lead.findOne({ source: cand.source, externalId: cand.externalId }).select('_id').lean();
  if (exists) return null;
  if (await isSuppressed(cand)) return null; // supprimé à sa demande ou par un administrateur : plus jamais collecté
  const known = await alreadyKnown(cand);
  const { links, ...data } = cand;
  return Lead.create({ ...data, runId, status: known?.registeredUserId ? 'registered' : known?.externalCreatorId ? 'excluded' : 'new', notes: known?.externalCreatorId ? 'Déjà dans l\'annuaire des créateurs référencés' : undefined, ...known });
}

/** Qualification IA d'un prospect « new » → « qualified » (ou « rejected » si hors cible) */
export async function qualifyOne(lead, openNiches) {
  try {
    // Réseaux cités dans la bio, pour les prospects créés avant l'ajout du champ (requalification)
    const cur = lead.socials?.toObject?.() || lead.socials || {};
    if (!Object.values(cur).some(Boolean)) { const soc = extractSocials(`${lead.description || ''} ${lead.url || ''}`); if (Object.keys(soc).length) lead.socials = { ...cur, ...soc }; }
    if (lead.source === 'youtube' && lead.url && !lead.socials?.instagram && !lead.socials?.tiktok) { const soc = await channelLinks(lead.url); if (Object.keys(soc).length) lead.socials = { ...(lead.socials?.toObject?.() || lead.socials || {}), ...soc }; }
    const q = await qualifyLead(lead, { openNiches });
    if (!q) return lead;
    lead.niche = q.niche || q.sector || lead.niche;
    lead.score = Math.round(q.fit);
    lead.signals = q.signals;
    lead.aiSummary = q.summary;
    lead.message = q.message;
    lead.emailParagraph = q.emailParagraph;
    if (q.firstName) lead.name = lead.name || q.firstName;
    if (q.firstName) lead.firstName = q.firstName;
    const offTarget = lead.kind === 'brand' ? q.sellsProducts === false : false;
    lead.status = lead.status === 'new' ? (offTarget || lead.score < 30 ? 'rejected' : 'qualified') : lead.status;
    lead.error = undefined;
  } catch (err) {
    lead.error = `Qualification IA : ${err.message}`.slice(0, 300);
    logger.warn(`Lead ${lead._id} qualification failed: ${err.message}`);
  }
  await lead.save();
  return lead;
}

async function openNicheKeys() {
  const rows = await Campaign.aggregate([{ $match: { status: 'active', visibility: { $ne: 'private' } } }, { $unwind: '$matching.niches' }, { $group: { _id: '$matching.niches', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  return rows.map(r => r._id);
}

/**
 * Exécution complète : sources → dédoublonnage → qualification IA, dans la limite quotidienne.
 * Une seule exécution à la fois ; journal dans LeadRun.
 */
export async function runAcquisition({ trigger = 'scheduled', kinds = ['creator', 'brand'], sources: wantedSources = ['youtube', 'instagram', 'meta'] } = {}) {
  if (acquisitionProgress()) return { ran: false, reason: 'running' };
  const s = await acquisitionSettings();
  const runId = `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  const run = await LeadRun.create({ runId, startedAt: new Date(), trigger, sources: {}, issues: [] });
  const job = { runId, running: true, startedAt: new Date(), found: 0, created: 0, qualified: 0, step: 'sourcing' };
  progress.set(runId, job);
  const wanted = new Set(wantedSources);
  const sources = { youtube: { searched: 0, found: 0, new: 0, withEmail: 0, errors: 0 }, instagram: { searched: 0, found: 0, new: 0, withEmail: 0, errors: 0 }, meta: { searched: 0, found: 0, new: 0, withEmail: 0, errors: 0 } };
  let budget = s.dailyLimit;
  try {
    const created = [];
    // Répartition du plafond : une part réservée aux marques et à Instagram, YouTube (la source la plus abondante) passe en dernier et prend tout ce qui reste
    const brandOn = kinds.includes('brand') && s.meta && wanted.has('meta');
    const igOn = kinds.includes('creator') && s.instagram && wanted.has('instagram');
    const ytOn = kinds.includes('creator') && s.youtube && wanted.has('youtube');
    budget = brandOn ? (igOn || ytOn ? Math.round(s.dailyLimit * s.brandShare / 100) : s.dailyLimit) : 0;
    let metaBlocked = false;
    if (kinds.includes('brand') && s.meta && wanted.has('meta')) {
      for (const { niche: sector, keywords } of s.brandKeywords) {
        if (metaBlocked) break;
        for (const kw of keywords) {
          if (budget <= 0 || metaBlocked) break;
          try {
            sources.meta.searched++;
            const found = await searchBrands(kw, { limit: 50 });
            sources.meta.found += found.length;
            for (const b of found) {
              if (budget <= 0) break;
              const doc = await upsertCandidate({ ...b, niche: sector }, runId);
              if (!doc) continue;
              // Site de la marque : email et réseaux (Instagram, TikTok, LinkedIn…) en une visite, mémorisée 30 jours
              if (doc.status === 'new' && doc.website) { await enrichLeadFromSite(doc).catch(() => false); doc.enrich = { ...(doc.enrich?.toObject?.() || doc.enrich || {}), emailSearchedAt: new Date(), socialsSearchedAt: new Date() }; await doc.save(); }
              sources.meta.new++; if (doc.email) sources.meta.withEmail++;
              if (doc.status === 'new') { created.push(doc); budget--; }
            }
          } catch (err) {
            sources.meta.errors++; logger.warn(err.message);
            if (err.code === 10) { run.issues.push('Meta : identité non encore validée par Meta (« Application does not have permission ») : la recherche de marques se débloquera seule après validation'); metaBlocked = true; break; }
            if (err.code === 190) { run.issues.push('Meta : jeton expiré ou invalide, à renouveler dans Réglages → Prospection'); metaBlocked = true; break; }
            run.issues.push(`meta « ${kw} » : ${err.message}`.slice(0, 200));
          }
          job.found = sources.youtube.found + sources.instagram.found + sources.meta.found; job.created = created.length;
        }
      }
    }
    budget = igOn ? (ytOn ? Math.min(s.dailyLimit - created.length, Math.round(s.dailyLimit * s.instagramShare / 100)) : s.dailyLimit - created.length) : 0;
    if (kinds.includes('creator') && s.instagram && wanted.has('instagram')) {
      for (const tag of s.hashtags) {
        if (budget <= 0) break;
        try {
          sources.instagram.searched++;
          const found = await searchHashtag(tag, { limit: 40 });
          sources.instagram.found += found.length;
          for (const c of found) {
            if (budget <= 0) break;
            const doc = await upsertCandidate({ ...c, niche: 'lifestyle' }, runId);
            if (!doc) continue;
            sources.instagram.new++; if (doc.email) sources.instagram.withEmail++;
            if (doc.status === 'new') { created.push(doc); budget--; }
          }
        } catch (err) {
          sources.instagram.errors++; logger.warn(err.message);
          if (err.code === 10 || err.code === 190 || /hashtag/i.test(err.message) && /limit/i.test(err.message)) { run.issues.push(`Instagram : ${err.message}`.slice(0, 200)); break; }
          run.issues.push(`instagram #${tag} : ${err.message}`.slice(0, 200));
        }
        job.found = sources.youtube.found + sources.instagram.found + sources.meta.found; job.created = created.length;
      }
      if (oembedBlocked()) run.issues.push('Instagram : auteur des publications indisponible tant que « oEmbed Read » n\'est pas approuvé par Meta (revue de fonctionnalité) : pseudo à compléter à la main');
    }
    budget = s.dailyLimit - created.length;
    if (kinds.includes('creator') && s.youtube && wanted.has('youtube')) {
      for (const { niche, keywords } of s.creatorKeywords) {
        for (const kw of keywords) {
          if (budget <= 0) break;
          try {
            sources.youtube.searched++;
            const found = await searchCreators(kw, { maxResults: 25, minSubscribers: s.minSubscribers, maxSubscribers: s.maxSubscribers });
            sources.youtube.found += found.length;
            for (const c of found) {
              if (budget <= 0) break;
              const doc = await upsertCandidate({ ...c, niche }, runId);
              if (!doc) continue;
              sources.youtube.new++; if (doc.email) sources.youtube.withEmail++;
              if (doc.status === 'new') { created.push(doc); budget--; }
            }
          } catch (err) { sources.youtube.errors++; run.issues.push(`youtube « ${kw} » : ${err.message}`.slice(0, 200)); logger.warn(err.message); if (/quota/i.test(err.message)) break; }
          job.found = sources.youtube.found + sources.instagram.found + sources.meta.found; job.created = created.length;
        }
      }
    }
    job.step = 'qualification';
    const niches = await openNicheKeys();
    // Qualifie aussi les « new » restés en attente d'une exécution précédente (IA indisponible), dans la limite
    const pending = await Lead.find({ status: 'new', _id: { $nin: created.map(c => c._id) } }).sort({ createdAt: 1 }).limit(Math.max(0, s.dailyLimit - created.length));
    for (const lead of [...created, ...pending]) {
      if (!s.ai) break;
      const q = await qualifyOne(lead, niches);
      if (q.status !== 'new') { run.qualified++; job.qualified++; }
    }
    // Inscrits depuis : rattachement automatique
    const withEmail = await Lead.find({ email: { $ne: null }, status: { $nin: ['registered', 'excluded'] } }).select('_id email').lean();
    for (const l of withEmail) { const u = await User.findOne({ email: l.email }).select('_id').lean(); if (u) await Lead.updateOne({ _id: l._id }, { $set: { status: 'registered', registeredUserId: u._id } }); }
  } catch (err) {
    run.issues.push(`run : ${err.message}`.slice(0, 200));
    logger.error('runAcquisition failed:', err);
  }
  run.sources = sources; run.finishedAt = new Date();
  await run.save();
  job.running = false; job.finishedAt = run.finishedAt;
  setTimeout(() => progress.delete(runId), 3600000);
  logger.info(`Acquisition run ${runId}: ${JSON.stringify({ sources, qualified: run.qualified, issues: run.issues.length })}`);
  return { ran: true, runId, sources, qualified: run.qualified, issues: run.issues };
}

/** Tâche planifiée : une exécution par période de 20 h quand activé */
const RETENTION_MS = 24 * 30 * 86400000; // 24 mois après la dernière activité (politique de confidentialité, 2 ter)
/** Purge des prospects sans activité depuis 24 mois (hors comptes inscrits, conservés avec leur compte) */
export async function purgeOldLeads() {
  const r = await Lead.deleteMany({ updatedAt: { $lt: new Date(Date.now() - RETENTION_MS) }, status: { $ne: 'registered' } });
  if (r.deletedCount) logger.info(`Prospection : ${r.deletedCount} prospect(s) purgé(s) après 24 mois sans activité`);
  return r.deletedCount;
}

export async function runScheduledAcquisition() {
  await purgeOldLeads().catch(err => logger.warn(`purgeOldLeads: ${err.message}`));
  const enabled = await getSetting(SETTINGS.acquisitionEnabled.key, false);
  if (!enabled) return { ran: false, reason: 'disabled' };
  const last = await LeadRun.findOne({}).sort({ startedAt: -1 }).select('startedAt').lean();
  if (last && Date.now() - new Date(last.startedAt).getTime() < 20 * 3600000) return { ran: false, reason: 'recent' };
  setImmediate(() => runAcquisition({ trigger: 'scheduled' }).catch(err => logger.error('runScheduledAcquisition:', err)));
  return { ran: true, started: true };
}

/** Jeton Meta : date d'expiration (pour le rappel admin) */
export async function metaTokenInfo() {
  const { metaToken } = await import('./meta.js');
  const token = await metaToken();
  if (!token) return { configured: false };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
    const d = (await res.json()).data || {};
    return { configured: true, valid: !!d.is_valid, expiresAt: (d.expires_at || d.data_access_expires_at) ? new Date((d.expires_at || d.data_access_expires_at) * 1000) : null, scopes: d.scopes || [] }; // jeton prolongé : Meta ne renvoie parfois que la date de fin d'accès aux données
  } catch (err) { return { configured: true, valid: null, error: err.message }; }
}
