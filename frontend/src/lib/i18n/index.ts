/**
 * Langue d'affichage. Le français est la langue source du code ; l'anglais est appliqué à l'affichage par dictionnaire
 * (composant LangTranslator) : chaque texte français connu est remplacé par sa traduction, les autres restent en français.
 * Choix mémorisé dans un cookie (`nc_lang`) et, pour un compte connecté, dans les préférences du compte.
 * Seul un choix fait par le visiteur (sélecteur FR / EN, page /en) est mémorisé, avec le témoin `nc_lang_set` : sans lui, le site suit
 * la langue du navigateur à chaque visite (un téléphone repassé en français retrouve le français).
 */
export type Lang = 'fr' | 'en';
export const LANG_COOKIE = 'nc_lang';
export const LANG_CHOSEN_COOKIE = 'nc_lang_set';

export function readLangCookie(): Lang | null {
  if (typeof document === 'undefined') return null;
  // Un cookie de langue sans le témoin de choix vient d'une ancienne visite (langue devinée, pas choisie) : il ne compte pas
  if (!/(?:^|; )nc_lang_set=1/.test(document.cookie)) return null;
  const m = document.cookie.match(/(?:^|; )nc_lang=(fr|en)/);
  return m ? (m[1] as Lang) : null;
}

export function writeLangCookie(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  document.cookie = `${LANG_CHOSEN_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
}

/** Langue courante : choix du visiteur, sinon paramètre ?lang=, sinon langue du navigateur (anglais si non francophone), sinon français */
export function detectLang(): Lang {
  const c = readLangCookie();
  if (c) return c;
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'en' || q === 'fr') return q;
    const nav = (navigator.language || '').toLowerCase();
    if (nav && !nav.startsWith('fr')) return 'en';
  }
  return 'fr';
}
