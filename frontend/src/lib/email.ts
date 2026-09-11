/** Domaines d'email grand public (même liste que backend/src/utils/business.js) */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr',
  'live.com', 'live.fr', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'free.fr', 'orange.fr', 'wanadoo.fr',
  'sfr.fr', 'laposte.net', 'bbox.fr', 'numericable.fr', 'protonmail.com', 'proton.me', 'gmx.com', 'gmx.fr', 'yandex.com',
]);

export function emailDomain(email = '') {
  return String(email).split('@')[1]?.toLowerCase() || '';
}

export function isFreeEmail(email = '') {
  const d = emailDomain(email);
  return !!d && FREE_EMAIL_DOMAINS.has(d);
}
