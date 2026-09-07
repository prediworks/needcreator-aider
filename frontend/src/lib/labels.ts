/**
 * Libellés français pour les valeurs techniques renvoyées par l'API
 */

export const NICHES: Record<string, string> = {
  beauty: 'Beauté',
  fashion: 'Mode',
  tech: 'Tech',
  food: 'Food',
  travel: 'Voyage',
  fitness: 'Fitness',
  gaming: 'Gaming',
  lifestyle: 'Lifestyle',
  parenting: 'Parentalité',
  pets: 'Animaux',
  home: 'Maison',
  business: 'Business',
  education: 'Éducation',
  health: 'Santé',
};

export const NICHE_OPTIONS = Object.keys(NICHES);

export const VIDEO_TYPES: Record<string, string> = {
  testimonial: 'Témoignage',
  unboxing: 'Unboxing',
  demo: 'Démonstration',
  tutorial: 'Tutoriel',
  review: 'Avis produit',
  comparison: 'Comparatif',
  lifestyle: 'Lifestyle',
  'behind-the-scenes': 'Coulisses',
  interview: 'Interview',
  challenge: 'Challenge',
  haul: 'Haul',
  vlog: 'Vlog',
};

export const VIDEO_TYPE_OPTIONS = Object.entries(VIDEO_TYPES).map(([value, label]) => ({ value, label }));

export const INDUSTRIES: Record<string, string> = {
  ecommerce: 'E-commerce',
  tech: 'Tech',
  beauty: 'Beauté',
  fashion: 'Mode',
  food: 'Alimentation',
  health: 'Santé',
  other: 'Autre',
};

export const CAMPAIGN_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Brouillon', className: 'bg-gray-100 text-gray-700' },
  active: { label: 'Ouverte aux candidatures', className: 'bg-green-100 text-green-700' },
  in_progress: { label: 'En production', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Terminée', className: 'bg-primary-100 text-primary-800' },
  cancelled: { label: 'Annulée', className: 'bg-red-100 text-red-700' },
};

export const DELIVERY_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente des fichiers', className: 'bg-yellow-100 text-yellow-700' },
  submitted: { label: 'Soumise, à valider', className: 'bg-blue-100 text-blue-700' },
  revision_requested: { label: 'Révision demandée', className: 'bg-orange-100 text-orange-700' },
  approved: { label: 'Approuvée', className: 'bg-green-100 text-green-700' },
  auto_approved: { label: 'Approuvée automatiquement', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejetée', className: 'bg-red-100 text-red-700' },
};

export const PAYMENT_STATUS: Record<string, string> = {
  pending: 'En attente de la carte de la marque',
  held: 'Montant bloqué (sera versé après validation)',
  captured: 'Encaissé, virement au créateur en attente de son compte Stripe',
  released: 'Versé au créateur',
  refunded: 'Remboursé',
  failed: 'Paiement échoué',
};

export const APPLICATION_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Acceptée', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Non retenue', className: 'bg-neutral-100 text-neutral-600' },
  withdrawn: { label: 'Retirée', className: 'bg-neutral-100 text-neutral-600' },
};

export const USER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente de validation', className: 'bg-yellow-100 text-yellow-700' },
  active: { label: 'Actif', className: 'bg-green-100 text-green-700' },
  suspended: { label: 'Suspendu', className: 'bg-red-100 text-red-700' },
  banned: { label: 'Banni', className: 'bg-red-100 text-red-700' },
};

export function label(map: Record<string, any>, key: string | undefined): string {
  if (!key) return '';
  const entry = map[key];
  if (!entry) return key;
  return typeof entry === 'string' ? entry : entry.label;
}

export const PLATFORMS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  website: 'Site web',
  drive: 'Drive / transfert',
  other: 'Autre',
};
export const PLATFORM_OPTIONS = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'];

export const DELIVERY_TYPES: Record<string, string> = {
  file: 'Fichier vidéo (upload)',
  link: 'Lien (publication ou transfert)',
};

export const RIGHTS_DURATION: Record<string, string> = {
  '6m': '6 mois',
  '1y': '1 an',
  '2y': '2 ans',
  '3y': '3 ans',
  unlimited: 'Illimitée',
};

export const RIGHTS_SUPPORTS: Record<string, string> = {
  social_organic: 'Réseaux sociaux (organique)',
  paid_ads: 'Publicité payante (Meta, TikTok Ads…)',
  website: 'Site web / page produit',
  email: 'Emailing',
  marketplace: 'Marketplaces (Amazon…)',
  tv: 'TV / affichage',
  other: 'Autre',
};
