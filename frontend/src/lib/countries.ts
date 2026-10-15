/**
 * Pays d'immatriculation proposés (créateurs et marques) : France = SIRET contrôlé au registre, Belgique = numéro BCE (clé contrôlée),
 * autres pays = numéro au registre local, accepté tel quel. Codes ISO, ceux que Stripe accepte pour un compte de versement.
 */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'FR', name: 'France' }, { code: 'BE', name: 'Belgique' }, { code: 'CH', name: 'Suisse' }, { code: 'LU', name: 'Luxembourg' },
  { code: 'MC', name: 'Monaco' }, { code: 'CA', name: 'Canada' }, { code: 'DE', name: 'Allemagne' }, { code: 'AT', name: 'Autriche' },
  { code: 'BG', name: 'Bulgarie' }, { code: 'CY', name: 'Chypre' }, { code: 'HR', name: 'Croatie' }, { code: 'DK', name: 'Danemark' },
  { code: 'ES', name: 'Espagne' }, { code: 'EE', name: 'Estonie' }, { code: 'FI', name: 'Finlande' }, { code: 'GR', name: 'Grèce' },
  { code: 'HU', name: 'Hongrie' }, { code: 'IE', name: 'Irlande' }, { code: 'IT', name: 'Italie' }, { code: 'LV', name: 'Lettonie' },
  { code: 'LT', name: 'Lituanie' }, { code: 'MT', name: 'Malte' }, { code: 'NL', name: 'Pays-Bas' }, { code: 'PL', name: 'Pologne' },
  { code: 'PT', name: 'Portugal' }, { code: 'CZ', name: 'République tchèque' }, { code: 'RO', name: 'Roumanie' }, { code: 'SK', name: 'Slovaquie' },
  { code: 'SI', name: 'Slovénie' }, { code: 'SE', name: 'Suède' }, { code: 'NO', name: 'Norvège' }, { code: 'GB', name: 'Royaume-Uni' },
  { code: 'US', name: 'États-Unis' }, { code: 'MA', name: 'Maroc' }, { code: 'TN', name: 'Tunisie' }, { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: 'Côte d\'Ivoire' },
];

export const countryName = (code?: string) => COUNTRIES.find(c => c.code === (code || 'FR').toUpperCase())?.name || code || 'France';

/** Libellé de l'identifiant d'entreprise selon le pays */
export const companyIdLabel = (code?: string, id = '') => {
  const c = (code || 'FR').toUpperCase();
  if (c === 'FR') return id.replace(/\s/g, '').length === 9 ? 'SIREN' : 'SIRET';
  if (c === 'BE') return 'BCE';
  return 'N° d\'entreprise';
};
