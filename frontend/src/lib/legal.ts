/**
 * Informations légales de l'éditeur. À compléter avant la mise en ligne :
 * les champs marqués [À COMPLÉTER] apparaissent tels quels sur le site.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://needcreator.com';

export const COMPANY = {
  brand: 'NeedCreator',
  legalName: '[À COMPLÉTER : raison sociale]',
  legalForm: '[À COMPLÉTER : SAS / SARL / EI…]',
  capital: '[À COMPLÉTER : capital social]',
  siren: '[À COMPLÉTER : SIREN]',
  vat: '[À COMPLÉTER : numéro de TVA intracommunautaire]',
  rcs: '[À COMPLÉTER : ville du RCS]',
  address: '[À COMPLÉTER : adresse du siège]',
  publicationDirector: '[À COMPLÉTER : nom du directeur de la publication]',
  contactEmail: 'contact@needcreator.com',
  privacyEmail: 'privacy@needcreator.com',
  host: {
    name: '[À COMPLÉTER : nom de l\'hébergeur]',
    address: '[À COMPLÉTER : adresse de l\'hébergeur]',
    site: '[À COMPLÉTER : site de l\'hébergeur]',
  },
};

/** Date de la version courante des documents légaux (affichée sur les pages) */
export const LEGAL_VERSION_DATE = '9 septembre 2026';

/** Règles commerciales reprises dans les CGU (garder en cohérence avec backend/.env) */
export const TERMS_FIGURES = {
  commissionPercent: 10,
  proCommissionPercent: 8,
  proPriceEur: 79,
  proTrialDays: 14,
  maxRevisions: 2,
  autoApprovalDays: 7,
  giftingFeePerVideo: 5,
  minCreatorVideos: 3,
};
