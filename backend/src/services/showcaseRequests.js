import Lead from '../models/Lead.js';
import User from '../models/User.js';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import { notify } from './notifications.js';
import { notifyAdmins } from './adminAlerts.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Vidéo demandée par une marque (« oui vidéo » dans sa réponse au mailing ou en message privé) :
 * réponse proposée à la marque, créateurs prévenus, suivi dans l'admin, alerte à J+7, réponse de repli (produit offert) à J+10.
 */
export const ALERT_DAYS = 7;
export const FALLBACK_DAYS = 10;
const DAY = 86400000;
const NICHES = ['beauty', 'fashion', 'tech', 'food', 'travel', 'fitness', 'gaming', 'lifestyle', 'parenting', 'pets', 'home', 'business', 'education', 'health'];
const VIDEO_YES = /\b(oui|ok|yes|d['’ ]?accord|volontiers|partant[e]?s?)\b[^.!?\n]{0,40}\bvid[ée]o\b|\bvid[ée]o\b[^.!?\n]{0,25}\b(oui|volontiers|avec plaisir)\b/i;
const SITE = () => config.cors.origin;

/** La réponse demande-t-elle explicitement la vidéo proposée dans le mailing ? */
export function isVideoRequest(text) {
  const t = String(text || '').slice(0, 1500);
  if (/\b(non|pas|aucun[e]?)\b[^.!?\n]{0,30}\bvid[ée]o\b/i.test(t) && !/\boui\s+vid[ée]o\b/i.test(t)) return false;
  return VIDEO_YES.test(t);
}

/** Produit cité dans la réponse : un lien (hors réseaux sociaux), sinon ce qui suit « pour notre / le / la… » */
export function extractProduct(text) {
  const t = String(text || '').slice(0, 1500);
  const url = (t.match(/https?:\/\/[^\s)>\]]+/g) || []).find(u => !/instagram\.com|tiktok\.com|facebook\.com|linkedin\.com|needcreator\./i.test(u));
  if (url) return url.replace(/[.,;]+$/, '').slice(0, 200);
  const m = t.match(/\bpour\s+(?:notre|nos|le|la|les|l['’]|mon|ma|mes|votre|un|une)\s*([^.!?\n]{3,80})/i);
  const found = m ? m[1].trim().replace(/[,;:]+$/, '') : '';
  return /^(instant|moment|plaisir|coup|reste)\b/i.test(found) ? '' : found;
}

/** Réponse proposée à la marque qui demande la vidéo : remerciement, produit, délai de dix jours */
export function videoRequestReply(lead, product = '') {
  const about = product
    ? `La vidéo portera sur ${/^https?:/.test(product) ? `le produit que vous indiquez (${product})` : `« ${product} »`}. Si un autre produit vous semble plus parlant, dites-le-moi.`
    : 'Pour quel produit souhaitez-vous la vidéo ? Un lien vers sa page suffit. Sans indication de votre part, le créateur partira du produit que vous mettez le plus en avant.';
  return [
    'Bonjour,',
    `Merci pour votre réponse : c'est noté. Dès aujourd'hui, nous proposons ${lead.name} à nos créateurs vérifiés.`,
    about,
    'Vous recevrez sous dix jours un lien pour regarder la vidéo. D\'ici là, rien à payer ni à signer : si elle vous plaît, elle est à vous au prix indiqué, droits inclus ; sinon, vous n\'avez rien à faire et personne ne vous relancera.',
    'Si vous pouvez envoyer le produit à un créateur, dites-le-moi : le choix des créateurs s\'en trouve élargi.',
    'L\'équipe NeedCreator',
  ].join('\n\n');
}

/** Enregistre la demande sur la fiche (sans sauvegarder) ; retourne true si la demande est nouvelle */
export function registerShowcaseRequest(lead, { text = '', product = '', via = '' } = {}) {
  if (lead.kind !== 'brand') return false;
  const cur = lead.showcaseRequest?.toObject?.() || lead.showcaseRequest || {};
  const isNew = !cur.explicit || !!cur.closedAt;
  const found = String(product || extractProduct(text) || cur.product || '').trim().slice(0, 200);
  lead.showcaseRequestedAt = isNew ? new Date() : (lead.showcaseRequestedAt || new Date());
  lead.showcaseRequest = isNew
    ? { explicit: true, product: found, via: via || cur.via || '' }
    : { ...cur, explicit: true, product: found, via: cur.via || via || '' };
  return isNew;
}

/** Créateurs à prévenir : ceux de la niche de la marque ; trop peu nombreux (moins de cinq) ou niche inconnue, tous les créateurs actifs */
async function creatorsFor(lead, limit = 400) {
  const base = { role: 'creator', status: 'active' };
  const niche = String(lead.niche || '').toLowerCase().trim();
  if (NICHES.includes(niche)) {
    const same = await User.find({ ...base, 'profile.niches': niche }).select('_id email profile.name preferences').limit(limit).lean();
    if (same.length >= 5) return same;
  }
  return User.find(base).select('_id email profile.name preferences').limit(limit).lean();
}

/** Cloche et email aux créateurs : une marque demande une vidéo. Une seule fois par demande, sauf « force » (produit précisé après coup). */
export async function notifyCreatorsOfRequest(lead, { force = false } = {}) {
  const r = lead.showcaseRequest || {};
  if (lead.kind !== 'brand' || !r.explicit || r.closedAt) return { notified: 0, reason: 'aucune demande en cours' };
  if (r.notifiedAt && !force) return { notified: 0, reason: 'déjà prévenus' };
  const product = r.product || '';
  const href = `/vitrine?marque=${lead._id}`;
  const { sendShowcaseRequestAlert } = await import('./email.js');
  const creators = await creatorsFor(lead);
  let notified = 0;
  for (const c of creators) {
    await notify(c._id, { type: 'application', title: `${lead.name} demande une vidéo`, text: `${product && !/^https?:/.test(product) ? `Produit : ${product}. ` : ''}La première vidéo déposée lui est proposée. Vous fixez votre prix.`, href }).catch(() => {});
    notified++;
  }
  // Emails en arrière-plan, un par un : la réponse à l'écran n'attend pas l'envoi
  const snapshot = { _id: lead._id, name: lead.name, website: lead.website, hooks: [...(lead.hooks || [])] };
  const byEmail = creators.filter(c => c.email && c.preferences?.emailNotifications !== false);
  setImmediate(async () => {
    for (const c of byEmail) await sendShowcaseRequestAlert(c.email, c.profile?.name || '', snapshot, product, `${SITE()}${href}`, c.preferences?.language === 'en' ? 'en' : 'fr').catch(err => logger.warn(`Showcase request alert ${c._id}: ${err.message}`));
  });
  await Lead.updateOne({ _id: lead._id }, { $set: { 'showcaseRequest.notifiedAt': new Date(), 'showcaseRequest.notifiedCount': notified } });
  logger.info(`Showcase request ${lead._id} (${lead.name}): ${notified} creator(s) notified`);
  return { notified };
}

/** Réponse de repli à J+10 sans vidéo : la campagne au produit offert, préparée en brouillon à l'inscription */
export function fallbackReply(lead) {
  const r = lead.showcaseRequest || {};
  const product = r.product && !/^https?:/.test(r.product) ? `« ${r.product} »` : 'votre produit';
  const signup = `${SITE()}/register?role=brand&lead=${lead._id}&email=${encodeURIComponent(lead.email || '')}&company=${encodeURIComponent(lead.name || '')}`;
  const fee = config.gifting?.feePerVideo || 0;
  return [
    'Bonjour,',
    `Je vous avais annoncé une vidéo sous dix jours pour ${product}. Aucun de nos créateurs n'avait le produit chez lui, et je préfère vous le dire plutôt que de vous envoyer une vidéo tournée sans lui.`,
    `Il existe une voie tout aussi simple : vous envoyez le produit à un créateur vérifié, qui tourne la vidéo en échange. Le produit lui reste acquis${fee ? `, et les frais de service sont de ${fee} € HT par vidéo livrée` : ''}. Vous choisissez le créateur parmi ceux qui se proposent, et le contrat de cession de droits est inclus.`,
    `J'ai préparé la campagne en brouillon : il vous reste à la relire, à indiquer la valeur du produit et à la publier.\n${signup}`,
    'L\'équipe NeedCreator',
  ].join('\n\n');
}

/** Vidéos déposées pour une marque depuis sa demande */
async function videosSince(lead) {
  return ShowcaseVideo.find({ leadId: lead._id, createdAt: { $gte: lead.showcaseRequestedAt || new Date(0) }, status: { $in: ['ready', 'sent', 'accepted'] } }).select('status productName price createdAt sentAt viewedAt acceptedAt').sort({ createdAt: -1 }).lean();
}

/** Suivi des demandes pour l'admin : « vidéo demandée le…, produit…, n vidéo(s) déposée(s) » */
export async function listShowcaseRequests({ includeClosed = false, limit = 100 } = {}) {
  const filter = { kind: 'brand', 'showcaseRequest.explicit': true };
  if (!includeClosed) filter['showcaseRequest.closedAt'] = null;
  const leads = await Lead.find(filter).sort({ showcaseRequestedAt: 1 }).limit(limit).select('name email website niche status socials.instagram showcaseRequestedAt showcaseRequest mailing.replyText mailing.replySentAt').lean();
  const out = [];
  for (const l of leads) {
    const videos = await videosSince(l);
    const r = l.showcaseRequest || {};
    const days = Math.floor((Date.now() - new Date(l.showcaseRequestedAt || Date.now()).getTime()) / DAY);
    const state = r.closedAt ? 'closed' : videos.some(v => v.status === 'accepted') ? 'bought' : videos.some(v => v.status === 'sent') ? 'sent' : videos.length ? 'deposited' : days >= FALLBACK_DAYS ? 'overdue' : days >= ALERT_DAYS ? 'late' : 'waiting';
    out.push({
      id: l._id, name: l.name, email: l.email || null, website: l.website || null, niche: l.niche || null, instagram: l.socials?.instagram || null,
      requestedAt: l.showcaseRequestedAt, days, dueAt: new Date(new Date(l.showcaseRequestedAt || Date.now()).getTime() + FALLBACK_DAYS * DAY),
      product: r.product || '', via: r.via || '', replyText: (l.mailing?.replyText || '').slice(0, 300), repliedAt: l.mailing?.replySentAt || null,
      notifiedAt: r.notifiedAt || null, notifiedCount: r.notifiedCount || 0, videos: videos.length, state,
      fallbackAt: r.fallbackAt || null, fallbackText: r.fallbackText || '', fallbackSentAt: r.fallbackSentAt || null, closedAt: r.closedAt || null, closedReason: r.closedReason || '',
    });
  }
  return out;
}

/** Nombre de demandes en cours sans aucune vidéo déposée (compteur du bouton de l'admin) */
export async function countOpenRequests() {
  return (await listShowcaseRequests()).filter(r => !r.videos).length;
}

/** Prépare la réponse de repli (à J+10 par la tâche planifiée, ou à la demande depuis l'admin) */
export async function prepareFallback(lead) {
  const text = fallbackReply(lead);
  lead.showcaseRequest = { ...(lead.showcaseRequest?.toObject?.() || lead.showcaseRequest || {}), fallbackAt: new Date(), fallbackText: text };
  await lead.save();
  return text;
}

/** Envoie la réponse de repli : dans le fil du mailing quand il existe, sinon par email direct ; « copy » = collée à la main en message privé */
export async function sendFallback(lead, text, { via = 'email' } = {}) {
  const body = String(text || lead.showcaseRequest?.fallbackText || '').trim();
  if (!body) throw Object.assign(new Error('Il manque : le texte de la réponse'), { status: 400 });
  let sentVia = via;
  if (via === 'email') {
    if (!lead.email) throw Object.assign(new Error('Il manque : une adresse email pour cette marque (copiez le texte pour l\'envoyer en message privé)'), { status: 400 });
    const html = body.split(/\n{2,}/).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
    let threaded = false;
    if (lead.mailing?.pushedAt) {
      try {
        const { mailingProvider } = await import('./mailing/index.js');
        const provider = mailingProvider();
        const thread = provider ? (lead.mailing.replyMessageId || await provider.findThread(lead.email)) : null;
        if (thread) { await provider.sendReply(thread, html); threaded = true; sentVia = provider.name; }
      } catch (err) { logger.warn(`Fallback reply in thread failed for ${lead._id}: ${err.message}`); }
    }
    if (!threaded) {
      const { sendEmail, showcaseSender } = await import('./email.js');
      const sender = await showcaseSender();
      try { await sendEmail(lead.email, `Votre vidéo pour ${lead.name} : une autre voie`, html, body, { raw: true, lang: 'fr', from: sender, replyTo: sender }); }
      catch (err) { throw Object.assign(new Error(`Envoi impossible à ${lead.email} : adresse refusée par le serveur d'envoi. Vérifiez l'adresse sur la fiche, ou copiez le texte pour un message privé.`), { status: 502, cause: err }); }
    }
  }
  lead.showcaseRequest = { ...(lead.showcaseRequest?.toObject?.() || lead.showcaseRequest || {}), fallbackAt: lead.showcaseRequest?.fallbackAt || new Date(), fallbackText: body.slice(0, 3000), fallbackSentAt: new Date() };
  lead.notes = [lead.notes, `Vidéo demandée sans créateur : produit offert proposé le ${new Date().toLocaleDateString('fr-FR')} (${sentVia === 'copy' ? 'message privé' : sentVia})`].filter(Boolean).join(' · ').slice(0, 2000);
  await lead.save();
  return { via: sentVia };
}

/**
 * Tâche planifiée : demandes en cours sans vidéo. À J+7, alerte à l'équipe ; à J+10, réponse de repli préparée (produit offert), à relire et envoyer.
 * Une demande qui a reçu une vidéo est close quand la vidéo est achetée.
 */
export async function runShowcaseRequestFollowUp() {
  const out = { alerts: 0, fallbacks: 0, closed: 0 };
  const leads = await Lead.find({ kind: 'brand', 'showcaseRequest.explicit': true, 'showcaseRequest.closedAt': null, showcaseRequestedAt: { $ne: null } }).limit(200);
  const late = []; const overdue = [];
  for (const lead of leads) {
    const videos = await videosSince(lead);
    if (videos.some(v => v.status === 'accepted')) { lead.showcaseRequest.closedAt = new Date(); lead.showcaseRequest.closedReason = 'Vidéo achetée'; await lead.save(); out.closed++; continue; }
    if (videos.length) continue;
    const days = (Date.now() - new Date(lead.showcaseRequestedAt).getTime()) / DAY;
    if (days >= FALLBACK_DAYS && !lead.showcaseRequest.fallbackAt) { await prepareFallback(lead); overdue.push(lead); out.fallbacks++; }
    else if (days >= ALERT_DAYS && days < FALLBACK_DAYS && !lead.showcaseRequest.alertAt) { lead.showcaseRequest.alertAt = new Date(); await lead.save(); late.push(lead); out.alerts++; }
  }
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const row = (l) => `<li><strong>${esc(l.name)}</strong>${l.showcaseRequest?.product ? ` · ${esc(l.showcaseRequest.product)}` : ''} · demandée le ${new Date(l.showcaseRequestedAt).toLocaleDateString('fr-FR')} · ${l.showcaseRequest?.notifiedCount || 0} créateur(s) prévenu(s)</li>`;
  const link = `<p><a href="${SITE()}/admin?tab=acquisition">Ouvrir le suivi des vidéos demandées</a></p>`;
  if (late.length) await notifyAdmins(`Vidéo demandée : ${late.length} marque(s) sans vidéo à J+${ALERT_DAYS}`, `<h1>Vidéo promise, pas encore déposée</h1><p>Il reste trois jours avant l'échéance annoncée à la marque. Relancez les créateurs ou tournez-vous vers un créateur qui possède le produit.</p><ul>${late.map(row).join('')}</ul>${link}`);
  if (overdue.length) await notifyAdmins(`Vidéo demandée : ${overdue.length} marque(s) sans vidéo à J+${FALLBACK_DAYS}`, `<h1>Échéance atteinte sans vidéo</h1><p>Une réponse est prête pour chaque marque : elle propose la campagne au produit offert, préparée en brouillon à son inscription. À relire et envoyer depuis le suivi.</p><ul>${overdue.map(row).join('')}</ul>${link}`);
  if (out.alerts || out.fallbacks || out.closed) logger.info(`Showcase requests follow-up: ${JSON.stringify(out)}`);
  return out;
}
