import AdScan from '../models/AdScan.js';
import { runScan, serializeScan, briefFromScan, indexable, scanSettings, ensureInsights, requestAudit } from '../services/adScan.js';
import { notifyAdmins } from '../services/adminAlerts.js';
import logger from '../utils/logger.js';

const clientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
const fail = (res, error, fallback, label) => {
  if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
  if (error.code === 10 || error.code === 190) return res.status(503).json({ error: 'Lecture des publicités indisponible pour le moment (accès Meta à renouveler)', code: 'META_OFF' });
  logger.error(`${label} failed:`, error);
  return res.status(500).json({ error: fallback });
};

/** Public (compte facultatif) : lance ou relit le scan d'une marque. { q } ou { pageId } → { scan } ou { candidates } */
export async function createScan(req, res) {
  try {
    const r = await runScan({ q: req.body?.q, pageId: req.body?.pageId, pageName: req.body?.pageName, ip: clientIp(req), user: req.user });
    if (r.candidates) return res.json({ candidates: r.candidates });
    res.status(r.cached ? 200 : 201).json({ scan: await serializeScan(r.scan, { user: req.user }) });
  } catch (error) { fail(res, error, 'Lecture impossible pour le moment, réessayez dans quelques minutes', 'createScan'); }
}

/** Public : un scan par son adresse. `indexable` dit à la page si elle peut être référencée. */
export async function getScan(req, res) {
  try {
    const scan = await AdScan.findOne({ slug: String(req.params.slug || '').toLowerCase() });
    if (!scan) return res.status(404).json({ error: 'Scan introuvable' });
    const st = await scanSettings();
    const { isBlockedPage } = await import('../services/adScan.js');
    if (scan.status === 'blocked' || isBlockedPage(st.scanBlockedPages, scan)) return res.status(410).json({ error: 'Cette marque a demandé à ne pas apparaître dans l\'outil.', code: 'BLOCKED' });
    await ensureInsights(scan); // publicités sans lecture IA : la lecture repart en arrière-plan, la page suit
    res.json({ scan: await serializeScan(scan, { user: req.user, settings: st }), indexable: indexable(scan) });
  } catch (error) { fail(res, error, 'Lecture impossible', 'getScan'); }
}

/** Public : consultation par un navigateur (compteur ; première consultation = condition d'indexation) */
export async function viewScan(req, res) {
  try {
    const scan = await AdScan.findOneAndUpdate({ slug: String(req.params.slug || '').toLowerCase() }, { $inc: { views: 1 }, $min: { humanViewedAt: new Date() } }, { new: true }).select('slug views humanViewedAt status ads');
    if (!scan) return res.status(404).json({ error: 'Scan introuvable' });
    res.json({ views: scan.views, indexable: indexable(scan) });
  } catch (error) { fail(res, error, 'Enregistrement impossible', 'viewScan'); }
}

/** Public (compte facultatif) : « Commander l'équivalent » → brief NeedCreator (repris à l'inscription ou par une marque connectée) */
export async function briefFromScanHandler(req, res) {
  try {
    const scan = await AdScan.findOne({ slug: String(req.params.slug || '').toLowerCase() });
    if (!scan) return res.status(404).json({ error: 'Scan introuvable' });
    const proposal = req.body?.proposal === undefined || req.body?.proposal === null || req.body?.proposal === '' ? undefined : Number(req.body.proposal);
    const pb = await briefFromScan(scan, { adId: req.body?.adId, proposal, ip: clientIp(req), user: req.user });
    res.status(201).json({ briefId: pb._id, message: 'Brief préparé : relisez-le, puis créez la campagne.' });
  } catch (error) { fail(res, error, 'Préparation du brief impossible pour le moment', 'briefFromScan'); }
}

/** Public : une marque demande à ne plus apparaître. Rien n'est retiré d'office : l'équipe reçoit la demande et règle la liste des pages retirées. */
export async function optOutScan(req, res) {
  try {
    const scan = await AdScan.findOne({ slug: String(req.params.slug || '').toLowerCase() }).select('slug pageName pageId');
    if (!scan) return res.status(404).json({ error: 'Scan introuvable' });
    const email = String(req.body?.email || '').trim().slice(0, 160); const reason = String(req.body?.reason || '').trim().slice(0, 1000);
    const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    await notifyAdmins(`Scan concurrentiel : demande de retrait « ${scan.pageName} »`, `<p>Page Meta <strong>${esc(scan.pageName)}</strong> (identifiant ${esc(scan.pageId)}), scan <code>/publicites/${esc(scan.slug)}</code>.</p><p>Demandeur : ${esc(email) || 'non indiqué'}<br/>Motif : ${esc(reason) || 'non indiqué'}</p><p>Pour retirer la page : Admin → Réglages → Scan concurrentiel → « Pages retirées », ajouter <code>${esc(scan.pageId)}</code>.</p>`);
    res.json({ message: 'Demande transmise à l\'équipe : la page sera retirée sous 48 h ouvrées.' });
  } catch (error) { fail(res, error, 'Envoi impossible', 'optOutScan'); }
}

