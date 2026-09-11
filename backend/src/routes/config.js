import express from 'express';
import { config } from '../config/index.js';
import { getMaxRevisions } from '../models/Setting.js';

const router = express.Router();

/**
 * Réglages publics affichés sur le site (pages marketing, formulaires) : source unique, plus de chiffres en dur
 */
router.get('/public', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    maxRevisions: await getMaxRevisions(),
    autoApprovalDays: config.business.autoApprovalDays,
    minQuotePrice: config.business.minQuotePrice,
    replacementGraceHours: config.business.replacementGraceHours,
    minCreatorVideos: config.business.minCreatorVideos,
    platformFeePercent: config.stripe.platformFeePercent,
    creatorSharePercent: 100 - config.stripe.platformFeePercent,
    referralCreatorBonus: config.referral.creatorBonus,
    referralBrandDiscountPercent: config.referral.brandDiscountPercent,
    earlyAccessHours: config.badges.earlyAccessHours,
    aiBriefFreeQuota: config.plans.aiBriefFreeQuota,
    vatRate: config.vat.rate,
  });
});

export default router;
