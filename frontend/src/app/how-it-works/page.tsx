import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export const metadata = { title: 'Comment ça marche - NeedCreator' };

const BRAND_STEPS = [
  ['1', 'Créez votre campagne', 'Titre, brief guidé, budget suggéré selon le marché. 5 minutes suffisent.'],
  ['2', 'Recevez des candidatures', 'Les créateurs de vos niches sont notifiés. Chaque candidature affiche un score de matching, le prix et le portfolio vidéo.'],
  ['3', 'Sélectionnez et bloquez le paiement', 'Le montant est réservé via Stripe. Il n\'est versé au créateur qu\'après votre validation.'],
  ['4', 'Validez les vidéos', 'Regardez-les directement en ligne. Approuvez, ou demandez jusqu\'à 2 révisions. Sans réponse sous 7 jours, la livraison est validée automatiquement.'],
  ['5', 'Notez le créateur', 'Votre avis aide toute la communauté à trouver les bons profils.'],
];

const CREATOR_STEPS = [
  ['1', 'Créez votre profil', 'Bio, niches, tarif minimum et 3 vidéos de portfolio. Validation par notre équipe sous 24h.'],
  ['2', 'Candidatez aux campagnes', 'Un feed personnalisé selon vos niches, avec le prix affiché dès le départ.'],
  ['3', 'Produisez', 'Une fois sélectionné, le paiement est déjà bloqué : vous savez que vous serez payé.'],
  ['4', 'Livrez et soyez payé', 'Envoyez vos vidéos, la marque valide (ou 7 jours max), le virement part sur votre compte Stripe.'],
  ['5', 'Notez la marque', 'La réactivité des marques est visible par tous les créateurs.'],
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-3">Comment ça marche</h1>
          <p className="text-lg text-neutral-600">Simple, transparent, sécurisé. Des deux côtés.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">🏢 Pour les marques</h2>
            <ol className="space-y-5">
              {BRAND_STEPS.map(([n, title, text]) => (
                <li key={n} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center flex-shrink-0 font-semibold">{n}</div>
                  <div>
                    <div className="font-semibold text-neutral-900">{title}</div>
                    <div className="text-sm text-neutral-600">{text}</div>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/register?role=brand" className="block mt-8">
              <Button className="w-full">Créer ma première campagne</Button>
            </Link>
          </Card>

          <Card className="p-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">🎥 Pour les créateurs</h2>
            <ol className="space-y-5">
              {CREATOR_STEPS.map(([n, title, text]) => (
                <li key={n} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-secondary-500 text-white flex items-center justify-center flex-shrink-0 font-semibold">{n}</div>
                  <div>
                    <div className="font-semibold text-neutral-900">{title}</div>
                    <div className="text-sm text-neutral-600">{text}</div>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/register?role=creator" className="block mt-8">
              <Button variant="secondary" className="w-full">Devenir créateur</Button>
            </Link>
          </Card>
        </div>

        <Card className="p-8 mt-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Ce qui nous différencie</h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Prix affichés partout</div>
              <p className="text-neutral-600">Budget par vidéo visible dès la liste des campagnes. Commission unique de 10%, sans surprise.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Validation automatique à 7 jours</div>
              <p className="text-neutral-600">Un créateur n&apos;attend jamais indéfiniment une marque silencieuse. Rappels à J+3 et J+6.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Paiement sécurisé Stripe</div>
              <p className="text-neutral-600">Montant bloqué à la sélection, versé à la validation. Ni séquestre, ni facture à relancer.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
