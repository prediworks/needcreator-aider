import crypto from 'crypto';
import User from '../models/User.js';
import MemberTopic from '../models/MemberTopic.js';
import ExternalQuote from '../models/ExternalQuote.js';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import Prospect from '../models/Prospect.js';
import CreatorContent from '../models/CreatorContent.js';
import Campaign from '../models/Campaign.js';
import AdScan from '../models/AdScan.js';
import { MemberMessageLog } from '../models/MemberMessage.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { audienceFilter, sendMemberMessage, renderMemberBody, emailsPerHour } from './memberMessages.js';
import { sendEmail, button } from './email.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Thématiques hebdomadaires : chaque semaine, chaque inscrit reçoit la prochaine thématique active qu'il n'a pas encore reçue (dans l'ordre).
 * Tout reçu → on recommence au début, une thématique ne revenant pas avant le délai de reprise (objet de rappel).
 * Garde-fous : un seul conseil par personne et par 6 jours, jamais avant la fin de la séquence d'accueil, lien « ne plus recevoir » dans chaque email.
 */
const DAY = 86400000;
const WEEK_GUARD_DAYS = 6;
const SITE = () => config.cors.origin;
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lien de désinscription signé : identifiant de l'inscrit + signature, sans connexion */
export function tipsToken(userId) {
  const id = String(userId);
  return `${id}.${crypto.createHmac('sha256', config.security.jwtSecret).update(`tips:${id}`).digest('hex').slice(0, 32)}`;
}
export function tipsUnsubscribeLink(userId) { return `${SITE()}/conseils/desinscription?token=${tipsToken(userId)}`; }
export async function unsubscribeTips(token) {
  const [id, sig] = String(token || '').split('.');
  if (!id || !sig || !/^[0-9a-f]{24}$/.test(id) || tipsToken(id) !== `${id}.${sig}`) return null;
  const user = await User.findByIdAndUpdate(id, { $set: { 'preferences.tipsEmails': false } }, { new: true }).select('email').lean();
  return user ? { email: user.email } : null;
}
const footer = (user) => `<p style="color:#6b7280;font-size:12px;margin-top:24px">Vous recevez un conseil par semaine sur les outils NeedCreator. <a href="${tipsUnsubscribeLink(user._id)}" style="color:#6b7280">Ne plus recevoir les conseils</a>.</p>`;

/** Heure de Paris : jour de la semaine et heure, pour le créneau d'envoi */
function parisNow() {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date());
  const wd = { 'dim.': 0, 'lun.': 1, 'mar.': 2, 'mer.': 3, 'jeu.': 4, 'ven.': 5, 'sam.': 6 }[parts.find(p => p.type === 'weekday')?.value] ?? new Date().getDay();
  return { weekday: wd, hour: Number(parts.find(p => p.type === 'hour')?.value ?? new Date().getHours()) % 24 };
}

/** Qui se sert déjà de quoi : pour « inutile si déjà utilisé » */
async function usageSets() {
  const showcaseQuoteIds = (await ShowcaseVideo.distinct('quoteId')).filter(Boolean);
  const [quote, showcase, prospect, content, scan, campaign] = await Promise.all([
    ExternalQuote.distinct('creatorId', { _id: { $nin: showcaseQuoteIds } }),
    ShowcaseVideo.distinct('creatorId'),
    Prospect.distinct('creatorId'),
    CreatorContent.distinct('creatorId', { source: 'external' }),
    AdScan.distinct('userId', { userId: { $ne: null } }),
    Campaign.distinct('brandId'),
  ]);
  const set = (ids) => new Set(ids.map(String));
  return { quote: set(quote), showcase: set(showcase), prospect: set(prospect), content: set(content), scan: set(scan), campaign: set(campaign) };
}

/** Thématique à envoyer à cette personne : première jamais reçue dans l'ordre, sinon la plus ancienne reçue au-delà du délai de reprise */
export function pickTopic(topics, sentMap, { repeatDays, now = Date.now() }) {
  for (const t of topics) if (!sentMap.has(String(t._id))) return { topic: t, round: 1 };
  let best = null;
  for (const t of topics) {
    const s = sentMap.get(String(t._id));
    if (!s || s.lastAt.getTime() > now - repeatDays * DAY) continue;
    if (!best || s.lastAt < best.lastAt) best = { topic: t, round: s.count + 1, lastAt: s.lastAt };
  }
  return best ? { topic: best.topic, round: best.round } : null;
}

