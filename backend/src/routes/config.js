import express from 'express';
import { config } from '../config/index.js';
import { getMaxRevisions, getFeePercents } from '../models/Setting.js';

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
    referralCreatorBonus: config.referral.creatorBonus,
    referralBrandDiscountPercent: config.referral.brandDiscountPercent,
    earlyAccessHours: config.badges.earlyAccessHours,
    aiBriefFreeQuota: config.plans.aiBriefFreeQuota,
    vatRate: config.vat.rate,
    giftingFeePerVideo: config.gifting.feePerVideo,
    giftingMinProductValue: config.gifting.minProductValue,
    giftingMaxDeliverables: config.gifting.maxDeliverables,
    giftingMaxPerMonth: config.gifting.maxPerMonth,
  });
});

export default router;
