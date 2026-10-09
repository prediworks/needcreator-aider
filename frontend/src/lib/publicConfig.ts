/**
 * Réglages publics (source unique : GET /api/config/public). Plus de chiffres en dur dans les pages :
 * nombre de révisions (réglage admin), délai de validation automatique (AUTO_APPROVAL_DAYS)…
 */
export interface PublicConfig {
  maxRevisions: number;
  autoApprovalDays: number;
  minQuotePrice: number;
  replacementGraceHours: number;
  minCreatorVideos: number;
  platformFeePercent: number;
  creatorSharePercent: number;
  referralCreatorBonus: number;
  referralBrandDiscountPercent: number;
  earlyAccessHours: number;
  aiBriefFreeQuota: number;
  vatRate: number;
  ambassadorFeePercent: number;
  externalQuoteFeePercent: number;
  repeatDiscountPercent: number;
  giftingFeePerVideo: number;
  giftingMinProductValue: number;
  giftingMaxDeliverables: number;
  giftingMaxPerMonth: number;
  publicCreatorsMinCount: number;
  demoEmbedUrls: string[];
  publicCreatorsCount: number;
}

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  maxRevisions: 2,
  autoApprovalDays: 7,
  minQuotePrice: Number(process.env.NEXT_PUBLIC_MIN_QUOTE_PRICE || 50),
  replacementGraceHours: 48,
  minCreatorVideos: 3,
  platformFeePercent: 10,
  creatorSharePercent: 90,
  referralCreatorBonus: 10,
  referralBrandDiscountPercent: 5,
  earlyAccessHours: 24,
  aiBriefFreeQuota: 3,
  vatRate: 20,
  ambassadorFeePercent: 8,
  externalQuoteFeePercent: 10,
  repeatDiscountPercent: 3,
  giftingFeePerVideo: 5,
  giftingMinProductValue: 30,
  giftingMaxDeliverables: 2,
  giftingMaxPerMonth: 2,
  publicCreatorsMinCount: 6,
  demoEmbedUrls: ['https://www.instagram.com/need.creator/'],
  publicCreatorsCount: 0,
};

/** Côté serveur (pages marketing) : mis en cache 5 minutes, repli sur les valeurs par défaut si l'API ne répond pas */
export async function fetchPublicConfig(): Promise<PublicConfig> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return DEFAULT_PUBLIC_CONFIG;
  try {
    const res = await fetch(`${base}/config/public`, { next: { revalidate: 300 } });
    if (!res.ok) return DEFAULT_PUBLIC_CONFIG;
    return { ...DEFAULT_PUBLIC_CONFIG, ...(await res.json()) };
  } catch {
    return DEFAULT_PUBLIC_CONFIG;
  }
}

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Commission sur un client extérieur payé via NeedCreator : réglage admin distinct de la commission standard.
 * Quand elle est plus basse (5 % contre 10 %), le texte le dit ; quand elles sont égales, « comme pour une mission classique ».
 */
export function externalFeeWording(cfg: { externalQuoteFeePercent: number; platformFeePercent: number }): string {
  if (cfg.externalQuoteFeePercent < cfg.platformFeePercent) return `la commission réduite de ${cfg.externalQuoteFeePercent} % s'applique (contre ${cfg.platformFeePercent} % sur une mission classique)`;
  return `la commission de ${cfg.externalQuoteFeePercent} % s'applique, comme pour une mission classique`;
}
