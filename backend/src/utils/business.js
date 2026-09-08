/**
 * Vérification légère des entreprises : format SIRET (Luhn), TVA intracommunautaire, email professionnel
 */

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr',
  'live.com', 'live.fr', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'free.fr', 'orange.fr', 'wanadoo.fr',
  'sfr.fr', 'laposte.net', 'bbox.fr', 'numericable.fr', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.fr', 'yandex.com',
]);

export function isFreeEmail(email = '') {
  const domain = String(email).split('@')[1]?.toLowerCase();
  return !domain || FREE_EMAIL_DOMAINS.has(domain);
}

/**
 * SIRET : 14 chiffres, clé de Luhn valide
 */
export function isValidSiret(siret = '') {
  const digits = String(siret).replace(/\s/g, '');
  if (!/^\d{14}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let n = parseInt(digits[i], 10);
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/**
 * Numéro de TVA intracommunautaire : 2 lettres pays + 2 à 13 caractères ; FR : FRxx + SIREN valide
 */
export function isValidVat(vat = '') {
  const v = String(vat).replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(v)) return false;
  if (v.startsWith('FR')) {
    if (!/^FR[A-Z0-9]{2}\d{9}$/.test(v)) return false;
    const siren = v.slice(4);
    // Clé de Luhn du SIREN
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let n = parseInt(siren[i], 10);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    return sum % 10 === 0;
  }
  return true;
}

/**
 * Décide du statut de vérification : 'verified' si tout est cohérent, sinon 'pending' (contrôle admin)
 */
export function evaluateBusiness({ siret, vatNumber, website, email }) {
  const reasons = [];
  const siretOk = siret ? isValidSiret(siret) : false;
  const vatOk = vatNumber ? isValidVat(vatNumber) : false;
  if (siret && !siretOk) reasons.push('SIRET invalide');
  if (vatNumber && !vatOk) reasons.push('Numéro de TVA invalide');
  if (!siretOk && !vatOk) reasons.push('Aucun identifiant d\'entreprise valide');
  if (!website) reasons.push('Site web manquant');
  if (isFreeEmail(email)) reasons.push('Email non professionnel (contrôle manuel)');
  const valid = (siretOk || vatOk) && !!website;
  return {
    status: valid && !isFreeEmail(email) ? 'verified' : valid ? 'pending' : 'rejected',
    reasons,
    identifierValid: siretOk || vatOk,
  };
}
