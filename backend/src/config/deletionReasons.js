// Raisons proposées à la suppression du compte (mêmes clés que DELETION_REASONS dans frontend/src/lib/labels.ts) ; libellés affichés à l'équipe
export const DELETION_REASONS = {
  no_missions: 'Pas assez de missions ou de campagnes pour moi',
  no_creators: 'Pas trouvé les créateurs que je cherchais',
  too_complex: 'Inscription ou vérification trop compliquée',
  payment: 'Problème de paiement ou de compte Stripe',
  not_for_me: 'La plateforme ne correspond pas à ce que je fais',
  price: 'Tarifs ou commission trop élevés',
  other_platform: 'Je préfère une autre solution',
  testing: 'Je voulais juste voir à quoi ça ressemble',
  other: 'Autre raison',
  no_answer: 'Je préfère ne pas répondre',
};
