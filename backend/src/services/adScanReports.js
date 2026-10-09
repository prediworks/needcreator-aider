import crypto from 'crypto';
import AdScan from '../models/AdScan.js';
import AdScanSubscription from '../models/AdScanSubscription.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { sendScanReport, sendScanNewAds } from './email.js';
import { ensureScanForPage } from './adScan.js';
import logger from '../utils/logger.js';

/**
 * Rapport du scan par email (décision du 09/10/2026) : la marche la plus basse pour garder le contact avec les visiteurs de l'outil.
 * Une adresse sous un scan → le rapport tout de suite, puis une alerte par semaine au plus quand la marque lance de nouvelles publicités.
 * Les marques sans compte deviennent des fiches de prospection « Nouveau » (jamais poussées d'office) ; les créateurs et les inscrits, jamais.
 */
const DAY = 86400000;
const WEEK_DAYS = 6; // une vérification tous les 6 jours : l'email part le même jour de la semaine, à l'heure près
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|mac|orange|wanadoo|free|sfr|laposte|bbox|protonmail|proton|gmx|aol)\./i;
const fail = (status, message) => Object.assign(new Error(message), { status });
const adIds = (scan) => (scan.ads || []).map(a => String(a.id)).filter(Boolean);
const links = (scan, token) => ({ link: `${config.cors.origin}/publicites/${scan.slug}`, unsubscribeLink: `${config.cors.origin}/publicites-concurrents/desinscription?token=${token}` });

/** Rôle retenu : le compte s'il existe (connecté, ou adresse déjà inscrite), sinon ce que la personne a déclaré */
async function resolveRole(email, user, declared) {
  const account = user || await User.findOne({ email }).select('_id role').lean();
  if (account) return { userId: account._id, role: account.role === 'creator' ? 'creator' : account.role === 'brand' ? 'brand' : 'unknown' };
  return { userId: null, role: ['brand', 'creator'].includes(declared) ? declared : 'unknown' };
}

/** Marque sans compte : fiche de prospection « Nouveau », à relire par l'équipe (une adresse personnelle n'entre pas dans la file sans relecture) */
async function leadForSubscriber(email, scan) {
  const domain = email.split('@')[1] || '';
  const free = FREE_MAIL.test(domain);
  const day = new Date().toLocaleDateString('fr-FR');
  const note = `Abonné le ${day} au rapport du scan de ${scan.pageName} (se présente comme marque${free ? ', adresse personnelle' : ''})`;
  const existing = await Lead.findOne({ kind: 'brand', $or: [{ email }, { extraEmails: email }] });
  if (existing) {
    existing.notes = [existing.notes, note].filter(Boolean).join(' · ').slice(0, 2000);
    await existing.save();
    return existing;
  }
  const label = free ? '' : domain.replace(/^www\./, '').split('.').slice(0, -1).sort((a, b) => b.length - a.length)[0] || '';
  const name = label ? label.charAt(0).toUpperCase() + label.slice(1) : email;
  return Lead.create({
    kind: 'brand', source: 'manual', externalId: `scan-report:${email}`, name, email, website: free ? '' : `https://${domain}`, country: 'FR',
    status: 'new', score: 40, keyword: 'rapport scan', notes: note,
    description: `A laissé son adresse sous le scan des publicités de ${scan.pageName} pour recevoir le rapport et les nouvelles publicités.`,
  });
}

export async function subscribeToScan({ slug, email, role, user, ip }) {
  const scan = await AdScan.findOne({ slug: String(slug || '').toLowerCase() });
  if (!scan) throw fail(404, 'Scan introuvable');
  if (!['ready', 'empty'].includes(scan.status)) throw fail(400, 'La lecture est encore en cours : réessayez dans un instant');
  const addr = String(user?.email || email || '').trim().toLowerCase(); // connecté : l'adresse du compte, toujours
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) throw fail(400, 'Adresse email invalide');
  if (ip && await AdScanSubscription.countDocuments({ ip, createdAt: { $gte: new Date(Date.now() - 3600000) } }) >= 10) throw fail(429, 'Trop de demandes : réessayez dans une heure');
  const who = await resolveRole(addr, user, role);
  let sub = await AdScanSubscription.findOne({ email: addr, pageId: scan.pageId });
  const fresh = !sub;
  if (!sub) sub = new AdScanSubscription({ email: addr, pageId: scan.pageId, token: crypto.randomBytes(18).toString('hex'), lastAdIds: adIds(scan), ip });
  sub.set({ slug: scan.slug, pageName: scan.pageName, active: true, userId: who.userId || sub.userId, role: who.userId ? who.role : (sub.role !== 'unknown' ? sub.role : who.role) });
  if (sub.role === 'brand' && !sub.userId && !sub.leadId) {
    try { sub.leadId = (await leadForSubscriber(addr, scan))._id; } catch (err) { logger.warn(`scan report lead: ${err.message}`); }
  }
  sub.lastSentAt = new Date(); sub.lastCheckedAt = new Date(); sub.sentCount += 1;
  await sub.save();
  sendScanReport(addr, scan, links(scan, sub.token)).catch(err => logger.warn(`Scan report not sent to ${addr}: ${err.message}`));
  return { message: `Rapport envoyé à ${addr}. Vous serez prévenu quand ${scan.pageName} lancera de nouvelles publicités.`, renewed: !fresh };
}

