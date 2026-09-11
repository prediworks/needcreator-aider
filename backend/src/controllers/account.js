import admin from 'firebase-admin';
import User from '../models/User.js';
import Campaign from '../models/Campaign.js';
import Delivery from '../models/Delivery.js';
import Review from '../models/Review.js';
import Conversation from '../models/Conversation.js';
import Report from '../models/Report.js';
import { config } from '../config/index.js';
import { stripe } from '../services/stripe.js';
import { deleteFile } from '../services/storage.js';
import logger from '../utils/logger.js';
import { isValidSiret, isValidVat, lookupRegistry } from '../utils/business.js';
import { getSetting, SETTINGS } from '../models/Setting.js';

const ACTIVE_DELIVERY = ['pending', 'submitted', 'revision_requested'];

/**
 * Acceptation des CGU / politique de confidentialité (version courante)
 */
export async function acceptTerms(req, res) {
  try {
    const user = await User.findById(req.user._id);
    user.legal = { termsVersion: config.legal.termsVersion, acceptedAt: new Date() };
    await user.save();
    res.json({ legal: user.legal, legalUpToDate: true });
  } catch (error) {
    logger.error('acceptTerms failed:', error);
    res.status(500).json({ error: 'Impossible d\'enregistrer votre acceptation' });
  }
}

/**
 * Informations administratives (parties au contrat). Créateur : identité, statut, SIRET, adresse. Marque : signataire.
 */
export async function updateLegalInfo(req, res) {
  try {
    const user = await User.findById(req.user._id);
    const body = req.body;
    if (user.role === 'brand') {
      user.set('legalInfo.signatoryName', body.signatoryName);
      user.set('legalInfo.signatoryTitle', body.signatoryTitle || '');
      user.set('legalInfo.updatedAt', new Date());
      await user.save();
      return res.json({ legalInfo: user.legalInfo, hasLegalInfo: user.hasLegalInfo() });
    }

    const siret = (body.siret || '').replace(/\s/g, '');
    if (body.status !== 'individual') {
      if (!siret) return res.status(400).json({ error: 'Le SIRET est obligatoire pour un micro-entrepreneur ou une société' });
      if (!isValidSiret(siret)) return res.status(400).json({ error: 'SIRET invalide (14 chiffres attendus)' });
    } else if (!body.individualAcknowledged) {
      return res.status(400).json({ error: 'En tant que particulier, vous devez confirmer déclarer vous-même vos revenus' });
    }
    const vatRegistered = body.status !== 'individual' && !!body.vatRegistered;
    const vatNumber = vatRegistered ? String(body.vatNumber || '').replace(/\s/g, '').toUpperCase() : '';
    if (vatRegistered && !isValidVat(vatNumber)) return res.status(400).json({ error: 'Numéro de TVA intracommunautaire invalide (ex. FR12345678901)' });
    if (!body.billingMandate && !user.legalInfo?.billingMandateAcceptedAt) return res.status(400).json({ error: 'Acceptez le mandat de facturation : NeedCreator émet vos factures en votre nom pour chaque mission.' });

    let registry = null;
    const registryEnabled = await getSetting(SETTINGS.businessRegistryCheck.key, SETTINGS.businessRegistryCheck.default);
    if (siret && registryEnabled) {
      registry = await lookupRegistry({ siret });
      if (registry?.found === false) return res.status(400).json({ error: 'SIRET introuvable au registre national des entreprises. Vérifiez le numéro.' });
      if (registry?.found && !registry.active) return res.status(400).json({ error: `Établissement fermé ou inactif au registre (${registry.legalName})` });
    }

    user.set('legalInfo', {
      firstName: body.firstName,
      lastName: body.lastName,
      status: body.status,
      companyName: body.companyName || '',
      siret: siret || '',
      legalName: registry?.found ? registry.legalName : '',
      registryAddress: registry?.found ? registry.address : '',
      registryChecked: !!registry?.found,
      address: body.address,
      individualAcknowledged: body.status === 'individual' ? !!body.individualAcknowledged : false,
      vatRegistered,
      vatNumber,
      billingMandateAcceptedAt: user.legalInfo?.billingMandateAcceptedAt || (body.billingMandate ? new Date() : null),
      updatedAt: new Date(),
    });
    await user.save();
    res.json({ legalInfo: user.legalInfo, hasLegalInfo: user.hasLegalInfo(), registry: registry?.found ? { legalName: registry.legalName, address: registry.address } : null });
  } catch (error) {
    logger.error('updateLegalInfo failed:', error);
    res.status(500).json({ error: 'Enregistrement impossible pour le moment' });
  }
}

/**
 * Export RGPD : toutes les données personnelles de l'utilisateur, au format JSON
 */
