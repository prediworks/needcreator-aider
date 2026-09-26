import type { Metadata } from 'next';
import Link from 'next/link';
import QuoteCreateForm from '@/components/QuoteCreateForm';

export const metadata: Metadata = {
  title: 'Devis UGC gratuit : devis et contrat de cession de droits en PDF',
  description: 'Préparez un devis UGC propre en trois minutes, sans compte : client, mission, prix, durée des droits. Devis et contrat de cession de droits en PDF, acceptation en ligne, paiement sécurisé.',
  alternates: { canonical: '/devis-ugc' },
};
export const revalidate = 300;

export default function GuestQuotePage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Outil gratuit pour les créateurs</div>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 mb-3">Un devis UGC propre, en trois minutes</h1>
          <p className="text-lg text-neutral-600">Remplissez le devis ici, sans compte. Votre client reçoit un PDF avec le contrat de cession de droits et un lien pour accepter. S&apos;il paie via NeedCreator, le montant est bloqué avant que vous tourniez et versé à la validation.</p>
        </div>
        <QuoteCreateForm guest />
        <div className="grid md:grid-cols-3 gap-4 mt-8 text-sm text-neutral-700">
          <div className="border border-neutral-200 rounded-xl p-4"><div className="font-semibold text-neutral-900 mb-1">Ce que reçoit votre client</div>Un devis numéroté et un projet de contrat de cession de droits, en PDF, avec durée, supports, territoire et exclusivité écrits noir sur blanc.</div>
          <div className="border border-neutral-200 rounded-xl p-4"><div className="font-semibold text-neutral-900 mb-1">Ce que vous gagnez</div>Un lien d&apos;acceptation en un clic, le paiement sécurisé si le client passe par NeedCreator, ou « payé en direct » sans commission. Le devis rejoint votre registre des droits.</div>
          <div className="border border-neutral-200 rounded-xl p-4"><div className="font-semibold text-neutral-900 mb-1">Pourquoi un compte à la fin</div>Les PDF portent votre nom et vos informations administratives. Le compte est gratuit et sert aussi au <Link href="/calculateur-tarif-ugc" className="text-primary-700 underline">calculateur de tarif</Link>, au suivi de prospection et au registre des droits.</div>
        </div>
      </div>
    </div>
  );
}
