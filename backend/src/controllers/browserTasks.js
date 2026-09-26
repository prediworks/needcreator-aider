import Joi from 'joi';
import { createBatch, batchFromPostsWithoutAuthor, batchFromProfilesWithoutEmail, batchFromAdLibrary, batchFromHashtags, batchFromPartnershipHashtags, batchFromTiktokAds, listBatches, batchDetail, cancelBatch, claimNextTask, submitTaskResult, queueStatus, getExtensionToken, rotateExtensionToken, checkExtensionToken } from '../services/browserTasks.js';
import logger from '../utils/logger.js';

/* ---------- Côté extension : jeton dédié (en-tête X-Extension-Token) ---------- */

export async function extensionAuth(req, res, next) {
  try {
    const given = req.get('X-Extension-Token') || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!(await checkExtensionToken(given))) return res.status(401).json({ error: 'Jeton d\'extension invalide : copiez-le depuis Admin → Prospection → Extension Chrome' });
    next();
  } catch (error) { next(error); }
}

const typesOf = (req) => String(req.query.types || '').split(',').map(t => t.trim()).filter(Boolean);
export async function nextTask(req, res) {
  try {
    const types = typesOf(req);
    const task = await claimNextTask({ types });
    const status = await queueStatus({ types });
    res.json({ task, ...status });
  } catch (error) { logger.error('nextTask failed:', error); res.status(500).json({ error: 'File indisponible' }); }
}

const resultSchema = Joi.object({
  url: Joi.string().uri().max(1000).allow(''),
  finalUrl: Joi.string().max(1000).allow(''),
  title: Joi.string().max(1000).allow(''),
  text: Joi.string().max(200000).allow(''),
  links: Joi.array().items(Joi.object({ href: Joi.string().max(2000).allow(''), text: Joi.string().max(500).allow('') })).max(2000),
  blocked: Joi.string().valid('login', 'captcha', 'restricted', 'consent', 'error').allow(null),
  prefilled: Joi.boolean(),
  copied: Joi.boolean(),
  error: Joi.string().max(500).allow(''),
  meta: Joi.object({ description: Joi.string().max(2000).allow(''), ogTitle: Joi.string().max(500).allow(''), ogDescription: Joi.string().max(2000).allow('') }).unknown(true),
  self: Joi.string().max(40).allow('', null),
  emails: Joi.array().items(Joi.string().max(120)).max(20),
}).unknown(true);

export async function taskResult(req, res) {
  try {
    const { error, value } = resultSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: `Résultat illisible : ${error.message}` });
    const r = await submitTaskResult(req.params.id, value);
    res.json(r);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    logger.error('taskResult failed:', error); res.status(500).json({ error: 'Résultat non enregistré' });
  }
}

export async function extensionStatus(req, res) {
  try { res.json({ ok: true, ...(await queueStatus({ types: typesOf(req) })) }); }
  catch (error) { res.status(500).json({ error: 'File indisponible' }); }
}

/* ---------- Côté admin ---------- */

export async function tokenView(req, res) {
  try { res.json({ token: await getExtensionToken() }); }
  catch (error) { res.status(500).json({ error: 'Jeton indisponible' }); }
}

export async function tokenRotate(req, res) {
  try { res.json({ token: await rotateExtensionToken(req.user._id), message: 'Nouveau jeton généré : l\'ancien ne fonctionne plus, mettez-le à jour dans l\'extension' }); }
  catch (error) { res.status(500).json({ error: 'Jeton non généré' }); }
}

const batchSchema = Joi.object({
  preset: Joi.string().valid('posts_without_author', 'profiles_without_email', 'ad_library', 'hashtags', 'partnerships', 'tiktok_ads', 'custom').required(),
  limit: Joi.number().integer().min(1).max(100),
  keywords: Joi.array().items(Joi.string().max(60)).max(12),
  hashtags: Joi.array().items(Joi.string().max(60)).max(10),
  count: Joi.number().integer().min(1).max(50),
  country: Joi.string().length(2).uppercase(),
  niche: Joi.string().max(60).allow(''),
  label: Joi.string().max(160),
  kind: Joi.string().valid('creator', 'brand'),
  origin: Joi.string().max(60).allow(''),
  items: Joi.array().items(Joi.object({ type: Joi.string().required(), url: Joi.string().uri().max(1000), query: Joi.string().max(100), count: Joi.number().integer().min(1).max(50), leadId: Joi.string().hex().length(24), postUrl: Joi.string().uri().max(1000), purpose: Joi.string().valid('creators', 'brands') })).max(200),
});

export async function createBatchView(req, res) {
  try {
    const { error, value } = batchSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: error.message });
    const createdBy = req.user._id;
    let batch = null;
    if (value.preset === 'posts_without_author') batch = await batchFromPostsWithoutAuthor({ limit: value.limit || 60, createdBy });
    else if (value.preset === 'profiles_without_email') batch = await batchFromProfilesWithoutEmail({ limit: value.limit || 60, createdBy });
    else if (value.preset === 'ad_library') batch = await batchFromAdLibrary({ keywords: value.keywords, count: value.count || 15, country: value.country || 'FR', createdBy });
    else if (value.preset === 'hashtags') batch = await batchFromHashtags({ hashtags: value.hashtags, count: value.count || 20, createdBy });
    else if (value.preset === 'partnerships') batch = await batchFromPartnershipHashtags({ hashtags: value.hashtags, count: value.count || 20, createdBy });
    else if (value.preset === 'tiktok_ads') batch = await batchFromTiktokAds({ keywords: value.keywords, count: value.count || 15, country: value.country || 'FR', createdBy });
    else batch = await createBatch({ label: value.label || 'Lot personnalisé', kind: value.kind, origin: value.origin, niche: value.niche, items: value.items, createdBy });
    if (!batch) return res.status(404).json({ error: 'Rien à traiter pour ce lot : aucune fiche ne correspond (ou déjà remises il y a moins de 30 jours)' });
    res.status(201).json({ batch, message: `Lot créé : ${batch.counts.total} tâche(s). Lancez l'extension dans Chrome, elle les traitera une par une.` });
  } catch (error) { logger.error('createBatch failed:', error); res.status(500).json({ error: `Lot non créé : ${error.message}` }); }
}

export async function listBatchesView(req, res) {
  try { res.json({ batches: await listBatches({ limit: 20 }), ...(await queueStatus()) }); }
  catch (error) { res.status(500).json({ error: 'Lots indisponibles' }); }
}

export async function batchDetailView(req, res) {
  try {
    const d = await batchDetail(req.params.id);
    if (!d) return res.status(404).json({ error: 'Lot introuvable' });
    res.json(d);
  } catch (error) { res.status(500).json({ error: 'Lot indisponible' }); }
}

export async function cancelBatchView(req, res) {
  try { const n = await cancelBatch(req.params.id); res.json({ message: `${n} tâche(s) annulée(s)` }); }
  catch (error) { res.status(500).json({ error: 'Annulation impossible' }); }
}
