import express from 'express';
import { config } from '../config/index.js';
import { SERVICES } from '../../config/services.js';
import User from '../models/User.js';
import { getMaxRevisions, getFeePercents, getSetting, SETTINGS } from '../models/Setting.js';

const router = express.Router();

/**
 * Réglages publics affichés sur le site (pages marketing, formulaires) : source unique, plus de chiffres en dur
 */
router.get('/public', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const fees = await getFeePercents();
  res.json({
    maxRevisions: await getMaxRevisions(),
    autoApprovalDays: config.business.autoApprovalDays,
    minQuotePrice: config.business.minQuotePrice,
    replacementGraceHours: config.business.replacementGraceHours,
    minCreatorVideos: config.business.minCreatorVideos,
    platformFeePercent: fees.standard,
    creatorSharePercent: 100 - fees.standard,
    ambassadorFeePercent: fees.ambassador,
    repeatDiscountPercent: await getSetting(SETTINGS.repeatDiscountPercent.key, SETTINGS.repeatDiscountPercent.default),
    referralCreatorBonus: config.referral.creatorBonus,
    referralBrandDiscountPercent: config.referral.brandDiscountPercent,
    earlyAccessHours: config.badges.earlyAccessHours,
    aiBriefFreeQuota: config.plans.aiBriefFreeQuota,
    vatRate: config.vat.rate,
    giftingFeePerVideo: config.gifting.feePerVideo,
    giftingMinProductValue: config.gifting.minProductValue,
    giftingMaxDeliverables: config.gifting.maxDeliverables,
    giftingMaxPerMonth: config.gifting.maxPerMonth,
    publicCreatorsMinCount: await getSetting(SETTINGS.publicCreatorsMinCount.key, SETTINGS.publicCreatorsMinCount.default),
    publicCreatorsCount: await User.countDocuments({ role: 'creator', status: 'active', 'verification.portfolio': true, 'profile.publicConsent.site': true }),
    services: SERVICES.map(s => ({ key: s.key, label: s.label, kind: s.kind, minPortfolio: s.key === 'ugc' ? config.business.minCreatorVideos : s.minPortfolio, description: s.description })),
  });
});

export default router;
