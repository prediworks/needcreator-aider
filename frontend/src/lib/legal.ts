/**
 * Informations légales de l'éditeur. À compléter avant la mise en ligne :
 * les champs marqués [À COMPLÉTER] apparaissent tels quels sur le site.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://needcreator.com';

export const COMPANY = {
  brand: 'NeedCreator',
  legalName: 'PREDIWORKS',
  legalForm: 'SAS',
  capital: '1000',
  siren: '100462530',
  vat: 'FR66100462530',
  rcs: 'PARIS',
  address: '17 Rue Coysevox',
  publicationDirector: 'Rachel AKODO',
  contactEmail: 'contact@needcreator.com',
  privacyEmail: 'privacy@needcreator.com',
  host: {
    name: 'contabo',
    address: 'Welfenstrasse 22,  81541 Munich Germany',
    site: 'https://contabo.com/',
  },
};

/** Date de la version courante des documents légaux (affichée sur les pages) */
export const LEGAL_VERSION_DATE = '11 septembre 2026';

/** Règles commerciales reprises dans les CGU (garder en cohérence avec backend/.env) */
export const TERMS_FIGURES = {
  commissionPercent: 10,
  proPriceEur: 79,
  proTrialDays: 14,
  maxRevisions: 2,
  autoApprovalDays: 7,
  giftingFeePerVideo: 5,
  minCreatorVideos: 3,
};
