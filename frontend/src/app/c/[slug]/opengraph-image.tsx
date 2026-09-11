import { ImageResponse } from 'next/og';
import { NICHES } from '@/lib/labels';

export const runtime = 'edge';
export const alt = 'Créateur UGC sur NeedCreator';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  let c: any = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/creators/slug/${encodeURIComponent(params.slug)}`);
    if (res.ok) c = await res.json();
  } catch {}
  const name = c?.name || 'Créateur UGC';
  const niches = (c?.niches || []).slice(0, 3).map((n: string) => NICHES[n] || n).join(' · ');
  const rating = c?.stats?.totalReviews ? `★ ${Number(c.stats.rating).toFixed(1)} · ${c.stats.totalReviews} avis` : 'Nouveau créateur';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: 'linear-gradient(135deg, #e6fbf6 0%, #ffffff 60%)', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#05ddb2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28 }}>▶</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#111827' }}>NeedCreator</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 30, color: '#0a8f75' }}>Créateur UGC{niches ? ` · ${niches}` : ''}</div>
          <div style={{ fontSize: 84, fontWeight: 800, color: '#111827', lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 32, color: '#374151' }}>{rating} · {c?.stats?.completedJobs || 0} mission(s)</div>
        </div>
        <div style={{ fontSize: 28, color: '#6b7280' }}>Portfolio vidéo et devis sur needcreator.com/c/{params.slug}</div>
      </div>
    ),
    { ...size }
  );
}
