import { getSetting, setSetting, SETTINGS } from '../models/Setting.js';

/**
 * Mots-clés des lots de l'extension, semaine par semaine : chaque lot a sa liste de lignes (Réglages → Prospection) et avance d'une ligne
 * quand il est lancé avec la ligne proposée. Un lot lancé avec d'autres mots (champ modifié à la main) ne fait pas avancer la rotation.
 */
const LISTS = { ad_library: 'rotationBrandKeywords', tiktok_ads: 'rotationBrandKeywords', partnerships: 'rotationPartnerTags', hashtags: 'rotationCreatorHashtags' };
const STATE_KEY = 'keywordRotationState';
const WEEK = 7 * 86400000;
const norm = (w) => String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^#/, '').trim();
const words = (line) => String(line || '').split(/[,;]+/).map(w => w.trim().replace(/^#/, '')).filter(Boolean);

async function lines(preset) {
  const def = SETTINGS[LISTS[preset]];
  const raw = String(await getSetting(def.key, def.default) || '').trim() || def.default;
  return raw.split(/\n+/).map(words).filter(l => l.length);
}

/** Pour chaque lot : la liste à lancer, sa place dans la rotation, et la date du dernier lancement de la rotation */
export async function rotationSuggestions(now = Date.now()) {
  const state = (await getSetting(STATE_KEY, {})) || {};
  const out = {};
  for (const preset of Object.keys(LISTS)) {
    const all = await lines(preset);
    if (!all.length) continue;
    const last = state[preset];
    const lastIndex = Number.isInteger(last?.index) && last.index < all.length ? last.index : -1;
    const index = (lastIndex + 1) % all.length;
    const lastAt = last?.at ? new Date(last.at) : null;
    out[preset] = { index, total: all.length, words: all[index], lastIndex: lastIndex >= 0 ? lastIndex : null, lastAt, doneThisWeek: !!lastAt && now - lastAt.getTime() < WEEK, nextFrom: lastAt ? new Date(lastAt.getTime() + WEEK) : null };
  }
  return out;
}

/** Lot lancé : si ses mots sont ceux d'une ligne de la rotation (deux sur trois au moins), cette ligne est notée comme faite */
export async function markRotationUsed(preset, used = [], now = new Date()) {
  if (!LISTS[preset] || !used.length) return null;
  const all = await lines(preset);
  const got = new Set(used.map(norm));
  let best = -1, bestScore = 0;
  all.forEach((l, i) => { const hit = l.filter(w => got.has(norm(w))).length / l.length; if (hit > bestScore) { bestScore = hit; best = i; } });
  if (best < 0 || bestScore < 2 / 3) return null;
  const state = { ...((await getSetting(STATE_KEY, {})) || {}) };
  state[preset] = { index: best, at: now.toISOString() };
  await setSetting(STATE_KEY, state);
  return best;
}
