import Joi from 'joi';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import Lead from '../models/Lead.js';
import ExternalQuote from '../models/ExternalQuote.js';
import { uploadFile } from '../services/storage.js';
import { createQuoteInternal } from './externalQuotes.js';
import { processShowcaseVideo, brandsForShowcase, showcaseMessage, showcaseForLead } from '../services/showcase.js';
import { sendShowcaseOffer } from '../services/email.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const SITE = () => config.cors.origin;

/** Marques à filmer (côté créateur) */
export async function listShowcaseBrands(req, res) {
  try { res.json({ brands: await brandsForShowcase({ niche: req.query.niche, q: req.query.q }) }); }
  catch (error) { logger.error('listShowcaseBrands failed:', error); res.status(500).json({ error: 'Liste indisponible' }); }
}

const RIGHTS_SUPPORTS = ['social_organic', 'paid_ads', 'website', 'email', 'marketplace', 'tv', 'other'];
const createSchema = Joi.object({
  leadId: Joi.string().hex().length(24).required(),
  productName: Joi.string().trim().min(2).max(120).required(),
  note: Joi.string().trim().max(400).allow(''),
  price: Joi.number().min(0).required(),
  rightsDuration: Joi.string().valid('6m', '1y', '2y', '3y', 'unlimited').default('1y'),
  supports: Joi.alternatives().try(Joi.array().items(Joi.string().valid(...RIGHTS_SUPPORTS)), Joi.string()).default(['social_organic', 'paid_ads']),
  territories: Joi.string().trim().max(80).default('France'),
}).unknown(true);

/** Le créateur dépose sa vidéo : stockage, devis client créé d'office au nom de la marque, filigrane en arrière-plan */
export async function createShowcase(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Il manque : le fichier vidéo' });
    if (!/^video\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Seuls les fichiers vidéo sont acceptés' });
    const { error, value } = createSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: error.message });
    const supports = Array.isArray(value.supports) ? value.supports : String(value.supports || '').split(',').map(s => s.trim()).filter(s => RIGHTS_SUPPORTS.includes(s));
    const lead = await Lead.findById(value.leadId);
    if (!lead || lead.kind !== 'brand') return res.status(404).json({ error: 'Marque introuvable' });
    const already = await ShowcaseVideo.findOne({ leadId: lead._id, status: { $in: ['ready', 'sent'] } }).lean();
    if (already) return res.status(409).json({ error: 'Une vidéo vitrine est déjà proposée à cette marque : choisissez-en une autre' });
    const creator = req.user;
    const up = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, `showcase/${creator._id}`);
    const sv = new ShowcaseVideo({ creatorId: creator._id, leadId: lead._id, brandName: lead.name, productName: value.productName, note: value.note || '', videoUrl: up.url, price: value.price });
    // Devis client au nom de la marque : la page publique du devis montre la vidéo et permet l'achat
    const quote = await createQuoteInternal(creator, {
      client: { companyName: lead.name, email: lead.email || '' },
      title: `Vidéo vitrine : ${value.productName}`,
      description: `${value.note ? `${value.note} ` : ''}Vidéo déjà tournée par le créateur, livrée dès l'acceptation du devis.`.trim(),
      videoType: 'testimonial', deliverables: 1, duration: 30, platforms: ['instagram', 'tiktok'],
      price: value.price, estimatedDeliveryDays: 1, revisions: 0,
      rights: { duration: value.rightsDuration, supports: supports.length ? supports : ['social_organic', 'paid_ads'], territories: value.territories, exclusivity: false },
      terms: 'Vidéo déjà réalisée : elle est livrée immédiatement après acceptation, sans révision.',
    });
    sv.quoteId = quote.id || quote._id;
    await sv.save();
    await ExternalQuote.updateOne({ _id: sv.quoteId }, { $set: { status: 'sent', sentAt: new Date() } }); // visible par la marque dès maintenant
    setImmediate(() => processShowcaseVideo(sv._id).catch(err => logger.error('processShowcaseVideo:', err.message)));
    res.status(201).json({ message: 'Vidéo déposée : le devis est prêt, le filigrane est en cours. NeedCreator la présente à la marque ; vous serez prévenu si elle l\'achète.', showcase: await serialize(sv) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
    logger.error('createShowcase failed:', error); res.status(500).json({ error: `Dépôt impossible : ${error.message}` });
  }
}

