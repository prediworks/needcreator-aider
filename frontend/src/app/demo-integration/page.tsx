import type { Metadata } from 'next';
import Link from 'next/link';
import EmbedDemo from '@/components/EmbedDemo';
import { fetchPublicConfig } from '@/lib/publicConfig';

const TITLE = 'Publications Instagram et TikTok intégrées dans NeedCreator : démonstration';
const DESCRIPTION = 'Comment NeedCreator affiche les publications Instagram et TikTok des créateurs (réalisations, vidéos livrées) directement dans la plateforme.';
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/demo-integration' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/demo-integration', type: 'website' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
};
export const revalidate = 300;

/** Page publique lue par le robot de Meta (revue « oEmbed Read ») : les publications et leurs permaliens sont dans le HTML initial */
export default async function EmbedDemoPage() {
  const cfg = await fetchPublicConfig();
  const urls = cfg.demoEmbedUrls?.length ? cfg.demoEmbedUrls : ['https://www.instagram.com/need.creator/'];
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Page publique · aucune connexion requise</div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Publications de créateurs intégrées dans NeedCreator</h1>
          <p className="text-lg text-neutral-600">Sur NeedCreator, les réalisations publiées par un créateur et les vidéos livrées à une marque s&apos;affichent directement dans la plateforme, sans quitter la page : sur la fiche publique du créateur (onglet Réalisations), sur la page de livraison d&apos;une mission et dans l&apos;espace de prospection. Voici le rendu, avec des publications publiques du compte @need.creator.</p>
        </div>
        <EmbedDemo urls={urls} />
        <div className="mt-10 text-sm text-neutral-600 border-t border-neutral-100 pt-6">
          <p className="mb-2"><strong className="text-neutral-800">Où cette intégration est utilisée</strong> : <Link href="/nos-createurs" className="text-primary-700 underline">fiches publiques des créateurs</Link> (onglet Réalisations : chaque lien Instagram, TikTok ou YouTube s&apos;affiche dans la carte), pages de livraison des missions (vidéos publiées par le créateur, visibles par la marque), espace de prospection (aperçu des publications trouvées).</p>
          <p>Le rendu utilise l&apos;intégration officielle de chaque réseau (Instagram oEmbed, TikTok oEmbed). Les publications affichées restent la propriété de leurs auteurs.</p>
        </div>
      </div>
    </div>
  );
}
