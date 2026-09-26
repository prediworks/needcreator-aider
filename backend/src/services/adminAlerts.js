import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import Report from '../models/Report.js';
import Campaign from '../models/Campaign.js';
import Lead from '../models/Lead.js';
import ExternalQuote from '../models/ExternalQuote.js';
import Prospect from '../models/Prospect.js';
import BrowserTask from '../models/BrowserTask.js';
import { config } from '../config/index.js';
import { getSetting, setSetting } from '../models/Setting.js';
import logger from '../utils/logger.js';

const DIGEST_KEY = 'adminDigestLastAt';

/** Destinataires : ADMIN_ALERT_EMAIL (liste séparée par des virgules) sinon tous les comptes admin */
export async function adminRecipients() {
  if (config.admin.alertEmails.length) return config.admin.alertEmails;
  const admins = await User.find({ role: 'admin', status: 'active' }).select('email').lean();
  return admins.map(a => a.email);
}

export async function notifyAdmins(subject, html) {
  try {
    const to = await adminRecipients();
    if (!to.length) { logger.warn(`Alerte admin sans destinataire : ${subject}`); return false; }
    const { sendEmail } = await import('./email.js');
    await sendEmail(to.join(','), `[NeedCreator admin] ${subject}`, html);
    return true;
  } catch (err) {
    logger.error(`Alerte admin non envoyée (${subject}) : ${err?.message || err}`);
    return false;
  }
}

/**
 * Récapitulatif quotidien de ce qui attend une action humaine. Envoyé au plus une fois par 24 h, et seulement s'il y a quelque chose.
 */
export async function sendAdminDigest({ force = false } = {}) {
  const last = await getSetting(DIGEST_KEY, null);
  if (!force && last && Date.now() - new Date(last).getTime() < 24 * 3600000) return { sent: false, reason: 'déjà envoyé' };
  const h48 = new Date(Date.now() - 48 * 3600000);
  const d7 = new Date(Date.now() - 7 * 86400000);
  const [pendingCreators, pendingBusiness, pendingAmbassadors, openReports, deferredTransfers, lateOffered, failedTransfers] = await Promise.all([
    User.countDocuments({ role: 'creator', status: 'pending', createdAt: { $lte: h48 } }),
    User.countDocuments({ role: 'brand', 'verification.business.status': 'pending', 'verification.business.checkedAt': { $lte: h48 } }),
    User.countDocuments({ role: 'creator', 'profile.ambassador.status': 'pending', 'profile.ambassador.submittedAt': { $lte: h48 } }),
    Report.countDocuments({ status: 'open' }),
    Delivery.countDocuments({ status: { $in: ['approved', 'auto_approved'] }, 'payment.status': 'captured', 'payment.creatorAmount': { $gt: 0 }, approvedAt: { $lte: d7 } }),
    Delivery.countDocuments({ status: 'pending', 'replacement.status': 'offered' }),
    Delivery.countDocuments({ status: { $in: ['approved', 'auto_approved'] }, 'payment.status': 'captured', 'payment.creatorAmount': { $gt: 0 } }),
  ]);
  const items = [
    [pendingCreators, `créateur(s) en attente de validation depuis plus de 48 h`, '/admin'],
    [pendingBusiness, `marque(s) en attente de vérification manuelle depuis plus de 48 h`, '/admin'],
    [pendingAmbassadors, `vidéo(s) Ambassadeur à valider depuis plus de 48 h`, '/admin'],
    [openReports, `signalement(s) ouvert(s)`, '/admin'],
    [deferredTransfers, `virement(s) au créateur en attente depuis plus de 7 jours (compte Stripe non connecté ou virement en échec)`, '/admin'],
    [lateOffered, `mission(s) en retard avec remplacement proposé à la marque`, '/admin'],
  ].filter(([n]) => n > 0);
  const summary = { pendingCreators, pendingBusiness, pendingAmbassadors, openReports, deferredTransfers, lateOffered, failedTransfers };
  if (!items.length) { await setSetting(DIGEST_KEY, new Date().toISOString()); return { sent: false, reason: 'rien à signaler', summary }; }
  const html = `
    <h1>À traiter aujourd'hui</h1>
    <ul>${items.map(([n, label, path]) => `<li><strong>${n}</strong> ${label} — <a href="${config.cors.origin}${path}">ouvrir</a></li>`).join('')}</ul>
    <p style="color:#666;font-size:13px">Récapitulatif automatique, envoyé au plus une fois par jour quand il y a quelque chose à faire.</p>
  `;
  const sent = await notifyAdmins(`${items.reduce((a, [n]) => a + n, 0)} élément(s) à traiter`, html);
  if (sent) await setSetting(DIGEST_KEY, new Date().toISOString());
  return { sent, summary };
}