export async function exportData(req, res) {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('-__v -firebaseUid -integrations.shopify.accessToken').lean();

    const [campaigns, deliveries, reviewsGiven, reviewsReceived, conversations, reports] = await Promise.all([
      user.role === 'brand'
        ? Campaign.find({ brandId: userId }).select('-__v').lean()
        : Campaign.find({ 'applications.creatorId': userId }).select('title status createdAt applications.$').lean(),
      Delivery.find(user.role === 'brand' ? { brandId: userId } : { creatorId: userId }).select('-__v').lean(),
      Review.find({ reviewerId: userId }).select('-__v').lean(),
      Review.find({ revieweeId: userId }).select('-__v').lean(),
      Conversation.find(user.role === 'brand' ? { brandId: userId } : { creatorId: userId }).select('-__v').lean(),
      Report.find({ reporterId: userId }).select('-__v').lean(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      platform: 'NeedCreator',
      account: user,
      campaigns,
      deliveries,
      reviews: { given: reviewsGiven, received: reviewsReceived },
      conversations,
      reports,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="needcreator-donnees-${userId}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.error('exportData failed:', error);
    res.status(500).json({ error: 'Export impossible pour le moment' });
  }
}

/**
 * Ce qui empêche une suppression immédiate (missions en cours, paiements bloqués)
 */
export async function getDeletionBlockers(user) {
  const blockers = [];
  const filter = user.role === 'brand' ? { brandId: user._id } : { creatorId: user._id };
  const active = await Delivery.countDocuments({ ...filter, status: { $in: ACTIVE_DELIVERY } });
  if (active > 0) blockers.push(`${active} mission(s) en cours : terminez-les ou annulez-les avant de supprimer votre compte.`);
  if (user.role === 'brand') {
    const open = await Campaign.countDocuments({ brandId: user._id, status: { $in: ['active', 'in_progress'] } });
    if (open > 0) blockers.push(`${open} campagne(s) ouverte(s) : fermez-les avant de supprimer votre compte.`);
  }
  return blockers;
}

/**
 * Suppression de compte (RGPD) : anonymisation des données personnelles,
 * suppression des fichiers et du compte Firebase. Les données de facturation
 * (missions, paiements) sont conservées anonymisées pour les obligations comptables.
 */
export async function deleteAccount(req, res) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Un compte administrateur ne peut pas être supprimé depuis l\'application' });

    const blockers = await getDeletionBlockers(user);
    if (blockers.length) return res.status(409).json({ error: blockers.join(' '), blockers });

    const uid = user.firebaseUid;
    const id = user._id.toString();

    // Abonnement Pro : résiliation immédiate
    if (user.subscription?.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId).catch(err =>
        logger.warn('Résiliation Stripe impossible à la suppression du compte', { error: err.message })
      );
    }

    // Fichiers R2 (portfolio, vidéo ambassadeur, avatar)
    const files = [
      ...(user.profile?.portfolio || []).flatMap(v => [v.videoUrl, v.thumbnail]),
      user.profile?.ambassador?.videoUrl,
      user.profile?.avatar,
    ].filter(Boolean);
    for (const f of files) await deleteFile(f).catch(() => {});

    // Anonymisation
    user.email = `supprime-${id}@anonyme.needcreator.com`;
    user.firebaseUid = `deleted-${id}`;
    user.status = 'deleted';
    user.deletedAt = new Date();
    user.profile.name = 'Compte supprimé';
    user.profile.companyName = user.role === 'brand' ? 'Compte supprimé' : undefined;
    user.profile.bio = undefined;
    user.profile.avatar = undefined;
    user.profile.website = undefined;
    user.profile.portfolio = [];
    user.profile.socials = [];
    user.profile.realisations = [];
    user.profile.address = undefined;
    user.profile.ambassador = { status: 'none' };
    user.profile.company = undefined;
    user.verification = { portfolio: false, business: { status: 'unverified' } };
    user.integrations = undefined;
    user.referral = { code: undefined, rewards: [], discountedCampaignsLeft: 0 };
    user.legal = undefined;
    await user.save({ validateBeforeSave: false });

    // Messages : le contenu est effacé, la conversation reste pour l'autre partie
    await Conversation.updateMany(
      { 'messages.senderId': user._id },
      { $set: { 'messages.$[m].text': '[message supprimé]' } },
      { arrayFilters: [{ 'm.senderId': user._id }] }
    );

    // Compte Firebase
    if (uid && !uid.startsWith('deleted-')) {
      await admin.auth().deleteUser(uid).catch(err => logger.warn('Suppression Firebase impossible', { error: err.message }));
    }

    logger.info(`Compte supprimé (anonymisé) : ${id}`);
    res.json({ message: 'Votre compte a été supprimé.' });
  } catch (error) {
    logger.error('deleteAccount failed:', error);
    res.status(500).json({ error: 'Suppression impossible pour le moment' });
  }
}
