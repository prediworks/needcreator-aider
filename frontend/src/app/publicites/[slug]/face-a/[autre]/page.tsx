import type { Metadata } from 'next';
import { Suspense } from 'react';
import ScanDuel from '@/components/ScanDuel';

/**
 * Duel de deux marques déjà lues : /publicites/<marque>/face-a/<autre>. Page de partage (lien de relance, transfert à un responsable),
 * non référencée : la page de chaque marque reste la page indexée.
 */
async function names(slug: string, other: string) {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/ad-scans/${encodeURIComponent(slug)}/duel/${encodeURIComponent(other)}`, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    const d = await res.json();
    return { a: String(d.a?.pageName || ''), b: String(d.b?.pageName || '') };
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: { slug: string; autre: string } }): Promise<Metadata> {
  const n = await names(params.slug, params.autre);
  return {
    title: n?.a && n?.b ? `${n.a} face à ${n.b} : leurs publicités comparées` : 'Deux marques, leurs publicités comparées',
    description: n?.a && n?.b ? `Les publicités Meta de ${n.a} et de ${n.b} côte à côte : nombre, durée de diffusion, angles utilisés par l'une et pas par l'autre.` : undefined,
    robots: { index: false, follow: true },
  };
}

export default function ScanDuelPage({ params }: { params: { slug: string; autre: string } }) {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-6 text-sm text-neutral-600 flex gap-4 flex-wrap"><a href={`/publicites/${params.slug}`} className="underline">Revenir aux publicités</a><a href="/publicites-concurrents" className="underline">Scanner une autre marque</a></div>
        <Suspense fallback={null}><ScanDuel slug={params.slug} other={params.autre} /></Suspense>
      </div>
    </div>
  );
}
