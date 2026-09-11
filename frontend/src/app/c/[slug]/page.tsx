import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NICHES } from '@/lib/labels';

/**
 * Kit média : adresse courte publique /c/<slug> → profil public du créateur.
 * Page serveur : métadonnées de partage (titre, description, image) puis redirection.
 */
async function fetchCreator(slug: string) {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/creators/slug/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await fetchCreator(params.slug);
  if (!c) return { title: 'Créateur introuvable' };
  const niches = (c.niches || []).map((n: string) => NICHES[n] || n).join(', ');
  const rating = c.stats?.totalReviews ? `${Number(c.stats.rating).toFixed(1)}/5 (${c.stats.totalReviews} avis)` : 'nouveau créateur';
  return {
    title: `${c.name}, créateur UGC${niches ? ` ${niches}` : ''}`,
    description: `${c.bio || `Portfolio vidéo UGC de ${c.name}.`} ${rating}, ${c.stats?.completedJobs || 0} mission(s) sur NeedCreator. Proposez-lui une mission.`.slice(0, 300),
    alternates: { canonical: `/c/${params.slug}` },
  };
}

export default async function CreatorShortPage({ params }: { params: { slug: string } }) {
  const c = await fetchCreator(params.slug);
  if (!c) notFound();
  redirect(`/profile/${c.id}?from=kit`);
}
