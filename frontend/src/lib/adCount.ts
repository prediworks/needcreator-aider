/**
 * Nombre de publicités montré : les publicités différentes (variantes regroupées). Meta compte chaque variante (visuels, formats, tests)
 * comme une publicité, d'où un total souvent bien plus grand. « + » : lecture arrêtée à la limite de 500. Même règle que backend/src/utils/adCount.js.
 */
export function adCount(s: { totalActive?: number; distinctActive?: number | null; capped?: boolean }) {
  const plus = s.capped ? '+' : '';
  const total = s.totalActive || 0;
  const distinct = s.distinctActive || 0;
  return { main: distinct ? `${distinct}${plus}` : `${total}${plus}`, n: distinct || total, versions: distinct && distinct !== total ? `${total}${plus}` : '' };
}
