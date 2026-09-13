import { NextRequest } from 'next/server';

const LEVELS: Record<string, string> = { new: 'Nouveau', confirmed: 'Confirmé', expert: 'Expert' };
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Widget « Créateur vérifié NeedCreator » (SVG) à intégrer dans une bio ou un site, avec lien vers le kit média */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  let c: any = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/creators/slug/${encodeURIComponent(params.slug)}`, { next: { revalidate: 300 } });
    if (res.ok) c = await res.json();
  } catch {}
  if (!c || !c.verified) return new Response('Créateur non vérifié', { status: 404 });
  const name = esc(String(c.name || '').slice(0, 26));
  const sub = esc(`${LEVELS[c.level] || 'Créateur'} · ${c.stats?.completedJobs || 0} mission${(c.stats?.completedJobs || 0) > 1 ? 's' : ''}${c.stats?.totalReviews ? ` · note ${Number(c.stats.rating).toFixed(1)}/5` : ''}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72" role="img" aria-label="Créateur vérifié NeedCreator">
  <rect x="0.5" y="0.5" width="239" height="71" rx="12" fill="#ffffff" stroke="#05ddb2"/>
  <rect x="12" y="16" width="40" height="40" rx="10" fill="#05ddb2"/>
  <path d="M28 26 L40 36 L28 46 Z" fill="#ffffff"/>
  <text x="64" y="26" font-family="Inter, Arial, sans-serif" font-size="8.5" fill="#0a8f75" font-weight="700" letter-spacing="0.3">CRÉATEUR VÉRIFIÉ NEEDCREATOR</text>
  <text x="64" y="43" font-family="Inter, Arial, sans-serif" font-size="14" fill="#111827" font-weight="700">${name}</text>
  <text x="64" y="59" font-family="Inter, Arial, sans-serif" font-size="10" fill="#6b7280">${sub}</text>
</svg>`;
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
