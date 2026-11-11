import { ImageResponse } from 'next/og';

/**
 * Vignette d'aperçu du lien d'un scan ou d'un audit (LinkedIn, WhatsApp, messageries) : le nom de la marque et ses trois chiffres,
 * à la place de l'aperçu générique du site.
 */
export const runtime = 'edge';
export const alt = 'Les publicités d\'une marque, lues par NeedCreator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  let s: any = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ad-scans/${encodeURIComponent(params.slug)}`, { cache: 'no-store', headers: { 'User-Agent': 'NeedCreator-Site/1.0' } });
    if (res.ok) s = (await res.json())?.scan;
  } catch {}
  const name = String(s?.pageName || 'Une marque').slice(0, 40);
  const distinct = s?.distinctActive || s?.totalActive || 0;
  const count = `${distinct}${s?.capped ? '+' : ''}`;
  const oldest = s?.stats?.oldestDays;
  const over90 = s?.stats?.over90Days ?? 0;
  const tiles: [string, string, boolean][] = s?.status === 'ready' ? [[count, distinct > 1 ? 'publicités actives' : 'publicité active', false], [oldest != null ? `${oldest} j` : '—', 'la plus ancienne', false], [String(over90), 'depuis plus de 90 jours', over90 > 0]] : [];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'linear-gradient(135deg, #e6fbf6 0%, #ffffff 60%)', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#05ddb2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28 }}>▶</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#111827' }}>NeedCreator</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 30, color: '#0a8f75' }}>Publicités Meta actives en France</div>
          <div style={{ fontSize: name.length > 22 ? 64 : 84, fontWeight: 800, color: '#111827', lineHeight: 1.05 }}>{name}</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {tiles.map(([value, label, strong], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 28px', borderRadius: 20, background: strong ? '#dcfce7' : '#ffffff', border: `2px solid ${strong ? '#86efac' : '#e5e7eb'}` }}>
              <div style={{ fontSize: 64, fontWeight: 800, color: strong ? '#15803d' : '#111827' }}>{value}</div>
              <div style={{ fontSize: 26, color: '#4b5563' }}>{label}</div>
            </div>
          ))}
          {!tiles.length && <div style={{ fontSize: 30, color: '#4b5563' }}>Ce qui tourne, depuis combien de temps, et les angles restés libres.</div>}
        </div>
      </div>
    ),
    { ...size }
  );
}