/**
 * Tâche planifiée (chaque heure) : à partir du jour et de l'heure réglés (heure de Paris), un paquet par heure pendant la fenêtre d'envoi,
 * jusqu'à ce que chaque inscrit ait eu son conseil de la semaine (un seul par 6 jours). force (admin, tests) : un paquet tout de suite.
 * Retourne { ran, sent, skipped }.
 */
export async function runMemberTopics({ force = false, limit = null } = {}) {
  if (!(await getSetting(SETTINGS.memberTopicsEnabled.key, SETTINGS.memberTopicsEnabled.default))) return { ran: false, reason: 'désactivé', sent: 0 };
  if (!force) {
    const { weekday, hour } = parisNow();
    const wd = Number(await getSetting(SETTINGS.memberTopicsWeekday.key, SETTINGS.memberTopicsWeekday.default));
    const h = Number(await getSetting(SETTINGS.memberTopicsHour.key, SETTINGS.memberTopicsHour.default));
    const windowDays = Number(await getSetting(SETTINGS.memberTopicsWindowDays.key, SETTINGS.memberTopicsWindowDays.default));
    const elapsed = ((weekday - wd + 7) % 7) * 24 + (hour - h); // heures depuis le début de la fenêtre
    if (elapsed < 0 || elapsed >= windowDays * 24) return { ran: false, reason: 'hors fenêtre', sent: 0 };
  }
  if (!limit) limit = await emailsPerHour();
  const startDays = Number(await getSetting(SETTINGS.memberTopicsStartDays.key, SETTINGS.memberTopicsStartDays.default));
  const repeatDays = Number(await getSetting(SETTINGS.memberTopicsRepeatDays.key, SETTINGS.memberTopicsRepeatDays.default));
  const usage = await usageSets();
  let sent = 0, skipped = 0;
  for (const audience of ['creators', 'brands']) {
    const topics = await MemberTopic.find({ audience, active: true }).sort({ order: 1, createdAt: 1 }).lean();
    if (!topics.length) continue;
    const users = await User.find({ ...audienceFilter(audience), createdAt: { $lte: new Date(Date.now() - startDays * DAY) }, 'preferences.tipsEmails': { $ne: false } }).sort({ createdAt: -1 }).select('email profile.name profile.companyName preferences').lean();
    for (const u of users) {
      if (sent >= limit) break;
      const logs = await MemberMessageLog.find({ userId: u._id, key: /^topic:/ }).select('key sentAt').lean();
      if (logs.some(l => l.sentAt && l.sentAt.getTime() > Date.now() - WEEK_GUARD_DAYS * DAY)) { skipped++; continue; } // un conseil par semaine au plus
      const sentMap = new Map();
      for (const l of logs) { const id = l.key.split(':')[1]; const cur = sentMap.get(id); if (!cur || l.sentAt > cur.lastAt) sentMap.set(id, { lastAt: l.sentAt, count: (cur?.count || 0) + 1 }); else cur.count++; }
      const eligible = topics.filter(t => !t.skipIf || !usage[t.skipIf]?.has(String(u._id)));
      const pick = pickTopic(eligible, sentMap, { repeatDays });
      if (!pick) continue;
      const subject = pick.round > 1 ? (pick.topic.subjectRepeat || `Rappel : ${pick.topic.subject}`) : pick.topic.subject;
      const ok = await sendMemberMessage(u, { subject, body: pick.topic.body, key: `topic:${pick.topic._id}:${pick.round}`, href: pick.topic.href || '/dashboard', cta: pick.topic.cta || 'Ouvrir mon tableau de bord', footerHtml: footer(u) });
      if (ok) sent++;
    }
  }
  if (sent) logger.info(`Member topics: ${sent} email(s) sent, ${skipped} skipped (one per week)`);
  return { ran: true, sent, skipped };
}

/** Aperçu d'une thématique, envoyé à l'administrateur seul, sans trace */
export async function previewTopic(topic, adminId) {
  const admin = await User.findById(adminId).select('email profile.name preferences').lean();
  const { html, text } = renderMemberBody(topic.body, admin);
  const first = String(admin?.profile?.name || '').trim().split(/\s+/)[0] || '';
  await sendEmail(admin.email, `[Aperçu] ${topic.subject}`, `<h1>Bonjour ${esc(first)},</h1>${html}${button(`${SITE()}${topic.href || '/dashboard'}`, topic.cta || 'Ouvrir mon tableau de bord')}${footer(admin)}`, null, { preheader: text.slice(0, 120) });
  return { to: admin.email };
}

