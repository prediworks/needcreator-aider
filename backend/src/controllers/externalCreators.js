import ExternalCreator from '../models/ExternalCreator.js';
import Campaign from '../models/Campaign.js';
import { config } from '../config/index.js';
import { parseCreatorsFile, importCreators, SCOPES } from '../services/externalCreatorsImport.js';
import { sendExternalCreatorInvitation } from '../services/email.js';
import { isEstablishedBrand } from './campaigns.js';
import logger from '../utils/logger.js';

const INVITE_COOLDOWN_DAYS = 14;
const PUBLIC_FILTER = { status: { $in: ['listed', 'invited'] } };

/**
 * Annuaire public / marques : jamais d'email
 */
export async function listExternalCreators(req, res) {
  try {
    const { country, q, minFollowers, network, page = 1, limit = 24, sort = 'followers' } = req.query;
    const filter = { ...PUBLIC_FILTER };
    if (country) filter.country = String(country).toUpperCase();
    if (minFollowers) filter.followers = { $gte: parseInt(minFollowers, 10) || 0 };
    if (network === 'instagram') filter.instagram = { $nin: ['', null] };
    if (network === 'youtube') filter.youtube = { $nin: ['', null] };
    if (network === 'tiktok') filter.tiktok = { $nin: ['', null] };
    if (q) filter.$or = [{ username: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { name: new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
    const pageN = Math.max(1, parseInt(page, 10) || 1);
    const limitN = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));
    const sortSpec = sort === 'recent' ? { importedAt: -1 } : sort === 'name' ? { name: 1 } : { followers: -1 };
    const [docs, total, countries] = await Promise.all([
      ExternalCreator.find(filter).sort(sortSpec).skip((pageN - 1) * limitN).limit(limitN),
      ExternalCreator.countDocuments(filter),
      ExternalCreator.aggregate([{ $match: PUBLIC_FILTER }, { $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    ]);
    res.json({
      creators: docs.map(d => d.toPublic()),
      pagination: { page: pageN, limit: limitN, total, pages: Math.ceil(total / limitN) },
      countries: countries.map(c => ({ country: c._id, count: c.n })),
      inviteCooldownDays: INVITE_COOLDOWN_DAYS,
    });
  } catch (error) {
    logger.error('listExternalCreators failed:', error);
    res.status(500).json({ error: 'Annuaire indisponible' });
  }
}

export async function getExternalCreator(req, res) {
  try {
    const doc = await ExternalCreator.findOne({ slug: req.params.slug, ...PUBLIC_FILTER });
    if (!doc) return res.status(404).json({ error: 'Créateur introuvable' });
    res.json({ creator: doc.toPublic() });
  } catch (error) {
    res.status(500).json({ error: 'Créateur indisponible' });
  }
}

/**
 * Retrait (droit d'opposition) : la personne indique l'email associé au profil
 */
export async function optoutExternalCreator(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const generic = { message: 'Si cette adresse correspond au profil, il est retiré de l\'annuaire. Merci.' };
    if (!email) return res.status(400).json({ error: 'Adresse email requise' });
    const doc = await ExternalCreator.findOne({ slug: req.params.slug }).select('+email');
    if (doc && doc.email === email && doc.status !== 'optout') {
      doc.status = 'optout';
      doc.optoutAt = new Date();
      await doc.save();
      logger.info(`Créateur référencé retiré à sa demande : ${doc.username}`);
    }
    res.json(generic);
  } catch (error) {
    res.status(500).json({ error: 'Demande impossible pour le moment' });
  }
}

/**
 * Marque : invitation par email (envoyée par la plateforme, l'adresse n'est jamais transmise)
 */
export async function inviteExternalCreator(req, res) {
  try {
    const brand = req.user;
    const doc = await ExternalCreator.findById(req.params.id).select('+email');
    if (!doc || !['listed', 'invited'].includes(doc.status)) return res.status(404).json({ error: 'Créateur introuvable ou déjà inscrit' });
    if (!doc.email) return res.status(400).json({ error: 'Aucune adresse de contact pour ce créateur' });
    if (doc.lastInvitedAt && Date.now() - new Date(doc.lastInvitedAt).getTime() < INVITE_COOLDOWN_DAYS * 86400000) {
      return res.status(429).json({ error: `Ce créateur a déjà été invité récemment. Nouvelle invitation possible ${INVITE_COOLDOWN_DAYS} jours après la précédente.` });
    }
    if (!(await isEstablishedBrand(brand)) && (brand.usage?.invitesToday || 0) >= config.limits.newBrandInvitesPerDay) {
      return res.status(429).json({ error: `Nouvelle marque : ${config.limits.newBrandInvitesPerDay} invitations par jour maximum tant qu'aucune campagne n'est terminée.` });
    }
    let campaign = null;
    if (req.body?.campaignId) {
      campaign = await Campaign.findOne({ _id: req.body.campaignId, brandId: brand._id, status: 'active' }).select('title');
      if (!campaign) return res.status(400).json({ error: 'Campagne introuvable ou non publiée' });
    }
    const brandName = brand.profile?.companyName || brand.profile?.name;
    const joinLink = `${config.cors.origin}/register?role=creator${brand.referral?.code ? `&ref=${brand.referral.code}` : ''}&from=${doc.slug}`;
    await sendExternalCreatorInvitation(doc.email, doc.name || doc.username, brandName, campaign?.title || null, joinLink, String(req.body?.message || '').slice(0, 600));
    doc.status = 'invited';
    doc.lastInvitedAt = new Date();
    doc.invitations.push({ brandId: brand._id, campaignId: campaign?._id, sentAt: new Date() });
    await doc.save();
    brand.usage = brand.usage || {};
    brand.set('usage.invitesToday', (brand.usage.invitesToday || 0) + 1);
    await brand.save();
    res.json({ message: `Invitation envoyée à ${doc.name || doc.username} de la part de ${brandName}`, creator: doc.toPublic() });
  } catch (error) {
    logger.error('inviteExternalCreator failed:', error);
    res.status(502).json({ error: `Invitation impossible : ${error?.message || 'erreur'}` });
  }
}

/**
 * Admin : import d'un fichier xlsx / csv
 */
export async function adminImportExternalCreators(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant (xlsx ou csv)' });
    const scope = SCOPES[req.body?.scope] === undefined ? 'europe' : req.body.scope;
    const rows = parseCreatorsFile(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ error: 'Aucune ligne exploitable : colonnes attendues Username, Name, Country, Email, Instagram, YouTube, Followers, Posts, Likes, Niche' });
    const stats = await importCreators(rows, { scope, source: req.file.originalname });
    res.json({ message: `${stats.created} créé(s), ${stats.updated} mis à jour, ${stats.skippedCountry} hors périmètre, ${stats.duplicatesInFile} doublon(s) dans le fichier`, stats });
  } catch (error) {
    logger.error('adminImportExternalCreators failed:', error);
    res.status(500).json({ error: `Import impossible : ${error.message}` });
  }
}

export async function adminExternalCreatorsStats(req, res) {
  try {
    const [byStatus, byCountry, total] = await Promise.all([
      ExternalCreator.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      ExternalCreator.aggregate([{ $match: PUBLIC_FILTER }, { $group: { _id: '$country', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }]),
      ExternalCreator.countDocuments(),
    ]);
    res.json({ total, byStatus: Object.fromEntries(byStatus.map(s => [s._id, s.n])), byCountry: byCountry.map(c => ({ country: c._id, count: c.n })), scopes: Object.keys(SCOPES) });
  } catch (error) {
    res.status(500).json({ error: 'Statistiques indisponibles' });
  }
}

export async function adminDeleteExternalCreator(req, res) {
  try {
    const r = await ExternalCreator.deleteOne({ _id: req.params.id });
    res.json({ deleted: r.deletedCount === 1 });
  } catch (error) {
    res.status(500).json({ error: 'Suppression impossible' });
  }
}

/**
 * Inscription d'un créateur : rattache le profil référencé (même email) et pré-remplit les réseaux
 */
export async function claimExternalCreator(user) {
  try {
    const doc = await ExternalCreator.findOne({ email: user.email, status: { $ne: 'joined' } }).select('+email');
    if (!doc) return null;
    doc.status = 'joined';
    doc.claimedBy = user._id;
    doc.joinedAt = new Date();
    await doc.save();
    const socials = user.profile.socials || [];
    const add = (network, url, handle) => { if (url && !socials.some(s => s.network === network)) socials.push({ network, url, handle, followers: network === 'instagram' ? doc.followers : undefined }); };
    add('instagram', doc.instagram, doc.username);
    add('youtube', doc.youtube, doc.name);
    add('tiktok', doc.tiktok, doc.username);
    user.profile.socials = socials;
    if (doc.niches?.length && !(user.profile.niches || []).length) user.profile.niches = doc.niches;
    await user.save();
    logger.info(`Créateur référencé rattaché : ${doc.username} → ${user._id}`);
    return doc;
  } catch (error) {
    logger.warn(`claimExternalCreator failed: ${error.message}`);
    return null;
  }
}
