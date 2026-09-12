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
export function evaluateBusiness({ siret, vatNumber, website, email, country = 'FR', registrationNumber }) {
  const reasons = [];
  const siretOk = siret ? isValidSiret(siret) : false;
  const vatOk = vatNumber ? isValidVat(vatNumber) : false;
  const freeEmail = isFreeEmail(email);
  // Entreprise hors France sans identifiant vérifiable automatiquement : numéro au registre local → contrôle manuel systématique
  const foreign = String(country || 'FR').toUpperCase() !== 'FR';
  if (!siretOk && !vatOk && foreign && registrationNumber) {
    reasons.push(`Entreprise immatriculée hors France (${String(country).toUpperCase()}) : contrôle manuel sous 24 h à partir du numéro ${registrationNumber}${website ? '' : ' (ajoutez votre site web pour faciliter le contrôle)'}`);
    return { status: 'pending', reasons, identifierValid: false, freeEmail, foreign: true };
  }
  if (siret && !siretOk) reasons.push('SIRET invalide');
  if (vatNumber && !vatOk) reasons.push('Numéro de TVA invalide');
  if (!siretOk && !vatOk) reasons.push('Aucun identifiant d\'entreprise valide');
  const valid = siretOk || vatOk;
  // Règle : identifiant d'entreprise valide + un second signal de confiance (email au nom de l'entreprise OU site web) = vérifiée.
  // Email grand public (gmail…) sans site web = contrôle manuel sous 24 h.
  let status = 'rejected';
  if (valid) {
    if (!freeEmail || website) status = 'verified';
    else {
      status = 'pending';
      reasons.push('Email grand public sans site web : contrôle manuel sous 24 h (ajoutez votre site web pour une vérification immédiate)');
    }
  }
  return { status, reasons, identifierValid: valid, freeEmail };
}

/**
 * Interroge le registre national des entreprises (API publique, sans clé).
 * Retourne { found, active, legalName, address, siren, siret } ou { error } si le service ne répond pas.
 */
export async function lookupRegistry({ siret, siren }, timeoutMs = 6000) {
  const q = siret ? String(siret).replace(/\s/g, '') : String(siren || '').replace(/\s/g, '');
  if (!q) return { found: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=1`, { signal: controller.signal, headers: { 'User-Agent': 'NeedCreator/1.0' } });
    if (!res.ok) return { error: `registre HTTP ${res.status}` };
    const data = await res.json();
    const r = data.results?.[0];
    if (!r) return { found: false };
    const etab = siret ? (r.matching_etablissements || []).find(e => e.siret === q) || (r.siege?.siret === q ? r.siege : null) : r.siege;
    if (siret && !etab) return { found: false };
    const active = (etab?.etat_administratif || r.etat_administratif) === 'A' && r.etat_administratif === 'A';
    return {
      found: true,
      active,
      legalName: r.nom_raison_sociale || r.nom_complet,
      address: etab?.adresse || r.siege?.adresse || null,
      siren: r.siren,
      siret: etab?.siret || r.siege?.siret || null,
      activity: etab?.activite_principale || r.siege?.activite_principale || null,
    };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'registre injoignable (délai dépassé)' : `registre injoignable (${err.message})` };
  } finally {
    clearTimeout(timer);
  }
}