/** Alerte immédiate : virement au créateur en échec (argent encaissé, non versé) */
export async function alertTransferFailed(delivery, error) {
  return notifyAdmins('Virement créateur en échec', `
    <h1>Virement en échec</h1>
    <p>Le paiement de la mission <a href="${config.cors.origin}/deliveries/${delivery._id}">${delivery._id}</a> est encaissé (${delivery.payment?.creatorAmount} € à verser) mais le virement au créateur a échoué :</p>
    <p><code>${String(error || 'erreur inconnue')}</code></p>
    <p>Il sera retenté automatiquement toutes les heures. Vérifiez le compte Stripe Connect du créateur si l'erreur persiste.</p>
  `);
}

/** Alerte immédiate : nouveau signalement */
export async function alertNewReport(report, reporter) {
  return notifyAdmins(`Nouveau signalement (${report.targetType})`, `
    <h1>Nouveau signalement</h1>
    <p>${reporter?.profile?.companyName || reporter?.profile?.name || 'Un utilisateur'} a signalé un(e) ${report.targetType} : <strong>${report.reason}</strong></p>
    ${report.details ? `<p>${report.details}</p>` : ''}
    <p><a href="${config.cors.origin}/admin">Traiter dans l'administration</a></p>
  `);
}

const WEEKLY_KEY = 'adminWeeklyLastAt';

/** Chiffres d'une fenêtre [from, to) : inscrits, prospects, mailing, messages privés, extension, campagnes, outils créateurs */
export async function weeklyFigures(from, to) {
  const w = { $gte: from, $lt: to };
  const [creators, brands, leadsCreator, leadsBrand, leadsWithEmail, pushed, replies, interested, dms, extDone, extEmails, campaigns, deliveries, quotes, prospects] = await Promise.all([
    User.countDocuments({ role: 'creator', createdAt: w }),
    User.countDocuments({ role: 'brand', createdAt: w }),
    Lead.countDocuments({ kind: 'creator', createdAt: w }),
    Lead.countDocuments({ kind: 'brand', createdAt: w }),
    Lead.countDocuments({ createdAt: w, email: { $nin: [null, ''] } }),
    Lead.countDocuments({ 'mailing.pushedAt': w }),
    Lead.countDocuments({ 'mailing.replyAt': w }),
    Lead.countDocuments({ 'mailing.replyAt': w, 'mailing.replyIntent': 'interested' }),
    Lead.countDocuments({ contactedAt: w, contactedVia: { $in: ['instagram', 'tiktok', 'linkedin'] } }),
    BrowserTask.countDocuments({ status: 'done', finishedAt: w }),
    BrowserTask.countDocuments({ status: 'done', finishedAt: w, 'extracted.email': { $nin: [null, ''] } }),
    Campaign.countDocuments({ 'timeline.publishedAt': w }),
    Delivery.countDocuments({ createdAt: w }),
    ExternalQuote.countDocuments({ createdAt: w }),
    Prospect.countDocuments({ createdAt: w }),
  ]);
  return { creators, brands, leadsCreator, leadsBrand, leadsWithEmail, pushed, replies, interested, dms, extDone, extEmails, campaigns, deliveries, quotes, prospects };
}

