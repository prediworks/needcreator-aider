import type { Metadata } from 'next';
import Link from 'next/link';
import EmbedDemo from '@/components/EmbedDemo';

export const metadata: Metadata = {
  title: 'Publications intégrées : démonstration',
  description: 'Comment NeedCreator affiche les publications Instagram et TikTok des créateurs (réalisations, vidéos livrées) directement dans la plateforme.',
  alternates: { canonical: '/demo-integration' },
  robots: { index: false, follow: false },
};
export const revalidate = 300;

export default function EmbedDemoPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Page publique · aucune connexion requise</div>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Publications de créateurs intégrées dans NeedCreator</h1>
          <p className="text-lg text-neutral-600">Sur NeedCreator, les réalisations publiées par un créateur et les vidéos livrées à une marque s&apos;affichent directement dans la plateforme, sans quitter la page : sur la fiche publique du créateur (onglet Réalisations), sur la page de livraison d&apos;une mission et dans l&apos;espace de prospection. Voici le rendu, avec des publications publiques du compte @need.creator.</p>
        </div>
        <EmbedDemo />
        <div className="mt-10 text-sm text-neutral-600 border-t border-neutral-100 pt-6">
          <p className="mb-2"><strong className="text-neutral-800">Où cette intégration est utilisée</strong> : <Link href="/nos-createurs" className="text-primary-700 underline">fiches publiques des créateurs</Link> (onglet Réalisations : chaque lien Instagram, TikTok ou YouTube s&apos;affiche dans la carte), pages de livraison des missions (vidéos publiées par le créateur, visibles par la marque), espace de prospection (aperçu des publications trouvées).</p>
          <p>Le rendu utilise l&apos;intégration officielle de chaque réseau (Instagram oEmbed, TikTok oEmbed). Les publications affichées restent la propriété de leurs auteurs.</p>
        </div>
      </div>
    </div>
  );
}
