/** Niches NeedCreator (clés) et mots-clés de recherche par défaut, modifiables dans l'admin (réglages « Prospection ») */
export const NICHE_KEYS = ['beauty', 'fashion', 'tech', 'food', 'travel', 'fitness', 'gaming', 'lifestyle', 'parenting', 'pets', 'home', 'business', 'education', 'health'];

export const DEFAULT_CREATOR_KEYWORDS = `beauty: créatrice UGC beauté ; routine skincare avis ; test maquillage
fashion: créatrice UGC mode ; haul vêtements ; essayage tenue
tech: créateur UGC tech ; test application ; unboxing gadget
food: créateur UGC food ; recette facile ; test produit alimentaire
fitness: créateur UGC fitness ; test complément sport ; routine sport maison
lifestyle: créateur UGC ; créatrice UGC ; ugc creator france
parenting: maman créatrice UGC ; test produit bébé ; vlog famille
pets: test produit chien ; test croquettes chat ; ugc animaux
home: décoration maison ugc ; test produit maison ; organisation rangement
health: bien-être ugc ; test complément alimentaire ; routine sommeil`;

export const DEFAULT_BRAND_KEYWORDS = `cosmétiques: sérum ; crème visage ; soin cheveux
compléments: complément alimentaire ; collagène ; magnésium
mode: sneakers ; robe ; lunettes de soleil
maison: bougie parfumée ; linge de lit ; rangement
food: granola ; café de spécialité ; chocolat
tech: montre connectée ; écouteurs ; application
bébé: poussette ; vêtements bébé ; jouet éveil
animaux: croquettes ; friandises chien ; litière chat`;

export const DEFAULT_INSTAGRAM_HASHTAGS = 'ugcfrance ; ugccreatorfrance ; creatriceugc ; createurugc ; ugccreator';
export function parseHashtags(text, fallback) { return (String(text || '').trim() || fallback).split(/[;,\n]/).map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean).slice(0, 25); }

/** « niche: mot ; mot ; mot » par ligne → [{ niche, keywords[] }] */
export function parseKeywordLines(text, fallback) {
  const src = String(text || '').trim() || fallback;
  return src.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map((line) => {
    const [niche, rest] = line.split(':');
    if (!rest) return null;
    return { niche: niche.trim().toLowerCase(), keywords: rest.split(';').map(k => k.trim()).filter(Boolean) };
  }).filter(Boolean);
}
