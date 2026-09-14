import crypto from 'crypto';
import ExternalQuote from '../models/ExternalQuote.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { getSetting, SETTINGS, getFeePercents, getMaxRevisions } from '../models/Setting.js';
import { renderQuotePdf } from '../services/quotePdf.js';
import { buildContractData, generateContractPdf } from '../services/contract.js';
import { uploadFile, resolveUrl } from '../services/storage.js';
import { createDeliveryForCampaign } from './deliveries.js';
import { sendExternalQuoteToClient, sendExternalQuoteAccepted, sendExternalQuoteDeclined } from '../services/email.js';
import { notify } from '../services/notifications.js';
import { attachQuoteToProspect } from './prospects.js';
import logger from '../utils/logger.js';

/**
 * Devis pour un client hors plateforme (créateur) : devis + projet de contrat PDF, lien public.
 * Le client accepte et paie via NeedCreator (mission classique créée, commission « missions extérieures »), ou le créateur marque « payé en direct ».
 */
const idOf = (x) => (x && x._id ? x._id : x)?.toString();
const creatorLegalOf = (u) => {
  const li = u.legalInfo || {}; const a = li.address || {};
  return { name: [li.firstName, li.lastName].filter(Boolean).join(' ') || u.profile?.name, companyName: li.status === 'company' ? (li.legalName || li.companyName || null) : null, address: [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ') || null, siret: li.siret || null, vatRegistered: !!li.vatRegistered, vatNumber: li.vatRegistered ? li.vatNumber : null };
};
const quoteNumber = () => `DV-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

function pseudoMissionObjects(q, creator, brandLike) {
  const campaign = { title: q.mission.title, description: q.mission.description || null, type: 'paid', brief: { deliverables: q.mission.deliverables, videoType: q.mission.videoType, duration: q.mission.duration, platforms: q.mission.platforms || [], requirements: q.mission.requirements || [], deliveryTypes: ['file', 'link'] } };
  const application = { price: q.quote.price, estimatedDeliveryDays: q.quote.estimatedDeliveryDays, quote: { rights: q.quote.rights, revisions: q.quote.revisions, terms: q.quote.terms, acceptedAt: null } };
  const vat = Math.round(q.quote.price * (q.quote.vatRate || 0)) / 100;
  const delivery = { payment: { quotePrice: q.quote.price, amountHT: q.quote.price, vatRate: q.quote.vatRate || 0, vatAmount: vat, amount: q.quote.price + vat }, estimatedDeliveryDays: q.quote.estimatedDeliveryDays };
  return { campaign, application, delivery, brand: brandLike, creator };
}

async function generatePdfs(q, creator) {
  const link = `${config.cors.origin}/q/${q.token}`;
  const number = q.pdf?.number || quoteNumber();
  const quotePdf = await renderQuotePdf({ number, creator: { name: creator.profile?.name, email: creator.email }, creatorLegal: creatorLegalOf(creator), client: q.client, mission: q.mission, quote: q.quote, payLink: link });
  const brandLike = { email: q.client.email, profile: { companyName: q.client.companyName, company: { siret: q.client.siret || null, registryAddress: q.client.address || null } }, legalInfo: { signatoryName: q.client.contactName || null } };
  const data = buildContractData({ ...pseudoMissionObjects(q, creator, brandLike), maxRevisions: await getMaxRevisions() });
  data.number = `PROJET-${number}`;
  const contractPdf = await generateContractPdf(data);
  const folder = `quotes/${creator._id}/${q._id}`;
  const [{ url: quoteUrl }, { url: contractUrl }] = await Promise.all([uploadFile(quotePdf, `devis-${number}.pdf`, 'application/pdf', folder), uploadFile(contractPdf, `projet-contrat-${number}.pdf`, 'application/pdf', folder)]);
  q.pdf = { number, quoteUrl, contractUrl, generatedAt: new Date() };
}

function pick(body, creator) {
  const b = body || {};
  const rights = b.rights || {};
  return {
    client: { companyName: String(b.client?.companyName || '').trim(), contactName: String(b.client?.contactName || '').trim(), email: String(b.client?.email || '').trim().toLowerCase(), siret: String(b.client?.siret || '').replace(/\s/g, '') || undefined, address: String(b.client?.address || '').trim() || undefined },
    mission: { title: String(b.title || '').trim(), description: String(b.description || '').trim(), videoType: b.videoType || 'testimonial', deliverables: Math.min(20, Math.max(1, parseInt(b.deliverables || 1, 10))), duration: Math.max(5, parseInt(b.duration || 30, 10)), platforms: Array.isArray(b.platforms) ? b.platforms.slice(0, 8) : [], requirements: Array.isArray(b.requirements) ? b.requirements.map(String).slice(0, 10) : [] },
    quote: { price: Number(b.price), vatRate: creator.legalInfo?.vatRegistered ? config.vat.rate : 0, estimatedDeliveryDays: Math.min(90, Math.max(1, parseInt(b.estimatedDeliveryDays || 7, 10))), revisions: Math.min(10, Math.max(0, parseInt(b.revisions ?? 1, 10))), rights: { duration: rights.duration || '1y', supports: (rights.supports || ['social_organic']).filter(Boolean), territories: rights.territories || 'France', exclusivity: !!rights.exclusivity, exclusivityMonths: rights.exclusivity ? (parseInt(rights.exclusivityMonths, 10) || null) : null }, terms: String(b.terms || '').trim().slice(0, 2000), validUntil: new Date(Date.now() + 30 * 86400000) },
  };
}

const serialize = async (q) => { const o = q.toObject ? q.toObject() : q; if (o.pdf?.quoteUrl) o.pdf = { ...o.pdf, quoteUrl: await resolveUrl(o.pdf.quoteUrl), contractUrl: await resolveUrl(o.pdf.contractUrl) }; o.link = `${config.cors.origin}/q/${o.token}`; return o; };

export async function listExternalQuotes(req, res) {
  const list = await ExternalQuote.find({ creatorId: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ quotes: await Promise.all(list.map(serialize)) });
}

/** Crée un devis (PDF générés) pour un créateur : utilisé par l'API et par le registre des droits (renouvellement) */
export async function createQuoteInternal(creator, body) {
  if (!creator.hasLegalInfo()) { const e = new Error('Renseignez vos informations administratives (profil) : elles figurent sur le devis et le contrat.'); e.code = 'LEGAL_INFO_REQUIRED'; e.status = 403; throw e; }
  const data = pick(body, creator);
  const missing = [!data.client.companyName && 'le nom du client', !data.mission.title && 'un titre de mission', !(data.quote.price >= config.business.minQuotePrice) && `un prix d'au moins ${config.business.minQuotePrice} €`].filter(Boolean);
  if (missing.length) { const e = new Error(`Il manque : ${missing.join(', ')}`); e.status = 400; throw e; }
  const q = new ExternalQuote({ ...data, creatorId: creator._id, token: crypto.randomBytes(16).toString('hex'), status: 'draft' });
  await generatePdfs(q, creator);
  await q.save();
  return serialize(q);
}

export async function createExternalQuote(req, res) {
  try {
    const quote = await createQuoteInternal(req.user, req.body);
    if (req.body?.prospectId) await attachQuoteToProspect(req.user._id, req.body.prospectId, quote);
    res.status(201).json({ message: 'Devis et projet de contrat générés', quote });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
    logger.error('createExternalQuote failed:', error);
    res.status(500).json({ error: `Création impossible : ${error.message}` });
  }
}

export async function sendExternalQuote(req, res) {
  try {
    const q = await ExternalQuote.findOne({ _id: req.params.id, creatorId: req.user._id });
    if (!q) return res.status(404).json({ error: 'Devis introuvable' });
    if (!['draft', 'sent'].includes(q.status)) return res.status(400).json({ error: 'Ce devis n\'est plus modifiable' });
    const email = String(req.body?.email || q.client.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Email du client invalide' });
    q.client.email = email; q.status = 'sent'; q.sentAt = new Date();
    await q.save();
    const s = await serialize(q);
    sendExternalQuoteToClient(email, q.client.contactName || q.client.companyName, req.user.profile?.name, q.mission.title, q.quote.price, s.link, s.pdf.quoteUrl, s.pdf.contractUrl, String(req.body?.message || '').trim().slice(0, 1000)).catch(err => logger.warn(`External quote email not sent: ${err.message}`));
    res.json({ message: `Devis envoyé à ${email}`, quote: s });
  } catch (error) {
    logger.error('sendExternalQuote failed:', error);
    res.status(500).json({ error: 'Envoi impossible' });
  }
}

export async function markExternalQuoteDirect(req, res) {
  const q = await ExternalQuote.findOne({ _id: req.params.id, creatorId: req.user._id });
  if (!q) return res.status(404).json({ error: 'Devis introuvable' });
  if (!['draft', 'sent'].includes(q.status)) return res.status(400).json({ error: 'Ce devis est déjà clos' });
  q.status = 'accepted_direct'; q.acceptedAt = new Date();
  await q.save();
  res.json({ message: 'Devis marqué accepté, payé en direct (hors NeedCreator, sans commission)', quote: await serialize(q) });
}

export async function deleteExternalQuote(req, res) {
  const q = await ExternalQuote.findOne({ _id: req.params.id, creatorId: req.user._id });
  if (!q) return res.status(404).json({ error: 'Devis introuvable' });
  if (q.status === 'accepted_needcreator') return res.status(400).json({ error: 'Ce devis a donné lieu à une mission : il ne peut pas être supprimé' });
  await q.deleteOne();
  res.json({ message: 'Devis supprimé' });
}

/** Public : vue du devis par le client (sans données sensibles du créateur) */
export async function publicExternalQuote(req, res) {
  const q = await ExternalQuote.findOne({ token: req.params.token }).populate('creatorId', 'profile.name profile.avatar profile.slug profile.stats').lean();
  if (!q) return res.status(404).json({ error: 'Devis introuvable' });
  if (['draft', 'sent'].includes(q.status) && q.quote.validUntil && new Date(q.quote.validUntil) < new Date()) { await ExternalQuote.updateOne({ _id: q._id }, { $set: { status: 'expired' } }); q.status = 'expired'; }
  const s = await serialize(q);
  res.json({ quote: { id: q._id, status: q.status, client: { companyName: q.client.companyName, contactName: q.client.contactName, email: q.client.email }, mission: q.mission, quote: q.quote, pdf: s.pdf, creator: { name: q.creatorId?.profile?.name, avatar: q.creatorId?.profile?.avatar || null, slug: q.creatorId?.profile?.slug || null, completedJobs: q.creatorId?.profile?.stats?.completedJobs || 0, rating: q.creatorId?.profile?.stats?.rating || 0, totalReviews: q.creatorId?.profile?.stats?.totalReviews || 0 }, deliveryId: q.deliveryId || null } });
}

export async function declineExternalQuote(req, res) {
  const q = await ExternalQuote.findOne({ token: req.params.token }).populate('creatorId', 'email profile.name');
  if (!q) return res.status(404).json({ error: 'Devis introuvable' });
  if (!['draft', 'sent'].includes(q.status)) return res.status(400).json({ error: 'Ce devis est déjà clos' });
  q.status = 'declined'; q.declinedAt = new Date(); q.declineReason = String(req.body?.reason || '').trim().slice(0, 500);
  await q.save();
  sendExternalQuoteDeclined(q.creatorId.email, q.creatorId.profile?.name, q.client.companyName, q.mission.title, q.declineReason).catch(() => {});
  notify(q.creatorId._id, { type: 'application', title: `${q.client.companyName} a décliné votre devis`, text: q.mission.title, href: '/quotes' }).catch(() => {});
  res.json({ message: 'Devis décliné, le créateur est prévenu' });
}

/**
 * Acceptation avec paiement via NeedCreator : crée une campagne privée (marque = le client), la candidature du créateur
 * avec son devis, sélectionne le créateur (livraison + autorisation de paiement + contrat). Commission « missions extérieures ».
 */
export async function convertExternalQuoteToMission(q, brand) {
  const creator = await User.findById(q.creatorId).select('email profile.name profile.niches legalInfo profile.ambassador.status');
  if (!creator) throw new Error('Créateur introuvable');
  const fees = await getFeePercents();
  const externalFee = await getSetting(SETTINGS.externalQuoteFeePercent.key, SETTINGS.externalQuoteFeePercent.default);
  const campaign = new Campaign({
    brandId: brand._id, platformFeePercent: Math.min(externalFee, fees.standard), brandDiscountPercent: 0, type: 'paid',
    title: q.mission.title, description: q.mission.description || `Mission proposée par ${creator.profile?.name} via un devis NeedCreator.`,
    brief: { videoType: q.mission.videoType || 'testimonial', duration: q.mission.duration || 30, deliverables: q.mission.deliverables || 1, requirements: q.mission.requirements || [], deliveryTypes: ['file', 'link'], platforms: q.mission.platforms || [], productShipping: false },
    visibility: 'private', status: 'active', budget: { total: q.quote.price, perVideo: Math.round(q.quote.price / (q.mission.deliverables || 1)) },
    matching: { niches: creator.profile?.niches?.length ? creator.profile.niches : ['lifestyle'], creatorsWanted: 1 },
    timeline: { publishedAt: new Date(), applicationDeadline: new Date(Date.now() + 7 * 86400000) },
    invitations: [{ creatorId: creator._id, message: 'Devis extérieur', notifiedAt: new Date() }],
    externalQuoteId: q._id,
    applications: [{ creatorId: creator._id, proposal: 'Devis établi hors plateforme, accepté par le client via NeedCreator.', price: q.quote.price, estimatedDeliveryDays: q.quote.estimatedDeliveryDays, matchScore: 100, status: 'pending', lotKey: 'main', quote: { version: 1, updatedAt: new Date(), rights: q.quote.rights, deliveryTypes: ['file', 'link'], platforms: q.mission.platforms || [], revisions: q.quote.revisions, vatRate: q.quote.vatRate || 0, terms: q.quote.terms, history: [] } }],
  });
  campaign.selectCreator(creator._id);
  campaign.applications[0].quote.acceptedAt = new Date();
  await campaign.save();
  const result = await createDeliveryForCampaign(campaign, brand, q.quote.price, creator._id.toString());
  q.status = 'accepted_needcreator'; q.acceptedAt = new Date(); q.campaignId = campaign._id; q.deliveryId = result.delivery?._id; q.brandId = brand._id;
  await q.save();
  sendExternalQuoteAccepted(creator.email, creator.profile?.name, q.client.companyName, q.mission.title, result.delivery?._id).catch(() => {});
  notify(creator._id, { type: 'selection', title: `${q.client.companyName} accepte votre devis et paie via NeedCreator`, text: q.mission.title, href: result.delivery ? `/deliveries/${result.delivery._id}` : '/quotes' }).catch(() => {});
  logger.info(`External quote ${q._id} converted to campaign ${campaign._id} / delivery ${result.delivery?._id} for brand ${brand._id}`);
  return { campaign, delivery: result.delivery, warning: result.warning, clientSecret: result.clientSecret };
}

/** Client déjà inscrit (marque connectée) : accepte et paie */
export async function acceptExternalQuoteAsBrand(req, res) {
  try {
    const q = await ExternalQuote.findOne({ token: req.params.token });
    if (!q) return res.status(404).json({ error: 'Devis introuvable' });
    if (!['draft', 'sent'].includes(q.status)) return res.status(400).json({ error: q.status === 'accepted_needcreator' ? 'Devis déjà accepté' : 'Ce devis n\'est plus disponible' });
    if (q.quote.validUntil && new Date(q.quote.validUntil) < new Date()) return res.status(400).json({ error: 'Ce devis a expiré : demandez-en un nouveau au créateur' });
    const brand = req.user;
    if (!brand.hasLegalInfo()) { brand.set('legalInfo.signatoryName', q.client.contactName || brand.profile?.companyName || brand.profile?.name); await brand.save(); }
    const r = await convertExternalQuoteToMission(q, brand);
    res.json({ message: 'Devis accepté : réglez maintenant pour lancer la mission', deliveryId: r.delivery?._id, campaignId: r.campaign._id, paymentRequired: !!r.delivery && r.delivery.payment.status === 'pending' && !!r.delivery.payment.stripePaymentIntentId, warning: r.warning });
  } catch (error) {
    logger.error('acceptExternalQuoteAsBrand failed:', error);
    res.status(500).json({ error: `Acceptation impossible : ${error.message}` });
  }
}

/** Appelé par registerBrand : le client vient de créer son compte marque depuis le lien du devis */
export async function attachExternalQuoteToNewBrand(user, token) {
  if (!token) return null;
  const q = await ExternalQuote.findOne({ token });
  if (!q || !['draft', 'sent'].includes(q.status)) return null;
  if (!user.hasLegalInfo()) user.set('legalInfo.signatoryName', q.client.contactName || user.profile?.companyName || user.profile?.name);
  await user.save();
  const r = await convertExternalQuoteToMission(q, user);
  return r.delivery?._id || null;
}
