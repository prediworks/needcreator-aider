import Joi from 'joi';
import ShowcaseVideo from '../models/ShowcaseVideo.js';
import Lead from '../models/Lead.js';
import ExternalQuote from '../models/ExternalQuote.js';
import { uploadFile, createUploadUrl, statObject } from '../services/storage.js';
import { createQuoteInternal } from './externalQuotes.js';
import { processShowcaseVideo, brandsForShowcase, showcaseMessage, showcaseForLead, offerShowcase, listShowcasesForAdmin, refuseShowcase, MAX_ACTIVE_SHOWCASES } from '../services/showcase.js';
import { notifyAdmins } from '../services/adminAlerts.js';
import { suggestBrand, listMySuggestions, listSuggestionsForAdmin, approveSuggestion, refuseSuggestion } from '../services/brandSuggestions.js';
import { listShowcaseRequests, registerShowcaseRequest, videoRequestReply, notifyCreatorsOfRequest, prepareFallback, sendFallback } from '../services/showcaseRequests.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const SITE = () => config.cors.origin;

/** Marques à filmer (côté créateur) */
export async function listShowcaseBrands(req, res) {
  try {
    const brands = await brandsForShowcase({ niche: req.query.niche, q: req.query.q, creatorId: req.user._id });
    // Recherche sans résultat : le créateur possède sans doute le produit ; la marque est notée pour l'équipe (jamais créée toute seule)
    if (req.query.q && !brands.length) { const { recordEmptySearch } = await import('../services/brandSearches.js'); recordEmptySearch(req.user._id, req.query.q).catch(err => logger.warn(`recordEmptySearch: ${err.message}`)); }
    res.json({ brands });
  }
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

/** Envoi direct navigateur → stockage (sans la limite de taille du proxy) : URL signée pour la vidéo vitrine */
export async function getShowcaseUploadUrl(req, res) {
  try {
    const { filename, contentType } = req.body || {};
    if (!/^video\//.test(String(contentType || ''))) return res.status(400).json({ error: 'Seuls les fichiers vidéo sont acceptés' });
    res.json(await createUploadUrl({ folder: `showcase/${req.user._id}`, originalName: filename, contentType }));
  } catch (error) { logger.error('getShowcaseUploadUrl failed:', error); res.status(500).json({ error: `Préparation de l'envoi impossible : ${error.message}` }); }
}

/** Le créateur dépose sa vidéo : stockage, devis client créé d'office au nom de la marque, filigrane en arrière-plan */
export async function createShowcase(req, res) {
  try {
    // Deux chemins : fichier envoyé au serveur (petites vidéos, tests), ou clé d'un fichier déjà déposé dans le stockage (envoi direct)
    const key = String(req.body?.key || '');
    if (!req.file && !key) return res.status(400).json({ error: 'Il manque : le fichier vidéo' });
    if (req.file && !/^video\//.test(req.file.mimetype)) return res.status(400).json({ error: 'Seuls les fichiers vidéo sont acceptés' });
    if (key) {
      if (!key.startsWith(`showcase/${req.user._id}/`)) return res.status(400).json({ error: 'Clé de fichier invalide' });
      if (!(await statObject(key))) return res.status(400).json({ error: 'Fichier introuvable : l\'envoi n\'a pas abouti, réessayez' });
    }
    const { error, value } = createSchema.validate(req.body || {});
    if (error) return res.status(400).json({ error: error.message });
    const supports = Array.isArray(value.supports) ? value.supports : String(value.supports || '').split(',').map(s => s.trim()).filter(s => RIGHTS_SUPPORTS.includes(s));
    const lead = await Lead.findById(value.leadId);
    if (!lead || lead.kind !== 'brand') return res.status(404).json({ error: 'Marque introuvable' });
    if (lead.reservedUntil && lead.reservedUntil > new Date() && String(lead.suggestedBy || '') !== String(req.user._id)) return res.status(409).json({ error: `Cette marque a été suggérée par un autre créateur, qui a la priorité jusqu'au ${lead.reservedUntil.toLocaleDateString('fr-FR')} : choisissez-en une autre` });
    const already = await ShowcaseVideo.findOne({ leadId: lead._id, status: { $in: ['ready', 'sent'] } }).lean();
    if (already) return res.status(409).json({ error: 'Une candidature spontanée est déjà en cours pour cette marque : choisissez-en une autre' });
    const mine = await ShowcaseVideo.countDocuments({ creatorId: req.user._id, status: { $in: ['ready', 'sent'] } });
    if (mine >= MAX_ACTIVE_SHOWCASES) return res.status(400).json({ error: `Vous avez déjà ${MAX_ACTIVE_SHOWCASES} candidatures spontanées en cours : attendez une réponse ou retirez-en une` });
    const creator = req.user;
    const up = key ? { url: `${process.env.CLOUDFLARE_PUBLIC_URL}/${key}` } : await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, `showcase/${creator._id}`);
    const sv = new ShowcaseVideo({ creatorId: creator._id, leadId: lead._id, brandName: lead.name, productName: value.productName, note: value.note || '', videoUrl: up.url, price: value.price });
    // Devis client au nom de la marque : la page publique du devis montre la vidéo et permet l'achat
    const quote = await createQuoteInternal(creator, {
      client: { companyName: lead.name, email: lead.email || '' },
      title: `Vidéo vitrine : ${value.productName}`,
      description: `${value.note ? `${value.note} ` : ''}Vidéo déjà tournée par le créateur, livrée dès l'acceptation du devis.`.trim(),
      videoType: 'testimonial', deliverables: 1, duration: 30, platforms: ['instagram', 'tiktok'],
      price: value.price, estimatedDeliveryDays: 1, revisions: 1, // une modification possible après acceptation : la marque qui aime la vidéo à 80 % l'achète
      rights: { duration: value.rightsDuration, supports: supports.length ? supports : ['social_organic', 'paid_ads'], territories: value.territories, exclusivity: false },
      terms: 'Vidéo déjà réalisée : elle est livrée immédiatement après acceptation. Une modification peut être demandée avant validation (coupe, texte à l\'écran, son) ; le paiement reste bloqué jusqu\'à la validation.',
    });
    sv.quoteId = quote.id || quote._id;
    await sv.save();
    await ExternalQuote.updateOne({ _id: sv.quoteId }, { $set: { status: 'sent', sentAt: new Date() } }); // visible par la marque dès maintenant
    setImmediate(() => processShowcaseVideo(sv._id).catch(err => logger.error('processShowcaseVideo:', err.message)));
    // L'équipe est prévenue à chaque dépôt : la vidéo attend d'être proposée à la marque
    notifyAdmins(`Candidature spontanée déposée pour ${lead.name}`, `<h1>Nouvelle candidature spontanée en vidéo</h1><p><strong>${creator.profile?.name || 'Un créateur'}</strong> a déposé une vidéo pour <strong>${value.productName}</strong> (${lead.name}), ${value.price} € HT.</p><p><a href="${SITE()}/admin?tab=acquisition">Ouvrir « Candidatures spontanées à proposer »</a></p>`).catch(() => {});
    res.status(201).json({ message: 'Candidature déposée : le devis est prêt, le filigrane est en cours. NeedCreator la présente à la marque ; vous serez prévenu à chaque étape.', showcase: await serialize(sv) });
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
    const sv = await ShowcaseVideo.findOne({ leadId: lead._id, status: { $in: ['ready', 'sent'] } }).sort({ createdAt: -1 });
    if (!sv) return res.status(404).json({ error: 'Aucune vidéo vitrine pour cette marque' });
    const via = ['instagram', 'tiktok', 'linkedin'].includes(req.body?.via) ? req.body.via : 'email';
    const r = await offerShowcase(sv, lead, { via, email: req.body?.email });
    res.json({ message: via === 'email' ? `Vidéo proposée par email à ${r.to}` : `Marquée comme proposée en message privé (${via})`, link: r.link, text: r.text });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    logger.error('sendShowcaseToLead failed:', error); res.status(500).json({ error: `Envoi impossible : ${error.message}` });
  }
}

/** Admin : liste des vidéos vitrine (à proposer, proposées, achetées) */
export async function listShowcasesAdmin(req, res) {
  try { res.json({ showcases: await listShowcasesForAdmin({ limit: 100 }) }); }
  catch (error) { logger.error('listShowcasesAdmin failed:', error); res.status(500).json({ error: 'Liste indisponible' }); }
}

/** Admin : refuser une vidéo avant tout envoi à la marque, avec un mot pour le créateur */
export async function refuseShowcaseAdmin(req, res) {
  try {
    const sv = await refuseShowcase(req.params.id, req.body?.reason);
    res.json({ message: 'Vidéo refusée, le créateur est prévenu', id: sv._id });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    logger.error('refuseShowcaseAdmin failed:', error); res.status(500).json({ error: 'Refus impossible' });
  }
}

/** Admin : suivi des vidéos demandées par les marques (« oui vidéo ») */
export async function listShowcaseRequestsAdmin(req, res) {
  try { res.json({ requests: await listShowcaseRequests({ includeClosed: req.query.closed === '1' }) }); }
  catch (error) { logger.error('listShowcaseRequestsAdmin failed:', error); res.status(500).json({ error: 'Suivi indisponible' }); }
}

/**
 * Admin : action sur la demande de vidéo d'une marque.
 * action = create (demande saisie à la main ou produit précisé), notify (prévenir à nouveau les créateurs), fallback (préparer la réponse de repli),
 * send (envoyer la réponse de repli : via = email ou copy), close (clore), reopen.
 */
export async function showcaseRequestAction(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead || lead.kind !== 'brand') return res.status(404).json({ error: 'Marque introuvable' });
    const action = String(req.body?.action || 'create');
    const has = !!lead.showcaseRequest?.explicit;
    if (action !== 'create' && !has) return res.status(400).json({ error: 'Cette marque n\'a pas demandé de vidéo' });
    if (action === 'create') {
      const product = String(req.body?.product || '').trim().slice(0, 200);
      const before = lead.showcaseRequest?.product || '';
      const isNew = registerShowcaseRequest(lead, { product, via: has ? '' : 'manuel' });
      if (isNew && !lead.mailing?.replySentAt && !lead.mailing?.replySuggestion) lead.mailing = { ...(lead.mailing?.toObject?.() || lead.mailing || {}), replySuggestion: videoRequestReply(lead, lead.showcaseRequest.product) };
      await lead.save();
      // Créateurs prévenus à la création ; à nouveau quand le produit vient d'être précisé
      const changed = !isNew && product && product !== before;
      const n = (isNew || changed) && req.body?.notify !== false ? await notifyCreatorsOfRequest(lead, { force: changed }) : { notified: 0 };
      return res.json({ message: `${isNew ? 'Vidéo demandée enregistrée' : 'Demande mise à jour'}${n.notified ? ` · ${n.notified} créateur(s) prévenu(s)` : ''}`, reply: videoRequestReply(lead, lead.showcaseRequest.product), notified: n.notified });
    }
    if (action === 'notify') { const n = await notifyCreatorsOfRequest(lead, { force: true }); return res.json({ message: `${n.notified} créateur(s) prévenu(s)`, notified: n.notified }); }
    if (action === 'fallback') { const text = await prepareFallback(lead); return res.json({ message: 'Réponse préparée : à relire avant envoi', text }); }
    if (action === 'send') {
      const via = req.body?.via === 'copy' ? 'copy' : 'email';
      const r = await sendFallback(lead, req.body?.text, { via });
      return res.json({ message: via === 'copy' ? 'Réponse marquée envoyée en message privé' : `Réponse envoyée à ${lead.email}`, via: r.via });
    }
    if (action === 'close' || action === 'reopen') {
      const cur = lead.showcaseRequest?.toObject?.() || lead.showcaseRequest || {};
      lead.showcaseRequest = action === 'close' ? { ...cur, closedAt: new Date(), closedReason: String(req.body?.reason || '').trim().slice(0, 200) } : { ...cur, closedAt: null, closedReason: '' };
      await lead.save();
      return res.json({ message: action === 'close' ? 'Demande close' : 'Demande rouverte' });
    }
    res.status(400).json({ error: 'Action inconnue' });
  } catch (error) {
    if (!error.status) logger.error('showcaseRequestAction failed:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : `Action impossible : ${error.message}` });
  }
}

/** Créateur : ses suggestions de marques */
export async function listMyBrandSuggestions(req, res) {
  try { res.json(await listMySuggestions(req.user._id)); }
  catch (error) { logger.error('listMyBrandSuggestions failed:', error); res.status(500).json({ error: 'Liste indisponible' }); }
}

/** Créateur : suggère une marque dont il possède un produit */
export async function suggestBrandForShowcase(req, res) {
  try { res.json(await suggestBrand(req.user, req.body || {})); }
  catch (error) {
    if (!error.status) logger.error('suggestBrandForShowcase failed:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : `Suggestion impossible : ${error.message}` });
  }
}

/** Admin : marques suggérées par les créateurs */
export async function listBrandSuggestionsAdmin(req, res) {
  try { res.json({ suggestions: await listSuggestionsForAdmin() }); }
  catch (error) { logger.error('listBrandSuggestionsAdmin failed:', error); res.status(500).json({ error: 'Liste indisponible' }); }
}

/** Admin : valide (fiche prospect créée, créateur prévenu) ou refuse (motif envoyé au créateur) une marque suggérée */
export async function decideBrandSuggestion(req, res) {
  try {
    const action = String(req.body?.action || '');
    if (action === 'approve') { const r = await approveSuggestion(req.params.id, { niche: req.body?.niche, email: req.body?.email }); return res.json({ message: `${r.suggestion.name} validée : le créateur est prévenu, la marque lui est réservée dix jours`, ...r }); }
    if (action === 'refuse') { const r = await refuseSuggestion(req.params.id, req.body?.reason); return res.json({ message: `${r.suggestion.name} refusée : le créateur est prévenu`, ...r }); }
    res.status(400).json({ error: 'Action inconnue' });
  } catch (error) {
    if (!error.status) logger.error('decideBrandSuggestion failed:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : `Action impossible : ${error.message}` });
  }
}
