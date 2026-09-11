/**
 * Défilement ciblé : chaque élément à compléter mène directement au bloc concerné de la page profil.
 * Les clés sont celles de `profileChecklist` (backend, User.js) ; 'edit' ouvre le formulaire d'édition.
 */
export const PROFILE_ANCHORS: Record<string, string> = {
  name: 'edit', bio: 'edit', niches: 'edit', price: 'edit', company: 'edit', website: 'edit', industry: 'edit',
  portfolio: 'portfolio', socials: 'socials', address: 'address', legal: 'legal',
  stripe: 'stripe', stripeDone: 'stripe', verified: 'business', ambassador: 'ambassador', subscription: 'subscription',
};

export function profileHref(key?: string) {
  const anchor = key ? PROFILE_ANCHORS[key] : undefined;
  return anchor ? `/profile#${anchor}` : '/profile';
}

/** Les messages de blocage (applyBlockers) sont des phrases : on retrouve le bloc par mot-clé */
export function blockerHref(text: string) {
  const t = text.toLowerCase();
  if (t.includes('portfolio') || t.includes('vidéo')) return profileHref('portfolio');
  if (t.includes('administratives') || t.includes('signataire')) return profileHref('legal');
  if (t.includes('stripe')) return profileHref('stripe');
  if (t.includes('entreprise') || t.includes('siret')) return profileHref('verified');
  return '/profile';
}
