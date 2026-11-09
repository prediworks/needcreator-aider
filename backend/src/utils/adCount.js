/** « 62 publicités différentes (246 versions chez Meta) » : Meta compte chaque variante (visuels, formats, tests) comme une publicité */
export function countPhrase(s) {
  const total = `${s.totalActive || 0}${s.capped ? '+' : ''}`;
  if (!s.distinctActive) return `${total} publicités actives`;
  return s.distinctActive === s.totalActive ? `${s.distinctActive} publicités différentes` : `${s.distinctActive}${s.capped ? '+' : ''} publicités différentes (${total} versions chez Meta)`;
}
