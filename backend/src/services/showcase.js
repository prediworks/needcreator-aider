import fs from 'fs';
import os from 'os';
import path from 'path';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import Lead from '../models/Lead.js';
import ExternalQuote from '../models/ExternalQuote.js';
import { downloadFile, uploadFile, keyFromUrl } from './storage.js';
import { watermarkVideoBuffer, videoCodec, transcodePlayable } from './watermark.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { config } from '../config/index.js';
import { notify } from './notifications.js';
import logger from '../utils/logger.js';

const MAX_ATTEMPTS = 3;

/** Filigrane + version lisible d'une vidéo vitrine (même chaîne que le portfolio) */
export async function processShowcaseVideo(showcaseId) {
  const sv = await ShowcaseVideo.findById(showcaseId);
  if (!sv || sv.watermarkedAt) return sv;
  const key = keyFromUrl(sv.videoUrl);
  if (!key) return sv;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncsv-'));
  let autoOffer = false;
  try {
    const input = path.join(workDir, 'input' + (path.extname(key) || '.mp4'));
    fs.writeFileSync(input, await downloadFile(key));
    const codec = await videoCodec(input);
    const base = path.basename(key, path.extname(key));
    sv.sourceCodec = codec || 'inconnu';
    if (codec !== 'h264') { const playable = await transcodePlayable(input, workDir); const up = await uploadFile(fs.readFileSync(playable), `play-${base}.mp4`, 'video/mp4', `showcase/${sv.creatorId}/playable`); sv.playableUrl = up.url; }
    const out = await watermarkVideoBuffer(input, workDir);
    const { url } = await uploadFile(fs.readFileSync(out), `wm-${base}.mp4`, 'video/mp4', `showcase/${sv.creatorId}/previews`);
    sv.previewUrl = url; sv.watermarkedAt = new Date(); sv.watermarkError = undefined;
    autoOffer = true;
  } catch (err) {
    sv.watermarkAttempts = (sv.watermarkAttempts || 0) + 1;
    sv.watermarkError = String(err?.message || err).slice(-300);
    logger.warn(`Showcase ${showcaseId} watermark failed (${sv.watermarkAttempts}): ${sv.watermarkError}`);
  } finally { fs.rmSync(workDir, { recursive: true, force: true }); }
  await sv.save();
  // Envoi automatique (réglage, désactivé par défaut) : la marque a une adresse et la vidéo est prête
  if (autoOffer && sv.status === 'ready' && await getSetting(SETTINGS.showcaseAutoEmail.key, SETTINGS.showcaseAutoEmail.default)) {
    const lead = await Lead.findById(sv.leadId);
    if (lead?.email) await offerShowcase(sv, lead, { via: 'email' }).catch(err => logger.warn(`Showcase auto offer ${sv._id}: ${err.message}`));
  }
  return sv;
}

