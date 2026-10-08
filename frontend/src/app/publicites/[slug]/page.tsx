import type { Metadata } from 'next';
import { Suspense } from 'react';
import AdScanTool from '@/components/AdScanTool';
import CreatorAware from '@/components/CreatorAware';

/**
 * Page publique d'un scan concurrentiel : /publicites/<marque>. Rendue par le serveur pour le titre, la description et l'indexation
 * (référencée seulement si la marque a des publicités et que la page a été consultée) ; le contenu est chargé par le composant selon le palier du visiteur.
 */
async function fetchScan(slug: string) {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/ad-scans/${encodeURIComponent(slug)}`, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const d = await fetchScan(params.slug);
  const s = d?.scan;
  if (!s) return { title: 'Publicités d\'une marque', robots: { index: false, follow: false } };
  const oldest = s.stats?.oldestDays != null ? `, la plus ancienne tourne depuis ${s.stats.oldestDays} jours` : '';
  return {
    title: `Les publicités de ${s.pageName} : ${s.totalActive} active${s.totalActive > 1 ? 's' : ''} en France`,
    description: `${s.pageName} diffuse ${s.totalActive} publicité${s.totalActive > 1 ? 's' : ''} Meta en France${oldest}. Angles utilisés, accroches, angles libres : lecture factuelle, puis l'équivalent en vidéo créateur sur NeedCreator.`.slice(0, 300),
    alternates: { canonical: `/publicites/${params.slug}` },
    robots: d.indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default function AdScanSlugPage({ params }: { params: { slug: string } }) {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-6 text-sm text-neutral-600 flex gap-4 flex-wrap"><a href="/publicites-concurrents" className="underline">Scanner une autre marque</a><CreatorAware creator={<a href="/vitrine" className="underline">Mes candidatures spontanées</a>}><a href="/audit-publicites" className="underline">Auditer mes publicités</a></CreatorAware></div>
        <Suspense fallback={null}><AdScanTool initialSlug={params.slug} /></Suspense>
      </div>
    </div>
  );
}
