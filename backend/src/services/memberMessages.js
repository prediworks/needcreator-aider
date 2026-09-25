import User from '../models/User.js';
import ExternalQuote from '../models/ExternalQuote.js';
import { MemberMessageLog, MemberBroadcast } from '../models/MemberMessage.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { sendEmail, button } from './email.js';
import { notify } from './notifications.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Messages aux inscrits : séquence d'accueil (J+N après l'inscription, réglable dans l'admin) et annonces ponctuelles (bouton admin).
 * Email depuis needcreator.com + cloche dans l'application ; une trace par personne et par message, jamais deux envois.
 */

export const ONBOARDING_KEYS = [1, 2, 3];
const SITE = () => config.cors.origin;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const firstName = (user) => String(user?.profile?.name || '').trim().split(/\s+/)[0] || '';

/** {{prenom}} et {{nom}} ; texte brut → paragraphes, lignes « - » → liste, liens en clair conservés */
export function renderMemberBody(body, user) {
  const text = String(body || '').replace(/\{\{\s*prenom\s*\}\}/gi, firstName(user)).replace(/\{\{\s*nom\s*\}\}/gi, String(user?.profile?.name || ''));
  const plain = text.replace(/\*\*/g, '');
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const html = blocks.map(b => {
    const lines = b.split('\n');
    // Liste : « Nom de l'outil : explication » → nom en gras ; partout : **gras** accepté
    if (lines.every(l => /^\s*-\s+/.test(l))) return `<ul style="margin:0 0 12px 18px;padding:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#374151">${lines.map(l => `<li style="margin:0 0 6px">${emphasize(linkify(esc(l.replace(/^\s*-\s+/, ''))).replace(/^([^:<]{2,60}) : /, '<strong style="color:#111827">$1</strong> : '))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(l => emphasize(linkify(esc(l)))).join('<br>')}</p>`;
  }).join('');
  return { html, text: plain };
}
const emphasize = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#111827">$1</strong>');
const linkify = (s) => s.replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}">${m.replace(/^https?:\/\/(www\.)?/, '')}</a>`);

/** Public d'une annonce ou d'un message d'accueil */
export function audienceFilter(audience) {
  if (audience === 'brands') return { role: 'brand', status: 'active' };
  // Créateurs : profil validé ou encore en attente de validation (ils ont accès aux outils et ont le plus besoin d'une raison de revenir)
  return { role: 'creator', status: { $in: ['active', 'pending'] } };
}

/** Envoie un message à une personne (email si non désactivé, cloche toujours) et le trace ; retourne false si déjà envoyé */
export async function sendMemberMessage(user, { subject, body, key, href = '/dashboard', cta = 'Ouvrir mon tableau de bord' }) {
  const already = await MemberMessageLog.findOne({ userId: user._id, key }).lean();
  if (already) return false;
  const { html, text } = renderMemberBody(body, user);
  const emailOn = user.preferences?.emailNotifications !== false && !!user.email;
  let emailed = false;
  if (emailOn) {
    try {
      await sendEmail(user.email, subject, `<h1>Bonjour ${esc(firstName(user) || '')},</h1>${html}${button(`${SITE()}${href}`, cta)}`, null, { preheader: text.slice(0, 120) });
      emailed = true;
    } catch (err) { logger.error(`Member message ${key} to ${user.email}: ${err.message}`); }
  }
  await notify(user._id, { type: 'info', title: subject, text: text.replace(/\s+/g, ' ').slice(0, 200), href });
  await MemberMessageLog.create({ userId: user._id, key, emailed }).catch(() => {});
  return true;
}

/** Séquence d'accueil : appelée par la tâche planifiée de chaque heure ; 200 envois par passage au plus */
export async function runMemberOnboarding({ limit = 200 } = {}) {
  let sent = 0;
  for (const i of ONBOARDING_KEYS) {
    if (!(await getSetting(`memberMsg${i}Enabled`, SETTINGS[`memberMsg${i}Enabled`].default))) continue;
    const days = Number(await getSetting(`memberMsg${i}Days`, SETTINGS[`memberMsg${i}Days`].default));
    const subject = String(await getSetting(`memberMsg${i}Subject`, '') || SETTINGS[`memberMsg${i}Subject`].default);
    const body = String(await getSetting(`memberMsg${i}Body`, '') || SETTINGS[`memberMsg${i}Body`].default);
    const key = `onboarding${i}`;
    const before = new Date(Date.now() - days * 86400000);
    const done = await MemberMessageLog.distinct('userId', { key });
    const filter = { ...audienceFilter('creators'), createdAt: { $lte: before }, _id: { $nin: done } };
    if (i === 3) { const withQuote = await ExternalQuote.distinct('creatorId'); filter._id.$nin = [...done, ...withQuote]; }
    const users = await User.find(filter).select('email profile.name preferences').limit(limit - sent).lean();
    for (const u of users) { if (await sendMemberMessage(u, { subject, body, key })) sent++; }
    if (sent >= limit) break;
  }
  return sent;
}

/** Annonce depuis l'admin : preview = envoi au seul administrateur, sans trace ni enregistrement */
export async function broadcastMemberMessage({ audience, subject, body, sentBy, previewTo = null }) {
  if (previewTo) {
    const admin = await User.findById(previewTo).select('email profile.name preferences').lean();
    const { html, text } = renderMemberBody(body, admin);
    try {
      await sendEmail(admin.email, `[Aperçu] ${subject}`, `<h1>Bonjour ${esc(firstName(admin) || '')},</h1>${html}${button(`${SITE()}/dashboard`, 'Ouvrir mon tableau de bord')}`, null, { preheader: text.slice(0, 120) });
    } catch (err) { throw Object.assign(new Error(`Aperçu non envoyé à ${admin.email} : ${err.message}`), { status: 502 }); }
    return { preview: true, to: admin.email };
  }
  const broadcast = await MemberBroadcast.create({ audience, subject, body, sentBy });
  const key = `broadcast:${broadcast._id}`;
  const cursor = User.find(audienceFilter(audience)).select('email profile.name preferences').lean().cursor({ batchSize: 100 });
  let count = 0, emailed = 0;
  for await (const u of cursor) {
    if (await sendMemberMessage(u, { subject, body, key })) { count++; if (u.preferences?.emailNotifications !== false && u.email) emailed++; }
  }
  broadcast.count = count; broadcast.emailed = emailed; await broadcast.save();
  return { broadcast, count, emailed };
}

export async function memberMessagesOverview() {
  const [creators, brands, broadcasts, onboarding] = await Promise.all([
    User.countDocuments(audienceFilter('creators')),
    User.countDocuments(audienceFilter('brands')),
    MemberBroadcast.find().sort({ sentAt: -1 }).limit(20).lean(),
    MemberMessageLog.aggregate([{ $match: { key: /^onboarding/ } }, { $group: { _id: '$key', n: { $sum: 1 } } }]),
  ]);
  return { audiences: { creators, brands }, broadcasts, onboarding: Object.fromEntries(onboarding.map(o => [o._id, o.n])) };
}
