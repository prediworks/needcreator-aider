import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const FORMATS: Record<string, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  linkedin: { width: 1200, height: 627 },
};
const BADGES: Record<string, { title: string; emoji: string; line: string; color: string }> = {
  trained: { title: 'Formé NeedCreator', emoji: 'FORMÉ', line: 'Académie suivie : brief, lumière, son, devis', color: '#0a8f75' },
  ambassador: { title: 'Ambassadeur NeedCreator', emoji: 'AMBASSADEUR', line: 'Recommande NeedCreator aux créateurs', color: '#b45309' },
};

/** Badge partageable en image (story, carré, LinkedIn), réservé aux créateurs qui l'ont obtenu */
export async function GET(req: NextRequest, { params }: { params: { slug: string; kind: string } }) {
  const badge = BADGES[params.kind];
  const format = FORMATS[req.nextUrl.searchParams.get('format') || 'square'] || FORMATS.square;
  if (!badge) return new Response('Badge inconnu', { status: 404 });
  let c: any = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/creators/slug/${encodeURIComponent(params.slug)}`, { next: { revalidate: 300 } });
    if (res.ok) c = await res.json();
  } catch {}
  if (!c || !(c.badges || []).includes(params.kind)) return new Response('Badge non attribué', { status: 404 });
  const tall = format.height > format.width;
  const base = Math.round(format.width / 18);
  const jobs = c.stats?.completedJobs || 0;
  const meta = `Créateur UGC vérifié · ${jobs} mission${jobs > 1 ? 's' : ''}${c.stats?.totalReviews ? ` · note ${Number(c.stats.rating).toFixed(1)}/5` : ''}`;
  const site = `needcreator.com/c/${params.slug}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: base * 1.5, background: 'linear-gradient(160deg, #e6fbf6 0%, #ffffff 55%, #f5f5f4 100%)', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: base / 3, marginBottom: tall ? base * 2 : base }}>
          <div style={{ width: base, height: base, borderRadius: base / 4, background: '#05ddb2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: base / 2.2, fontWeight: 800 }}>NC</div>
          <div style={{ fontSize: base * 0.7, fontWeight: 700, color: '#111827' }}>NeedCreator</div>
        </div>
        <div style={{ display: 'flex', padding: `${base / 4}px ${base / 1.5}px`, borderRadius: base, background: badge.color, color: 'white', fontSize: base * 0.9, fontWeight: 800, letterSpacing: 2 }}>{badge.emoji}</div>
        <div style={{ fontSize: base * 1.35, fontWeight: 800, color: badge.color, marginTop: base / 2 }}>{badge.title}</div>
        <div style={{ fontSize: base * 0.6, color: '#374151', marginTop: base / 3 }}>{badge.line}</div>
        <div style={{ fontSize: base * 1.1, fontWeight: 700, color: '#111827', marginTop: base * (tall ? 1.6 : 0.9) }}>{c.name}</div>
        <div style={{ fontSize: base * 0.55, color: '#6b7280', marginTop: base / 3 }}>{meta}</div>
        <div style={{ fontSize: base * 0.5, color: '#0a8f75', marginTop: base * (tall ? 2 : 0.8) }}>{site}</div>
      </div>
    ),
    { ...format, headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
