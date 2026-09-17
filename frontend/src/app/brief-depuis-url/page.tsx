import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import ProductBriefTool from '@/components/ProductBriefTool';

export const metadata: Metadata = {
  title: 'Brief UGC depuis une URL produit : collez votre lien, le brief est prêt',
  description: 'Collez l\'adresse d\'une fiche produit (Shopify, WooCommerce ou autre) : NeedCreator lit la page, propose trois angles créatifs, un format, un budget estimé et un brief prêt à publier. Gratuit, sans compte.',
  alternates: { canonical: '/brief-depuis-url' },
};

export default function ProductBriefPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Outil gratuit pour les marques</div>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 mb-3">Votre brief UGC à partir d&apos;un lien produit</h1>
          <p className="text-lg text-neutral-600 max-w-3xl mx-auto">Collez l&apos;adresse de votre fiche produit. En trente secondes : positionnement, cible, trois angles créatifs, format recommandé, budget estimé et un brief complet, prêt à publier auprès de créateurs vérifiés.</p>
        </div>
        <Suspense fallback={null}><ProductBriefTool /></Suspense>
        <div className="mt-12 grid md:grid-cols-3 gap-6 text-sm text-neutral-700">
          <div><h2 className="font-semibold text-neutral-900 mb-1">Ce que l&apos;outil lit</h2><p>Le nom, la description, le prix et la marque de la fiche (données structurées, Open Graph ou texte de la page). Rien n&apos;est inventé : ce qui manque sur la page manque dans le brief.</p></div>
          <div><h2 className="font-semibold text-neutral-900 mb-1">Ce que vous obtenez</h2><p>Trois angles avec l&apos;accroche des trois premières secondes, un type de vidéo, une durée, un nombre de vidéos pour un premier test, un budget d&apos;après le <Link href="/calculateur-tarif-ugc" className="text-primary-600 underline">calculateur de tarif</Link>, et le brief détaillé.</p></div>
          <div><h2 className="font-semibold text-neutral-900 mb-1">Et ensuite</h2><p>Un clic crée la campagne en brouillon sur votre compte marque : vous relisez, ajustez, publiez. Les créateurs proposent leur devis ; vous ne payez qu&apos;à la validation des vidéos, ou en <Link href="/marques" className="text-primary-600 underline">produit offert</Link>.</p></div>
        </div>
      </div>
    </div>
  );
}
