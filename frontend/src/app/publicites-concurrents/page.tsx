import type { Metadata } from 'next';
import { Suspense } from 'react';
import AdScanTool from '@/components/AdScanTool';

export const metadata: Metadata = {
  title: 'Les publicités de vos concurrents : lesquelles tournent depuis des mois ?',
  description: 'Entrez le nom d\'une marque : ses publicités Meta actives en France, de la plus ancienne à la plus récente, les angles qu\'elle utilise et ceux qu\'elle laisse libres. Gratuit, sans compte. Puis commandez l\'équivalent en vidéo créateur.',
  alternates: { canonical: '/publicites-concurrents' },
};

export default function AdScanPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Outil gratuit pour les marques</div>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 mb-3">Vos concurrents font de la pub. Lesquelles marchent ?</h1>
          <p className="text-lg text-neutral-600 max-w-3xl mx-auto">Une publicité maintenue depuis trois mois est une publicité qui rapporte. Entrez le nom d&apos;une marque : ses publicités Meta actives, de la plus ancienne à la plus récente, les angles qu&apos;elle utilise, ceux qu&apos;elle laisse libres. Puis commandez l&apos;équivalent en vidéo créateur, avec l&apos;angle qui manque.</p>
        </div>
        <Suspense fallback={null}><AdScanTool /></Suspense>
        <div className="mt-12 grid md:grid-cols-3 gap-6 text-sm text-neutral-700">
          <div><h2 className="font-semibold text-neutral-900 mb-1">D&apos;où viennent les données</h2><p>De la bibliothèque publicitaire de Meta, publique par obligation de transparence européenne : texte, date de début, supports, ciblage déclaré. Meta ne donne ni les dépenses ni les résultats ; l&apos;ancienneté d&apos;une publicité est le meilleur indice qu&apos;on ait.</p></div>
          <div><h2 className="font-semibold text-neutral-900 mb-1">Ce que vous obtenez</h2><p>Les publicités classées par durée de diffusion, les angles comptés avec un exemple cité, les accroches qui reviennent, trois angles que personne n&apos;utilise. Des constats, pas de jugement. Une page publique, à partager.</p></div>
          <div><h2 className="font-semibold text-neutral-900 mb-1">Et ensuite</h2><p>« Commander l&apos;équivalent » prépare un brief NeedCreator : la version créateur de la publicité qui tourne depuis le plus longtemps, avec un angle libre, un format, un budget estimé. Vous relisez, vous publiez ; les créateurs proposent leur devis ; vous ne payez qu&apos;à la validation.</p></div>
        </div>
      </div>
    </div>
  );
}
