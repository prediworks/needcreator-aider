import Link from 'next/link';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export const metadata = {
  title: 'Comment ça marche',
  description: 'Le parcours d\'une campagne UGC sur NeedCreator, côté marque et côté créateur : brief, devis, sélection, paiement bloqué, livraison, validation.',
  alternates: { canonical: '/how-it-works' },
};

const brandSteps = (cfg: { maxRevisions: number; autoApprovalDays: number }) => [
  ['1', 'Créez votre campagne', 'Titre, brief guidé, budget suggéré selon le marché. 5 minutes suffisent.'],
  ['2', 'Recevez des candidatures', 'Les créateurs de vos niches sont notifiés. Chaque candidature affiche un score de matching, le prix et le portfolio vidéo.'],
  ['3', 'Sélectionnez et bloquez le paiement', 'Le montant du devis est réservé via Stripe : c\'est exactement ce que vous payez, sans frais ajoutés. Il n\'est versé au créateur qu\'après votre validation. Un contrat de mission et de cession de droits en PDF est généré automatiquement.'],
  ['4', 'Validez les vidéos', 'Regardez-les directement en ligne, avec un score de conformité au brief (durée, format, son, mention du produit). Approuvez, ou demandez des modifications dans la limite prévue par le devis. Sans réponse sous ' + plural(cfg.autoApprovalDays, 'jour') + ', la livraison est validée automatiquement. Si le créateur ne livre pas, confiez la mission à un autre devis en un clic.'],
  ['5', 'Diffusez, puis prolongez si besoin', 'Pack vidéo prête à diffuser en option, publication Shopify en un clic. Vous êtes prévenu 30 jours avant la fin des droits et pouvez les prolonger.'],
];

const creatorSteps = (cfg: { autoApprovalDays: number }) => [
  ['1', 'Créez votre profil', 'Bio, niches, tarif minimum et 3 vidéos de portfolio. Validation par notre équipe sous 24h.'],
  ['2', 'Envoyez vos devis', 'Un feed personnalisé selon vos niches. Vous fixez votre prix, votre délai et les droits que vous cédez (durée, supports, territoire).'],
  ['3', 'Produisez', 'Une fois sélectionné, le paiement est déjà bloqué : vous savez que vous serez payé. Vous recevez le montant de votre devis moins la commission de 10 %.'],
  ['4', 'Livrez et soyez payé', 'Envoyez vos vidéos, la marque valide (ou ' + plural(cfg.autoApprovalDays, 'jour') + ' max), le virement part sur votre compte Stripe. Quand les droits arrivent à expiration, la marque peut vous acheter une prolongation.'],
  ['5', 'Notez la marque', 'La réactivité des marques est visible par tous les créateurs.'],
];

export default async function HowItWorksPage() {
  const cfg = await fetchPublicConfig();
  const BRAND_STEPS = brandSteps(cfg);
  const CREATOR_STEPS = creatorSteps(cfg);
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
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-neutral-800">
              <div className="font-semibold text-neutral-900 mb-1">🌟 Programme Ambassadeur</div>
              Publiez sur vos réseaux une vidéo sincère qui explique ce que NeedCreator vous apporte, avec votre lien de parrainage. Une fois validée :
              campagnes 24 h en avant-première, devis remontés en tête chez les marques, place en tête de l&apos;annuaire, présence sur notre page d&apos;accueil si vous l&apos;autorisez,
              et bonus de parrainage pour chaque créateur inscrit via votre lien. Plus de visibilité auprès des marques, donc plus de chances d&apos;être sélectionné.
            </div>
            <Link href="/register?role=creator" className="block mt-8">
              <Button variant="secondary" className="w-full">Devenir créateur</Button>
            </Link>
          </Card>
        </div>

        <Card className="p-8 mt-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-4">Ce qui nous différencie</h2>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Contrat de cession de droits automatique</div>
              <p className="text-neutral-600">À chaque devis accepté, un contrat PDF reprend les parties, la mission, le prix et les droits cédés. Rappel 30 jours avant expiration, prolongation en un clic.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Garantie de remplacement</div>
              <p className="text-neutral-600">Un créateur en retard de plus de 48 h ? La marque confie la mission à un autre devis, le montant bloqué est libéré, sans frais.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Score de conformité</div>
              <p className="text-neutral-600">Durée, format, résolution, son et mention du produit vérifiés automatiquement à la livraison, avant validation.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Prix affichés partout</div>
              <p className="text-neutral-600">Pour la marque, le prix du devis est le prix payé. Pour le créateur, une commission de 10 % est retenue sur le versement. Rien d'autre.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Validation automatique à {plural(cfg.autoApprovalDays, 'jour')}</div>
              <p className="text-neutral-600">Un créateur n&apos;attend jamais indéfiniment une marque silencieuse : rappels avant l&apos;échéance, puis validation et paiement automatiques.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Relances automatiques</div>
              <p className="text-neutral-600">Devis sans réponse, mission sans vidéo, produit non confirmé, révision sans nouvelle version : la plateforme relance la bonne personne au bon moment. Aucune mission ne s&apos;enlise en silence.</p>
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