async function serialize(sv) {
  const q = sv.quoteId ? await ExternalQuote.findById(sv.quoteId).select('token status').lean() : null;
  return { id: sv._id, brandName: sv.brandName, productName: sv.productName, note: sv.note, price: sv.price, status: sv.status, ready: !!sv.watermarkedAt, watermarkError: sv.watermarkError || null, previewUrl: sv.previewUrl || null, playableUrl: sv.playableUrl || sv.videoUrl, sentAt: sv.sentAt || null, acceptedAt: sv.acceptedAt || null, link: q?.token ? `${SITE()}/q/${q.token}` : null, quoteStatus: q?.status || null, createdAt: sv.createdAt };
}

export async function listMyShowcases(req, res) {
  try {
    const list = await ShowcaseVideo.find({ creatorId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ showcases: await Promise.all(list.map(serialize)) });
  } catch (error) { logger.error('listMyShowcases failed:', error); res.status(500).json({ error: 'Liste indisponible' }); }
}

/** Retrait par le créateur (tant que la marque n'a pas acheté) */
export async function withdrawShowcase(req, res) {
  try {
    const sv = await ShowcaseVideo.findOne({ _id: req.params.id, creatorId: req.user._id });
    if (!sv) return res.status(404).json({ error: 'Vidéo introuvable' });
    if (sv.status === 'accepted') return res.status(400).json({ error: 'Cette vidéo a été achetée : elle ne se retire plus' });
    sv.status = 'withdrawn'; await sv.save();
    if (sv.quoteId) await ExternalQuote.updateOne({ _id: sv.quoteId, status: { $in: ['draft', 'sent'] } }, { $set: { status: 'declined', declinedAt: new Date(), declineReason: 'Retirée par le créateur' } });
    res.json({ message: 'Vidéo retirée', showcase: await serialize(sv) });
  } catch (error) { logger.error('withdrawShowcase failed:', error); res.status(500).json({ error: 'Retrait impossible' }); }
}

/* ---------- Admin : proposer la vidéo à la marque ---------- */

export async function showcaseForLeadView(req, res) {
  try {
    const sv = await showcaseForLead(req.params.id);
    if (!sv) return res.json({ showcase: null });
    const link = sv.token ? `${SITE()}/q/${sv.token}` : null;
    res.json({ showcase: { ...sv, link, message: link ? showcaseMessage(sv, link) : null } });
  } catch (error) { logger.error('showcaseForLeadView failed:', error); res.status(500).json({ error: 'Vidéo vitrine indisponible' }); }
}

/** Envoi par email à la marque (si elle a une adresse) ; sinon le message est copié pour un message privé (bouton côté admin) */
export async function sendShowcaseToLead(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Prospect introuvable' });
    const sv = await ShowcaseVideo.findOne({ leadId: lead._id, status: { $in: ['ready', 'sent'] } }).sort({ createdAt: -1 }).populate('creatorId', 'profile.name');
    if (!sv) return res.status(404).json({ error: 'Aucune vidéo vitrine pour cette marque' });
    if (!sv.watermarkedAt) return res.status(400).json({ error: 'Le filigrane n\'est pas terminé : réessayez dans quelques minutes' });
    const q = await ExternalQuote.findById(sv.quoteId).select('token').lean();
    const link = `${SITE()}/q/${q.token}`;
    const via = req.body?.via === 'instagram' ? 'instagram' : 'email';
    if (via === 'email') {
      const email = String(req.body?.email || lead.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Il manque : une adresse email pour cette marque' });
      await sendShowcaseOffer(email, lead.name, sv.creatorId?.profile?.name || 'un créateur vérifié', sv.productName, sv.price, link, sv.note);
      if (!lead.email) { lead.email = email; lead.emailSource = 'manuel'; }
    }
    sv.status = 'sent'; sv.sentAt = new Date(); sv.sentVia = via; await sv.save();
    if (lead.status !== 'replied') { lead.status = 'contacted'; lead.contactedAt = lead.contactedAt || new Date(); lead.contactedVia = lead.contactedVia || via; }
    lead.notes = [lead.notes, `Vidéo vitrine proposée le ${new Date().toLocaleDateString('fr-FR')} (${via}) : ${sv.productName}, ${sv.price} €`].filter(Boolean).join(' · ').slice(0, 2000);
    await lead.save();
    res.json({ message: via === 'email' ? `Vidéo proposée par email à ${lead.email}` : 'Marquée comme proposée en message privé', link, text: showcaseMessage(sv, link) });
  } catch (error) { logger.error('sendShowcaseToLead failed:', error); res.status(500).json({ error: `Envoi impossible : ${error.message}` }); }
}
