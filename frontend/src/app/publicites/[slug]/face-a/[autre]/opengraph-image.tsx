import { ImageResponse } from 'next/og';

/** Vignette d'aperçu du duel : les deux marques et, pour chacune, son nombre de publicités et la plus ancienne. */
export const runtime = 'edge';
export const alt = 'Deux marques, leurs publicités comparées par NeedCreator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string; autre: string } }) {
  let d: any = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ad-scans/${encodeURIComponent(params.slug)}/duel/${encodeURIComponent(params.autre)}`, { cache: 'no-store', headers: { 'User-Agent': 'NeedCreator-Site/1.0' } });
    if (res.ok) d = await res.json();
  } catch {}
  const side = (s: any, first: boolean) => {
    const n = s?.distinctActive || s?.totalActive || 0;
    const name = String(s?.pageName || 'Une marque').slice(0, 26);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '28px 32px', borderRadius: 24, background: first ? '#e6fbf6' : '#ffffff', border: `2px solid ${first ? '#99e9d6' : '#e5e7eb'}` }}>
        <div style={{ fontSize: name.length > 16 ? 44 : 58, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>{name}</div>
        {s ? <div style={{ display: 'flex', fontSize: 34, color: '#374151', marginTop: 18 }}>{`${n}${s.capped ? '+' : ''} publicité${n > 1 ? 's' : ''}`}</div> : null}
        {s?.oldestDays != null ? <div style={{ display: 'flex', fontSize: 34, color: s.over90Days > 0 ? '#15803d' : '#374151', marginTop: 6 }}>{`la plus ancienne : ${s.oldestDays} j`}</div> : null}
      </div>
    );
  };
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'linear-gradient(135deg, #e6fbf6 0%, #ffffff 60%)', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#05ddb2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28 }}>▶</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#111827' }}>NeedCreator</div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#0a8f75' }}>Leurs publicités Meta, côte à côte</div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 24 }}>
          {side(d?.a, true)}
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, color: '#9ca3af' }}>face à</div>
          {side(d?.b, false)}
        </div>
      </div>
    ),
    { ...size }
  );
}
