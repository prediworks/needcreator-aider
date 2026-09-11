import User from '../models/User.js';
import Delivery from '../models/Delivery.js';
import Report from '../models/Report.js';
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
