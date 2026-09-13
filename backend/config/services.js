/**
 * Métiers / services proposés par les créateurs et demandés dans les lots d'une campagne.
 * Préparation de l'élargissement (photo, voix off, montage…) : la vidéo UGC reste le service par défaut,
 * tout profil ou campagne sans service explicite est traité comme « ugc ».
 * kind : type de livrable et de portfolio attendu ; minPortfolio : éléments de ce type requis pour candidater.
 */
export const SERVICES = [
  { key: 'ugc', label: 'Vidéo UGC', kind: 'video', minPortfolio: 3, description: 'Vidéos authentiques tournées par le créateur pour la marque.' },
  { key: 'social_video', label: 'Vidéo sociale (TikTok, Reels, Shorts)', kind: 'video', minPortfolio: 3, description: 'Formats courts verticaux pensés pour les réseaux.' },
  { key: 'product_photo', label: 'Photographie produit', kind: 'image', minPortfolio: 3, description: 'Photos de produit, packshot ou en situation.' },
  { key: 'voice_over', label: 'Voix off', kind: 'audio', minPortfolio: 2, description: 'Enregistrement de voix pour vidéos, publicités, tutoriels.' },
  { key: 'video_editing', label: 'Montage vidéo', kind: 'video', minPortfolio: 2, description: 'Montage et habillage de rushs fournis.' },
  { key: 'acting', label: 'Acteur / figurant', kind: 'video', minPortfolio: 1, description: 'Présence à l\'image dans les contenus de la marque.' },
  { key: 'influence', label: 'Influence / contenu sponsorisé', kind: 'video', minPortfolio: 3, description: 'Publication sur les propres comptes du créateur.' },
];
export const SERVICE_KEYS = SERVICES.map(s => s.key);
export const DEFAULT_SERVICE = 'ugc';
export const PORTFOLIO_KINDS = ['video', 'image', 'audio'];
export const serviceByKey = (key) => SERVICES.find(s => s.key === key) || SERVICES[0];
/** Type de média d'après le content-type ou l'extension */
export function kindFromFile(contentType = '', name = '') {
  const ct = String(contentType).toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('video/')) return 'video';
  const ext = String(name).toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  return 'video';
}