/** Public : les exemples (épinglés dans les réglages, puis les plus consultés) sur les pages de l'outil */
export async function recentScans(req, res) {
  try {
    const st = await scanSettings();
    const { isBlockedPage, slugify } = await import('../services/adScan.js');
    const pinned = String(st.scanPinned || '').split(/[,;\n]+/).map(x => slugify(x.trim().replace(/^.*\/publicites\//, ''))).filter(x => x && x !== 'marque');
    const fields = 'slug pageName totalActive stats.oldestDays views fetchedAt pageId';
    const [pins, popular] = await Promise.all([
      pinned.length ? AdScan.find({ slug: { $in: pinned }, status: 'ready' }).select(fields).lean() : [],
      AdScan.find({ status: 'ready', humanViewedAt: { $ne: null } }).sort({ views: -1, fetchedAt: -1 }).limit(24).select(fields).lean(),
    ]);
    const ordered = [...pinned.map(p => pins.find(x => x.slug === p)).filter(Boolean).map(x => ({ ...x, pinned: true })), ...popular.filter(x => !pinned.includes(x.slug))];
    res.json({ scans: ordered.filter(s => !isBlockedPage(st.scanBlockedPages, s)).slice(0, 12).map(s => ({ slug: s.slug, pageName: s.pageName, totalActive: s.totalActive || 0, oldestDays: s.stats?.oldestDays ?? null, views: s.views || 0, fetchedAt: s.fetchedAt, pinned: !!s.pinned })) });
  } catch (error) { fail(res, error, 'Lecture impossible', 'recentScans'); }
}

/** Compte connecté : ses derniers scans (tableau de bord marque) */
export async function myScans(req, res) {
  try {
    const { AdScanRequest } = await import('../models/AdScan.js');
    const reqs = await AdScanRequest.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30).select('slug createdAt').lean();
    const slugs = [...new Set(reqs.map(r => r.slug).filter(Boolean))].slice(0, 6);
    const scans = slugs.length ? await AdScan.find({ slug: { $in: slugs }, status: { $in: ['ready', 'pending'] } }).select('slug pageName totalActive stats.oldestDays status fetchedAt').lean() : [];
    res.json({ scans: slugs.map(sl => scans.find(x => x.slug === sl)).filter(Boolean).map(s => ({ slug: s.slug, pageName: s.pageName, totalActive: s.totalActive || 0, oldestDays: s.stats?.oldestDays ?? null, status: s.status, fetchedAt: s.fetchedAt })) });
  } catch (error) { fail(res, error, 'Lecture impossible', 'myScans'); }
}

/** Public (compte facultatif) : audit créatif d'une page déjà scannée, lancé en arrière-plan ; la page suit avec `auditPending` */
export async function auditScan(req, res) {
  try {
    const scan = await AdScan.findOne({ slug: String(req.params.slug || '').toLowerCase() });
    if (!scan) return res.status(404).json({ error: 'Scan introuvable' });
    const r = await requestAudit(scan);
    res.status(r.started ? 202 : 200).json({ started: r.started, scan: await serializeScan(scan, { user: req.user }) });
  } catch (error) { fail(res, error, 'Audit impossible pour le moment', 'auditScan'); }
}

/** Public : visite venue d'un lien de l'email marques (ref) ; ne renvoie rien d'autre qu'un accusé de réception */
export async function trackRef(req, res) {
  try { const { trackScanRef } = await import('../services/adScan.js'); await trackScanRef(req.body?.ref, { action: req.body?.action, slug: req.body?.slug }); res.json({ ok: true }); }
  catch (error) { logger.warn(`trackRef: ${error.message}`); res.json({ ok: true }); }
}

/** Admin : activité de l'outil et marques les plus scannées */
export async function adminScanStatsView(req, res) {
  try { const { adminScanStats } = await import('../services/adScan.js'); res.json(await adminScanStats()); }
  catch (error) { fail(res, error, 'Statistiques indisponibles', 'adminScanStats'); }
}

/** Admin : mettre en prospection une marque scannée */
export async function adminProspectFromScan(req, res) {
  try {
    const { prospectFromScan } = await import('../services/adScan.js');
    const r = await prospectFromScan(req.body?.slug, { createdBy: req.user._id });
    res.status(r.created ? 201 : 200).json({ lead: r.lead, message: r.created ? `Fiche créée : ${r.lead.name}${r.tier === 'large' ? ' (grande marque, signalée)' : ''}. Qualification, site et email en arrière-plan.` : `Déjà en prospection : ${r.lead.name}. La note de l'outil de scan est ajoutée à la fiche.` });
  } catch (error) { fail(res, error, 'Mise en prospection impossible', 'adminProspectFromScan'); }
}