/** Admin : la bibliothèque avec, pour chaque thématique, les envois et la taille du public */
export async function topicsOverview() {
  await ensureDefaultTopics();
  const [topics, counts, creators, brands] = await Promise.all([
    MemberTopic.find().sort({ audience: 1, order: 1, createdAt: 1 }).lean(),
    MemberMessageLog.aggregate([{ $match: { key: /^topic:/ } }, { $group: { _id: { $arrayElemAt: [{ $split: ['$key', ':'] }, 1] }, n: { $sum: 1 }, last: { $max: '$sentAt' } } }]),
    User.countDocuments(audienceFilter('creators')),
    User.countDocuments(audienceFilter('brands')),
  ]);
  const byId = new Map(counts.map(c => [String(c._id), c]));
  return { audiences: { creators, brands }, topics: topics.map(t => ({ ...t, sent: byId.get(String(t._id))?.n || 0, lastSentAt: byId.get(String(t._id))?.last || null })) };
}

/** Premières thématiques, en brouillon (désactivées) : l'équipe relit, ajuste, active */
export const DEFAULT_TOPICS = [
  // Créateurs
  { audience: 'creators', order: 1, title: 'Envoyer vos devis', skipIf: 'quote', href: '/quotes', cta: 'Créer un devis', subject: 'Envoyez vos devis depuis NeedCreator, même à vos clients en direct',
    body: `Un client vous contacte en direct, une agence vous propose une vidéo ? Faites le devis depuis votre compte NeedCreator : il part en un clic, avec le contrat de cession de droits.\n\n- **Vous savez s'il est ouvert** : vous êtes prévenu quand le client ouvre la page, et vous voyez « jamais ouvert » si ce n'est pas le cas.\n- **Paiement garanti** : si le client règle via NeedCreator, le montant est bloqué avant que vous ne tourniez, et viré à la validation. Commission réduite de 5 %.\n- **Factures en votre nom**, relevé mensuel, rappel avant l'expiration des droits.\n\nSi le client paie en direct, aucune commission : vous gardez simplement la trace et le contrat.` },
  { audience: 'creators', order: 2, title: 'Proposer spontanément vos vidéos', skipIf: 'showcase', href: '/vitrine', cta: 'Voir les marques à filmer', subject: 'N\'attendez pas qu\'une marque vous choisisse : proposez-lui une vidéo',
    body: `Vous avez chez vous un produit d'une marque que nous démarchons ? Tournez une vidéo de 15 à 30 secondes, fixez votre prix, déposez-la dans « Candidature spontanée ».\n\n- La marque la reçoit finie, en filigrane, avec votre devis.\n- Si elle lui plaît, elle l'achète en un clic et vous êtes payé à la validation.\n- Vous êtes prévenu quand la marque ouvre la page.\n\nLa liste des marques à filmer est dans votre espace, avec les produits qui les intéressent.` },
  { audience: 'creators', order: 3, title: 'Le scan des publicités d\'une marque', skipIf: 'scan', href: '/publicites-concurrents', cta: 'Scanner une marque', subject: 'Avant de contacter une marque, regardez ses publicités',
    body: `Tapez le nom d'une marque : vous voyez les publicités qu'elle fait tourner sur Facebook et Instagram, depuis combien de temps, et ce qui dure chez elle.\n\n- Les publicités qui tournent depuis des mois sont celles qui rapportent : proposez la vôtre dans le même esprit.\n- Vous pouvez recevoir le rapport par email, et être prévenu quand la marque lance de nouvelles publicités.\n- Depuis le scan, déposez directement une candidature spontanée pour cette marque.` },
  { audience: 'creators', order: 4, title: 'Le registre de vos droits', skipIf: 'content', href: '/rights', cta: 'Ouvrir mon registre', subject: 'Qui a le droit d\'utiliser vos vidéos, et jusqu\'à quand ?',
    body: `Chaque vidéo livrée via NeedCreator est inscrite dans votre registre des droits : durée de cession, supports, exclusivité. Vous pouvez y ajouter les vidéos faites ailleurs.\n\n- **Rappel avant l'expiration** : vous savez quand proposer une prolongation payante.\n- **Exclusivités** : vous ne signez pas deux fois avec deux marques concurrentes sans le savoir.\n- Un contrat PDF par contenu, à retrouver en un clic.` },
  { audience: 'creators', order: 5, title: 'Le suivi de prospection', skipIf: 'prospect', href: '/prospects', cta: 'Ouvrir mon suivi', subject: 'Vos marques à relancer, au même endroit',
    body: `Vous démarchez des marques vous-même ? Notez-les dans votre suivi de prospection : qui a été contacté, qui a répondu, qui est à relancer et quand.\n\n- Un rappel le jour de la relance.\n- Le devis se crée depuis la fiche de la marque.\n- Vos marques gagnées, perdues, en cours : vous savez où vous en êtes.` },
  { audience: 'creators', order: 6, title: 'Le kit média', href: '/profile#media-kit', cta: 'Voir mon kit média', subject: 'Votre kit média est prêt : une page à envoyer aux marques',
    body: `Votre profil NeedCreator génère un kit média : vos chiffres, vos réalisations, vos tarifs, un QR code. Une page publique à mettre dans votre bio Instagram ou TikTok et à envoyer aux marques.\n\n- Mis à jour tout seul à chaque mission livrée.\n- Les marques y demandent un devis directement.\n- Les avis de vos clients y apparaissent, en double aveugle.` },
  { audience: 'creators', order: 7, title: 'Le calculateur de tarif', href: '/calculateur-tarif-ugc', cta: 'Calculer mon tarif', subject: 'Combien facturer une vidéo ? Le calculateur vous donne une base',
    body: `Durée, supports, exclusivité, droits : le calculateur de tarif vous propose une fourchette cohérente avec les prix pratiqués sur NeedCreator.\n\n- Vous évitez de brader une vidéo diffusée en publicité pendant un an.\n- Vous argumentez votre prix auprès de la marque avec les mêmes critères.\n- Le résultat se reporte dans votre devis.` },
  { audience: 'creators', order: 8, title: 'Le parrainage', href: '/earnings', cta: 'Parrainer un créateur', subject: 'Un créateur parrainé qui livre sa première mission, c\'est une prime pour vous',
    body: `Vous connaissez un créateur qui devrait être sur NeedCreator ? Envoyez-lui votre lien de parrainage. Quand il livre sa première mission, vous touchez la prime de parrainage.\n\n- Le lien est dans votre tableau de bord.\n- Aucune limite au nombre de parrainages.` },
  // Marques
  { audience: 'brands', order: 1, title: 'La vidéo au produit offert', skipIf: 'campaign', href: '/campaigns/new', cta: 'Créer une campagne', subject: 'Pas de budget vidéo ? Payez en produit',
    body: `Créez une campagne « produit offert » : vous envoyez votre produit, un créateur vérifié tourne et vous livre sa vidéo, contrôlée comme une mission payée. Vous gardez les droits prévus au brief.\n\n- Idéal pour tester un créateur avant une mission payée.\n- Contrat de droits, révisions et conformité au brief fonctionnent pareil.` },
  { audience: 'brands', order: 2, title: 'Le scan concurrentiel et l\'audit', skipIf: 'scan', href: '/publicites-concurrents', cta: 'Scanner un concurrent', subject: 'Ce que vos concurrents font tourner en publicité, en 30 secondes',
    body: `Tapez le nom d'un concurrent : vous voyez ses publicités Facebook et Instagram, depuis combien de temps elles tournent, et une lecture de ce qui dure.\n\n- Les publicités qui tournent depuis des mois sont celles qui rapportent.\n- Scannez votre propre marque pour obtenir un audit de vos publicités.\n- Depuis le scan, lancez un brief à vos créateurs en un clic.` },
  { audience: 'brands', order: 3, title: 'Le registre des contenus', skipIf: 'content', href: '/contents', cta: 'Ouvrir le registre', subject: 'Toutes vos vidéos de créateurs et leurs droits, au même endroit',
    body: `Chaque vidéo livrée est inscrite dans votre registre : créateur, durée des droits, supports autorisés, contrat PDF. Vous pouvez y ajouter les vidéos achetées ailleurs.\n\n- Rappel avant l'expiration des droits : plus de publicité diffusée hors contrat.\n- Publication Shopify en un clic, vidéos prêtes à diffuser en option.` },
  { audience: 'brands', order: 4, title: 'L\'équipe sur un compte', href: '/profile', cta: 'Inviter un collaborateur', subject: 'Vos collègues peuvent travailler sur le même compte marque',
    body: `Invitez vos collaborateurs sur votre compte NeedCreator : chacun suit les campagnes, valide les livraisons et télécharge les vidéos, sans partager de mot de passe.\n\n- Inclus dans l'offre gratuite.\n- Les factures et le relevé mensuel restent au nom de l'entreprise.` },
];
export async function ensureDefaultTopics() {
  if (await MemberTopic.countDocuments()) return 0;
  await MemberTopic.insertMany(DEFAULT_TOPICS.map(t => ({ ...t, active: false })));
  return DEFAULT_TOPICS.length;
}
