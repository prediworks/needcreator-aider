import type { Metadata } from 'next';
import { Suspense } from 'react';
import AdScanTool from '@/components/AdScanTool';

export const metadata: Metadata = {
  title: 'Audit créatif de vos publicités Meta : ce qui dure, ce qui se répète, ce qui manque',
  description: 'Entrez le nom de votre marque : vos publicités Meta actives lues par l\'IA. Ce qui tient dans la durée, les angles que vous répétez, ceux que vous n\'utilisez pas, cinq accroches à tester et trois vidéos créateur à commander. Gratuit, sans connecter votre compte publicitaire.',
  alternates: { canonical: '/audit-publicites' },
};

export default function AdAuditPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Outil gratuit pour les marques</div>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 mb-3">L&apos;audit créatif de vos publicités</h1>
          <p className="text-lg text-neutral-600 max-w-3xl mx-auto">Entrez le nom de votre marque. Vos publicités Meta actives sont lues par l&apos;IA : ce qui tient dans la durée, les angles que vous répétez, ceux que vous n&apos;utilisez pas, cinq accroches à tester et trois vidéos créateur prêtes à commander. Sans connecter votre compte publicitaire.</p>
        </div>
        <Suspense fallback={null}><AdScanTool mode="audit" /></Suspense>
        <div className="mt-12 grid md:grid-cols-3 gap-6 text-sm text-neutral-700">
          <div><h2 className="font-semibold text-neutral-900 mb-1">D&apos;où viennent les données</h2><p>De la bibliothèque publicitaire de Meta, publique par obligation de transparence européenne : le texte de vos publicités, leur date de début, leurs supports. Rien à connecter, rien à autoriser. Meta ne donne ni les dépenses ni les résultats : la durée de diffusion est le meilleur indice disponible.</p></div>
          <div><h2 className="font-semibold text-neutral-900 mb-1">Ce que vous obtenez</h2><p>Un diagnostic en trois phrases, ce qui distingue vos publicités qui durent, les angles répétés et les angles libres, des accroches pour les trois premières secondes, trois vidéos créateur avec leur format et leur durée.</p></div>
          <div><h2 className="font-semibold text-neutral-900 mb-1">Et ensuite</h2><p>Chaque vidéo proposée devient un brief NeedCreator en un clic : consignes, à faire, à éviter, budget estimé. Vous relisez, vous publiez ; des créateurs vérifiés proposent leur devis ; vous ne payez qu&apos;à la validation.</p></div>
        </div>
      </div>
    </div>
  );
}
