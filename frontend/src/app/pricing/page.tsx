import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { CheckCircle } from 'lucide-react';

export const metadata = {
  title: 'Tarifs',
  description: 'Tarifs NeedCreator : la marque paie le prix du devis, sans frais ajoutés. Le créateur reçoit 90 % du devis. Offre Pro à 79 €/mois pour les marques.',
  alternates: { canonical: '/pricing' },
};

const EXAMPLES = [
  { videos: 1, price: 100 },
  { videos: 3, price: 300 },
  { videos: 5, price: 600 },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-3">Une tarification transparente</h1>
          <p className="text-lg text-neutral-600">
            Pour les marques : le prix du devis est le prix payé, rien ne s&apos;ajoute. Pour les créateurs : une commission de 10 % sur chaque mission payée.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Marques</h2>
            <div className="text-4xl font-bold text-primary-600 mb-1">0€ <span className="text-base font-normal text-neutral-500">ou Pro 79 €/mois</span></div>
            <p className="text-neutral-800 font-medium mb-2">Vous payez uniquement les vidéos, au prix du devis du créateur. Aucun frais ajouté.</p>
            <p className="text-neutral-600 mb-2">Gratuit : campagnes et briefs illimités, 3 rédactions de brief par l&apos;IA par mois, 1 créateur par campagne, 2 campagnes ouvertes en même temps jusqu&apos;à votre première campagne terminée.</p>
            <p className="text-neutral-600 mb-6">Pro : rédaction par l&apos;IA illimitée, campagnes multi-créateurs avec paiement groupé, gifting, sans limites. 14 jours d&apos;essai offerts à l&apos;inscription.</p>
            <ul className="space-y-2 text-sm text-neutral-700">
              {[
                'Vidéos UGC à partir de 80€',
                'Budget suggéré selon le marché à la création',
                'Paiement bloqué à la sélection, versé après validation',
                'Jusqu\'à 2 révisions incluses par mission',
                'Droits d\'utilisation inclus sur les contenus livrés',
                'Aucun frais tant que vous n\'avez pas sélectionné de créateur',
                'Campagnes gifting (Pro) : 5 € de frais de service par vidéo livrée, annoncés avant paiement',
              ].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />{t}</li>
              ))}
            </ul>
            <Link href="/register?role=brand" className="block mt-8">
              <Button className="w-full">Lancer une campagne</Button>
            </Link>
          </Card>

          <Card className="p-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Créateurs</h2>
            <div className="text-4xl font-bold text-secondary-500 mb-1">90%</div>
            <p className="text-neutral-600 mb-6">du prix de votre devis vous revient. NeedCreator retient une commission de 10 % sur chaque mission payée. Aucune commission sur le gifting.</p>
            <ul className="space-y-2 text-sm text-neutral-700">
              {[
                'Inscription gratuite',
                'Vous fixez librement le prix de chaque devis',
                'Paiement garanti : le montant est bloqué avant que vous ne commenciez',
                'Validation automatique si la marque ne répond pas sous 7 jours',
                'Virement automatique sur votre compte Stripe',
              ].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle className="w-4 h-4 text-secondary-500 mt-0.5 flex-shrink-0" />{t}</li>
              ))}
            </ul>
            <Link href="/register?role=creator" className="block mt-8">
              <Button variant="secondary" className="w-full">Devenir créateur</Button>
            </Link>
          </Card>
        </div>

        <Card className="p-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Exemples concrets</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b">
                  <th className="py-2 pr-4">Mission</th>
                  <th className="py-2 pr-4">Devis = prix payé par la marque</th>
                  <th className="py-2 pr-4">Commission NeedCreator (10 %)</th>
                  <th className="py-2">Reçu par le créateur</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((e) => (
                  <tr key={e.videos} className="border-b border-neutral-100">
                    <td className="py-3 pr-4 font-medium">{e.videos} vidéo{e.videos > 1 ? 's' : ''}</td>
                    <td className="py-3 pr-4">{e.price}€</td>
                    <td className="py-3 pr-4 text-neutral-600">{e.price * 0.1}€</td>
                    <td className="py-3 font-semibold text-green-700">{e.price * 0.9}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