/** Lien de l'email : plus aucun rapport ni alerte pour cette adresse, toutes marques confondues */
export async function unsubscribeScanReports(token) {
  const sub = await AdScanSubscription.findOne({ token: String(token || '') });
  if (!sub) return null;
  await AdScanSubscription.updateMany({ email: sub.email, active: true }, { $set: { active: false } });
  return { email: sub.email };
}

/**
 * Tâche planifiée : pour chaque page suivie, lecture Meta rafraîchie au plus tous les 6 jours, puis un email par abonné s'il y a du nouveau
 * (publicités inconnues au dernier email, ou qui viennent de passer les 90 jours). Rien de nouveau : rien n'est envoyé.
 */
export async function runScanReportAlerts({ maxPages = 30 } = {}) {
  const due = new Date(Date.now() - WEEK_DAYS * DAY);
  const subs = await AdScanSubscription.find({ active: true, $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: due } }] }).sort({ lastCheckedAt: 1 }).limit(400).lean();
  const byPage = new Map();
  for (const s of subs) { if (!byPage.has(s.pageId)) byPage.set(s.pageId, []); byPage.get(s.pageId).push(s); }
  let pages = 0, sent = 0, failed = 0;
  for (const [pageId, list] of [...byPage.entries()].slice(0, maxPages)) {
    const scan = await ensureScanForPage({ pageId, pageName: list[0].pageName }, { maxAgeDays: WEEK_DAYS });
    if (!scan || scan.status !== 'ready') continue; // lecture en cours ou page retirée : au prochain passage
    pages++;
    const ids = adIds(scan);
    for (const s of list) {
      const known = new Set(s.lastAdIds || []);
      const since = s.lastSentAt || s.createdAt;
      const newAds = (scan.ads || []).filter(a => a.id && !known.has(String(a.id)));
      const crossing = (scan.ads || []).filter(a => a.id && known.has(String(a.id)) && a.startedAt && a.startedAt <= new Date(Date.now() - 90 * DAY) && a.startedAt > new Date(since.getTime() - 90 * DAY));
      const update = { lastCheckedAt: new Date() };
      if (newAds.length || crossing.length) {
        // Envoi tenté une fois : une adresse qui rejette n'est pas réessayée chaque semaine sur les mêmes publicités
        try { await sendScanNewAds(s.email, scan, { newAds, crossing, ...links(scan, s.token) }); sent++; }
        catch (err) { failed++; logger.warn(`Scan alert not sent to ${s.email}: ${err.message}`); }
        await AdScanSubscription.updateOne({ _id: s._id }, { $set: { ...update, lastSentAt: new Date(), lastAdIds: ids }, $inc: { sentCount: 1 } });
        continue;
      }
      await AdScanSubscription.updateOne({ _id: s._id }, { $set: update });
    }
  }
  if (pages) logger.info(`Scan report alerts: ${pages} page(s) checked, ${sent} email(s) sent, ${failed} failed`);
  return { pages, sent, failed };
}

/** Admin : les abonnés au rapport, les plus récents d'abord */
export async function scanSubscribersStats() {
  const rows = await AdScanSubscription.find({}).sort({ createdAt: -1 }).limit(50).populate('leadId', 'name status').lean();
  const active = await AdScanSubscription.countDocuments({ active: true });
  return { active, rows: rows.map(s => ({ id: s._id, email: s.email, role: s.role, pageName: s.pageName, slug: s.slug, active: s.active, member: !!s.userId, lead: s.leadId ? { id: s.leadId._id, name: s.leadId.name, status: s.leadId.status } : null, sentCount: s.sentCount || 0, lastSentAt: s.lastSentAt, createdAt: s.createdAt })) };
}
