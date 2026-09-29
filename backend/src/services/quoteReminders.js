import ExternalQuote from '../models/ExternalQuote.js';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import User from '../models/User.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { sendExternalQuoteReminder } from './email.js';
import { notify } from './notifications.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Relance du devis client resté sans réponse : automatique (délai et nombre réglés dans l'admin, désactivable devis par devis)
 * ou envoyée à la main par le créateur. Trois rappels au plus par devis, deux jours au moins entre deux messages au client.
 * Jamais pour une candidature spontanée en vidéo : la marque n'a rien demandé, l'email de proposition lui promet qu'elle ne sera pas relancée.
 */
export const MAX_REMINDERS = 3;
export const MIN_GAP_DAYS = 2;
const DAY = 86400000;
const fail = (status, message) => Object.assign(new Error(message), { status });

const lastContact = (q) => new Date(q.reminders?.lastAt || q.sentAt || q.createdAt);
const expired = (q) => !!q.quote?.validUntil && new Date(q.quote.validUntil) < new Date();
export const isShowcaseQuote = async (q) => !!(await ShowcaseVideo.exists({ quoteId: q._id }));

/** Ce que le créateur peut faire sur ce devis : relancer maintenant, ou pourquoi pas */
export function reminderState(q, { showcase = false } = {}) {
  const count = q.reminders?.count || 0;
  const base = { count, max: MAX_REMINDERS, lastAt: q.reminders?.lastAt || null, auto: q.reminders?.auto !== false, showcase };
  if (q.status !== 'sent') return { ...base, canRemind: false, why: '' };
  if (showcase) return { ...base, canRemind: false, auto: false, why: 'Une candidature spontanée ne se relance pas : la marque n\'a rien demandé.' };
  if (!q.client?.email) return { ...base, canRemind: false, why: 'Il manque : l\'adresse email du client.' };
  if (expired(q)) return { ...base, canRemind: false, why: 'Ce devis a expiré : modifiez sa date de validité puis renvoyez-le.' };
  if (count >= MAX_REMINDERS) return { ...base, canRemind: false, why: `Ce client a déjà reçu ${MAX_REMINDERS} rappels : un de plus le ferait fuir.` };
  const next = new Date(lastContact(q).getTime() + MIN_GAP_DAYS * DAY);
  if (next > new Date()) return { ...base, canRemind: false, nextAt: next, why: `Dernier message au client le ${lastContact(q).toLocaleDateString('fr-FR')} : attendez le ${next.toLocaleDateString('fr-FR')} pour le relancer.` };
  return { ...base, canRemind: true, why: '' };
}

/** Envoie le rappel et l'inscrit sur le devis */
async function remind(q, creator, { message = '' } = {}) {
  await sendExternalQuoteReminder(q.client.email, q.client.contactName || q.client.companyName, creator.profile?.name || 'Un créateur', q.mission.title, q.quote.price, `${config.cors.origin}/q/${q.token}`, { validUntil: q.quote.validUntil, message, sentAt: q.sentAt });
  q.reminders = { count: (q.reminders?.count || 0) + 1, lastAt: new Date(), auto: q.reminders?.auto !== false };
  await q.save();
  return q;
}

/** Relance à la main par le créateur, avec un mot facultatif */
export async function remindQuoteManually(q, creator, message = '') {
  const st = reminderState(q, { showcase: await isShowcaseQuote(q) });
  if (!st.canRemind) throw fail(400, st.why || 'Ce devis ne peut pas être relancé');
  try { await remind(q, creator, { message: String(message || '').trim().slice(0, 600) }); }
  catch (err) { logger.warn(`Quote reminder ${q._id}: ${err.message}`); throw fail(502, `Envoi impossible à ${q.client.email} : adresse refusée par le serveur d'envoi. Vérifiez l'adresse du client.`); }
  return q;
}

/** Tâche planifiée : devis envoyés, sans réponse depuis le délai réglé ; le créateur est prévenu de chaque rappel */
export async function runQuoteReminders() {
  const days = await getSetting(SETTINGS.reminderExternalQuoteDays.key, SETTINGS.reminderExternalQuoteDays.default);
  if (!days) return 0;
  const max = Math.min(MAX_REMINDERS, await getSetting(SETTINGS.reminderExternalQuoteMax.key, SETTINGS.reminderExternalQuoteMax.default) || 1);
  const before = new Date(Date.now() - days * DAY);
  const due = await ExternalQuote.find({
    // Pas de rappel sur un devis envoyé il y a plus de 30 jours : il serait incongru (et la mise en service ne réveille pas les anciens devis)
    status: 'sent', 'client.email': { $nin: [null, ''] }, sentAt: { $lte: before, $gte: new Date(Date.now() - 30 * DAY) }, 'reminders.auto': { $ne: false },
    $and: [{ $or: [{ 'reminders.count': { $exists: false } }, { 'reminders.count': { $lt: max } }] }, { $or: [{ 'reminders.lastAt': null }, { 'reminders.lastAt': { $lte: before } }] }, { $or: [{ 'quote.validUntil': null }, { 'quote.validUntil': { $gte: new Date() } }] }],
  }).limit(200);
  let sent = 0;
  for (const q of due) {
    try {
      if (await isShowcaseQuote(q)) continue;
      const creator = await User.findById(q.creatorId).select('status profile.name').lean();
      if (!creator || ['suspended', 'banned', 'deleted'].includes(creator.status)) continue;
      await remind(q, creator);
      sent++;
      const last = q.reminders.count >= max;
      notify(q.creatorId, { type: 'application', title: `${q.client.companyName} a reçu un rappel de votre devis`, text: `${q.mission.title} · ${q.quote.price} € HT · rappel ${q.reminders.count} sur ${max}${last ? '. Sans réponse, un appel ou un message direct reste le plus efficace.' : ''}`, href: '/quotes' }).catch(() => {});
    } catch (err) {
      // Adresse refusée : le rappel est compté pour ne pas être retenté à chaque passage
      logger.warn(`Quote reminder ${q._id} not sent: ${err.message}`);
      await ExternalQuote.updateOne({ _id: q._id }, { $set: { 'reminders.lastAt': new Date() }, $inc: { 'reminders.count': 1 } }).catch(() => {});
      notify(q.creatorId, { type: 'application', title: `Rappel de devis non remis à ${q.client.companyName}`, text: `L'adresse ${q.client.email} a été refusée par le serveur d'envoi : vérifiez-la, puis renvoyez le devis.`, href: '/quotes' }).catch(() => {});
    }
  }
  if (sent) logger.info(`Quote reminders: ${sent} sent`);
  return sent;
}
