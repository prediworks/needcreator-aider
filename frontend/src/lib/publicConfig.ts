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
}

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  maxRevisions: 2,
  autoApprovalDays: 7,
  minQuotePrice: Number(process.env.NEXT_PUBLIC_MIN_QUOTE_PRICE || 50),
  replacementGraceHours: 48,
  minCreatorVideos: 3,
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