/** Propose la vidéo à la marque : email (adresse de la fiche ou fournie) ou message privé (texte à coller) ; trace sur la vidéo et le prospect */
export async function offerShowcase(sv, lead, { via = 'email', email = '' } = {}) {
  if (!sv.watermarkedAt) throw Object.assign(new Error('Le filigrane n\'est pas terminé : réessayez dans quelques minutes'), { status: 400 });
  const q = await ExternalQuote.findById(sv.quoteId).select('token').lean();
  const link = `${config.cors.origin}/q/${q.token}`;
  const creator = await (await import('../models/User.js')).default.findById(sv.creatorId).select('profile.name').lean();
  if (via === 'email') {
    const to = String(email || lead.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw Object.assign(new Error('Il manque : une adresse email pour cette marque'), { status: 400 });
    const { sendShowcaseOffer } = await import('./email.js');
    await sendShowcaseOffer(to, lead.name, creator?.profile?.name || 'un créateur vérifié', sv.productName, sv.price, link, sv.note);
    if (!lead.email) { lead.email = to; lead.emailSource = 'manuel'; }
  }
  const first = sv.status !== 'sent';
  sv.status = 'sent'; sv.sentAt = new Date(); sv.sentVia = via; await sv.save();
  if (first) notify(sv.creatorId, { type: 'application', title: `Votre vidéo a été proposée à ${sv.brandName}`, text: `${sv.productName} · ${sv.price} € HT. Vous serez prévenu quand la marque ouvre la page.`, href: '/vitrine' }).catch(() => {});
  if (!['replied', 'registered'].includes(lead.status)) { lead.status = 'contacted'; lead.contactedAt = lead.contactedAt || new Date(); lead.contactedVia = lead.contactedVia || via; }
  lead.notes = [lead.notes, `Vidéo vitrine proposée le ${new Date().toLocaleDateString('fr-FR')} (${via}) : ${sv.productName}, ${sv.price} €`].filter(Boolean).join(' · ').slice(0, 2000);
  await lead.save();
  return { link, text: showcaseMessage(sv, link), to: lead.email };
}

/** Admin : toutes les vidéos vitrine à proposer ou déjà proposées, quel que soit le statut de la marque */
export async function listShowcasesForAdmin({ limit = 100 } = {}) {
  const list = await ShowcaseVideo.find({ status: { $in: ['ready', 'sent', 'accepted'] } }).sort({ status: 1, createdAt: -1 }).limit(limit).populate('creatorId', 'profile.name').populate('leadId', 'name email status socials.instagram website').lean();
  const quotes = await ExternalQuote.find({ _id: { $in: list.map(s => s.quoteId).filter(Boolean) } }).select('token').lean();
  const tokenOf = new Map(quotes.map(q => [String(q._id), q.token]));
  return list.map(sv => { const link = tokenOf.get(String(sv.quoteId)) ? `${config.cors.origin}/q/${tokenOf.get(String(sv.quoteId))}` : null; return { id: sv._id, leadId: sv.leadId?._id || null, brandName: sv.brandName, brandEmail: sv.leadId?.email || null, brandInstagram: sv.leadId?.socials?.instagram || null, brandStatus: sv.leadId?.status || null, productName: sv.productName, price: sv.price, note: sv.note, creatorName: sv.creatorId?.profile?.name || '', status: sv.status, ready: !!sv.watermarkedAt, previewUrl: sv.previewUrl || null, sentAt: sv.sentAt || null, sentVia: sv.sentVia || null, viewedAt: sv.viewedAt || null, acceptedAt: sv.acceptedAt || null, link, message: link ? showcaseMessage(sv, link) : null, createdAt: sv.createdAt }; });
}

/** Tâche planifiée : vidéos vitrine non filigranées (échec ou redémarrage), quelques-unes par passage */
export async function showcaseBacklog(limit = 2) {
  const todo = await ShowcaseVideo.find({ watermarkedAt: null, watermarkAttempts: { $lt: MAX_ATTEMPTS } }).select('_id').limit(limit).lean();
  let n = 0;
  for (const { _id } of todo) { await processShowcaseVideo(_id).catch(() => null); n++; }
  return n;
}

/** Marques que les créateurs peuvent filmer : prospects marques actifs, une vidéo vitrine par marque à la fois */
export async function brandsForShowcase({ niche, q, limit = 200, creatorId = null } = {}) {
  const taken = await ShowcaseVideo.distinct('leadId', { status: { $in: ['ready', 'sent'] } });
  const filter = { kind: 'brand', status: { $in: ['qualified', 'to_contact', 'contacted', 'replied'] }, _id: { $nin: taken } };
  // Marque suggérée par un créateur : réservée à ce créateur jusqu'à la date indiquée
  filter.$and = [{ $or: [{ reservedUntil: null }, { reservedUntil: { $lte: new Date() } }, ...(creatorId ? [{ suggestedBy: creatorId }] : [])] }];
  if (niche) filter.niche = new RegExp(String(niche).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (q) filter.$or = [{ name: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { website: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  const leads = await Lead.find(filter).sort({ showcaseRequestedAt: -1, score: -1, createdAt: -1 }).limit(limit).select('name website niche aiSummary hooks socials.instagram score showcaseRequestedAt showcaseRequest.product showcaseRequest.closedAt suggestedBy reservedUntil').lean();
  const mine = (l) => !!creatorId && String(l.suggestedBy || '') === String(creatorId) && l.reservedUntil && l.reservedUntil > new Date();
  leads.sort((a, b) => Number(mine(b)) - Number(mine(a))); // les marques que le créateur a suggérées en premier (tri stable)
  return leads.map(l => ({ id: l._id, name: l.name, website: l.website || null, niche: l.niche || null, summary: l.aiSummary || null, hooks: l.hooks || [], instagram: l.socials?.instagram || null, requested: !!l.showcaseRequestedAt && !l.showcaseRequest?.closedAt, product: l.showcaseRequest?.product || null, suggestedByMe: mine(l), reservedUntil: mine(l) ? l.reservedUntil : null }));
}

/** Message prêt pour la marque (email ou message privé), avec le lien de la page du devis où la vidéo se regarde */
export function showcaseMessage(sv, link) {
  return `Bonjour, une candidature spontanée pour vous : un créateur vérifié de NeedCreator a tourné cette vidéo pour ${sv.productName}. ${link}\nElle est à vous pour ${sv.price} € HT, droits inclus (durée et supports écrits dans le devis) ; sinon, rien. Le paiement ne part qu'à votre validation.`;
}

/** Vidéo vitrine la plus récente d'un prospect (pour la fiche admin et la file du jour) */
export async function showcaseForLead(leadId) {
  const sv = await ShowcaseVideo.findOne({ leadId, status: { $in: ['ready', 'sent'] } }).sort({ createdAt: -1 }).populate('creatorId', 'profile.name').lean();
  if (!sv) return null;
  const q = sv.quoteId ? await ExternalQuote.findById(sv.quoteId).select('token').lean() : null;
  return { id: sv._id, productName: sv.productName, price: sv.price, previewUrl: sv.previewUrl || null, ready: !!sv.watermarkedAt, creatorName: sv.creatorId?.profile?.name || '', status: sv.status, sentAt: sv.sentAt || null, token: q?.token || null };
}

export const MAX_ACTIVE_SHOWCASES = 3; // candidatures spontanées en cours par créateur

/** Refus par l'équipe (qualité, règles) : la marque ne reçoit rien, le créateur est prévenu avec le motif */
export async function refuseShowcase(showcaseId, reason = '') {
  const sv = await ShowcaseVideo.findById(showcaseId);
  if (!sv) throw Object.assign(new Error('Vidéo introuvable'), { status: 404 });
  if (sv.status === 'accepted') throw Object.assign(new Error('Cette vidéo a été achetée : elle ne se refuse plus'), { status: 400 });
  sv.status = 'declined'; await sv.save();
  if (sv.quoteId) await ExternalQuote.updateOne({ _id: sv.quoteId, status: { $in: ['draft', 'sent'] } }, { $set: { status: 'declined', declinedAt: new Date(), declineReason: `Refusée par NeedCreator${reason ? ` : ${reason}` : ''}` } });
  const why = String(reason || '').trim().slice(0, 300);
  await notify(sv.creatorId, { type: 'application', title: `Votre vidéo pour ${sv.brandName} n'a pas été proposée`, text: why || 'Elle ne respecte pas les règles de la candidature spontanée. Vous pouvez en déposer une autre.', href: '/vitrine' });
  return sv;
}

/** La marque ouvre la page du devis pour la première fois : le créateur est prévenu */
export async function markShowcaseViewed(quoteId) {
  const sv = await ShowcaseVideo.findOneAndUpdate({ quoteId, viewedAt: null, status: { $in: ['sent'] } }, { $set: { viewedAt: new Date() } });
  if (sv) notify(sv.creatorId, { type: 'application', title: `${sv.brandName} a ouvert la page de votre vidéo`, text: `${sv.productName} · ${sv.price} € HT`, href: '/vitrine' }).catch(() => {});
  return !!sv;
}