/**
 * Bilan hebdomadaire envoyé aux administrateurs le lundi (au plus une fois par 7 jours), ou à la demande (force).
 * Semaine écoulée comparée à la précédente.
 */
export async function sendWeeklyReport({ force = false } = {}) {
  const last = await getSetting(WEEKLY_KEY, null);
  const now = new Date();
  if (!force) {
    if (now.getDay() !== 1) return { sent: false, reason: 'pas lundi' };
    if (last && now.getTime() - new Date(last).getTime() < 6 * 86400000) return { sent: false, reason: 'déjà envoyé cette semaine' };
  }
  const to = now, from = new Date(now.getTime() - 7 * 86400000), prev = new Date(now.getTime() - 14 * 86400000);
  const [cur, before, totals] = await Promise.all([weeklyFigures(from, to), weeklyFigures(prev, from), Promise.all([
    User.countDocuments({ role: 'creator', status: { $in: ['active', 'pending'] } }), User.countDocuments({ role: 'brand', status: 'active' }), Campaign.countDocuments({ status: 'active' }), Lead.countDocuments({ status: { $nin: ['rejected', 'excluded'] } }),
  ])]);
  const rows = [
    ['Créateurs inscrits', cur.creators, before.creators], ['Marques inscrites', cur.brands, before.brands],
    ['Prospects créateurs trouvés', cur.leadsCreator, before.leadsCreator], ['Prospects marques trouvés', cur.leadsBrand, before.leadsBrand], ['dont avec email', cur.leadsWithEmail, before.leadsWithEmail],
    ['Envoyés au mailing', cur.pushed, before.pushed], ['Réponses reçues', cur.replies, before.replies], ['dont intéressés', cur.interested, before.interested],
    ['Messages privés faits à la main', cur.dms, before.dms],
    ['Pages lues par l\'extension', cur.extDone, before.extDone], ['dont emails relevés', cur.extEmails, before.extEmails],
    ['Campagnes publiées', cur.campaigns, before.campaigns], ['Livraisons', cur.deliveries, before.deliveries],
    ['Devis clients créés (créateurs)', cur.quotes, before.quotes], ['Prospects suivis (créateurs)', cur.prospects, before.prospects],
  ];
  const arrow = (a, b) => a > b ? '↑' : a < b ? '↓' : '=';
  const html = `
    <h1>Bilan de la semaine</h1>
    <p>Du ${from.toLocaleDateString('fr-FR')} au ${to.toLocaleDateString('fr-FR')}, comparé à la semaine précédente.</p>
    <table style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px">
      <tr><th style="text-align:left;padding:4px 8px;border-bottom:1px solid #e5e7eb"></th><th style="padding:4px 8px;border-bottom:1px solid #e5e7eb">Cette semaine</th><th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Précédente</th></tr>
      ${rows.map(([l, a, b]) => `<tr><td style="padding:4px 8px;${l.startsWith('dont') ? 'color:#6b7280;padding-left:20px' : ''}">${l}</td><td style="padding:4px 8px;text-align:center"><strong>${a}</strong> <span style="color:#9ca3af">${arrow(a, b)}</span></td><td style="padding:4px 8px;text-align:center;color:#6b7280">${b}</td></tr>`).join('')}
    </table>
    <p style="margin-top:16px"><strong>Où en est la plateforme</strong> : ${totals[0]} créateurs, ${totals[1]} marques, ${totals[2]} campagne(s) ouverte(s), ${totals[3]} prospects actifs.</p>
    <p style="color:#666;font-size:13px">Envoyé chaque lundi. Les mêmes chiffres sont dans l'administration.</p>
  `;
  const sent = await notifyAdmins(`Bilan de la semaine : ${cur.creators + cur.brands} inscrit(s), ${cur.replies} réponse(s), ${cur.campaigns} campagne(s)`, html);
  if (sent) await setSetting(WEEKLY_KEY, now.toISOString());
  return { sent, cur, before, totals };
}
