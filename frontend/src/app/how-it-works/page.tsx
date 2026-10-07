import Link from 'next/link';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export const metadata = {
  title: 'Comment ça marche',
  description: 'Côté marque : savoir quelles publicités marchent, préparer le brief, faire tourner les vidéos par des créateurs vérifiés, les diffuser en règle. Côté créateur : vendre ses vidéos au prix qu\'on fixe.',
  alternates: { canonical: '/how-it-works' },
};

type Step = { title: string; text: string; href?: string; cta?: string };
/** Côté marque : les quatre étapes du nouveau message (comprendre, préparer, produire, protéger) */
const brandPhases = (cfg: { autoApprovalDays: number; replacementGraceHours: number; giftingMinProductValue: number }): { n: string; phase: string; lead: string; steps: Step[] }[] => [
  { n: '1', phase: 'Comprendre', lead: 'Savoir quelles publicités faire, avant de tourner.', steps: [
    { title: 'Scannez vos concurrents', text: 'Tapez le nom d\'une marque : ses publicités Meta actives, de la plus ancienne à la plus récente. Une publicité maintenue trois mois est une publicité qui rapporte. L\'IA compte les angles utilisés et ceux laissés libres.', href: '/publicites-concurrents', cta: 'Scanner un concurrent' },
    { title: 'Auditez vos publicités', text: 'Ce qui tient dans la durée, ce que vous répétez, ce que vous n\'avez pas essayé, cinq accroches à tester et trois vidéos créateur à commander. Rien à connecter.', href: '/audit-publicites', cta: 'Auditer mes publicités' },
  ] },
  { n: '2', phase: 'Préparer', lead: 'Un brief prêt à publier, en un clic.', steps: [
    { title: 'Transformez une idée en brief', text: 'Depuis une publicité scannée, une vidéo proposée par l\'audit ou un simple lien produit : angle, accroche, format, durée, consignes et budget estimé selon le marché. Ou partez d\'un modèle par secteur, ou d\'une campagne passée.', href: '/brief-depuis-url', cta: 'Mon brief depuis un lien produit' },
    { title: 'Choisissez comment rémunérer', text: `Un devis du créateur, ou votre produit offert à la place (gifting, ${cfg.giftingMinProductValue} € de valeur minimum). Campagne publique, ou privée sur invitation.` },
  ] },
  { n: '3', phase: 'Produire', lead: 'Des créateurs vérifiés, payés seulement à la validation.', steps: [
    { title: 'Recevez des devis, ou une vidéo déjà tournée', text: 'Les créateurs de vos niches sont notifiés ; chaque devis affiche un score de correspondance, le prix et le portfolio vidéo. Ou un créateur qui possède votre produit vous envoie une vidéo finie : vous la regardez en filigrane, vous ne payez que si vous la gardez.', href: '/candidature-spontanee', cta: 'La candidature spontanée' },
    { title: 'Sélectionnez : le paiement est bloqué', text: 'Le montant du devis est réservé via Stripe : c\'est exactement ce que vous payez, sans frais ajoutés. Il n\'est versé au créateur qu\'après votre validation.' },
    { title: 'Validez les vidéos', text: `Regardez-les en ligne, avec un score de conformité au brief (durée, format, son, mention du produit). Approuvez, ou demandez des modifications dans la limite prévue par le devis. Sans réponse sous ${plural(cfg.autoApprovalDays, 'jour')}, la livraison est validée automatiquement. Créateur en retard de plus de ${cfg.replacementGraceHours} h : confiez la mission à un autre devis en un clic. Révisions épuisées et vidéo toujours hors brief : notre équipe tranche.` },
  ] },
  { n: '4', phase: 'Protéger', lead: 'Diffuser en règle, aussi longtemps que vous en avez le droit.', steps: [
    { title: 'Un contrat de droits par vidéo', text: 'À chaque devis accepté, un contrat PDF de mission et de cession de droits : durée, supports, territoire. La facture est générée automatiquement.' },
    { title: 'Un registre de tous vos contenus', text: 'Toutes vos vidéos et leurs droits, y compris celles achetées ailleurs. Alerte 30 jours avant chaque expiration, prolongation en un clic. Pack prêt à diffuser et publication Shopify en option.', href: '/contenus-et-droits', cta: 'Le registre des droits' },
  ] },
];

const creatorSteps = (cfg: { autoApprovalDays: number; externalQuoteFeePercent: number }) => [
  ['1', 'Créez votre profil', 'Bio, niches, tarif minimum et 3 vidéos de portfolio, protégées par un filigrane. Validation par notre équipe sous 24h. Vous obtenez une page publique avec QR code : votre kit média.'],
  ['2', 'Envoyez vos devis', 'Un feed personnalisé selon vos niches. Vous fixez votre prix, votre délai et les droits que vous cédez (durée, supports, territoire).'],
  ['3', 'Ou proposez une vidéo déjà tournée', 'Vous avez chez vous un produit d\'une marque ? Scannez ses publicités pour voir celle qui tourne depuis des mois, tournez votre version, fixez votre prix : la marque la reçoit finie et l\'achète en un clic. C\'est la candidature spontanée.'],
  ['4', 'Produisez', 'Une fois sélectionné, le paiement est déjà bloqué : vous savez que vous serez payé. Vous recevez le montant de votre devis HT moins la commission de 10 %, et vos factures sont émises en votre nom. Votre page « Mes missions » suit chaque échéance.'],
  ['5', 'Livrez et soyez payé', 'Envoyez vos vidéos, la marque valide (ou ' + plural(cfg.autoApprovalDays, 'jour') + ' max), le virement part sur votre compte Stripe, à une date affichée dans votre calendrier de paiements. Quand les droits arrivent à expiration, la marque peut vous acheter une prolongation.'],
  ['6', 'Notez la marque', 'Avis en double aveugle : chacun note sans voir l\'avis de l\'autre, les deux sont publiés ensemble. La réactivité des marques est visible par tous les créateurs, et chacun peut répondre publiquement à un avis.'],
  ['7', 'Gérez aussi vos clients hors plateforme', 'Suivi de prospection, devis et contrat en un clic, registre de vos droits et exclusivités, revenus et seuils micro-entreprise, calculateur de tarif : vos outils pour toute votre activité, gratuits. Si votre client paie via NeedCreator, le montant est bloqué puis versé à la validation, et la commission de ' + cfg.externalQuoteFeePercent + ' % s\'applique, comme pour une mission classique.'],
];

export default async function HowItWorksPage() {
  const cfg = await fetchPublicConfig();
  const BRAND_PHASES = brandPhases(cfg);
  const CREATOR_STEPS = creatorSteps(cfg);
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-3">Comment ça marche</h1>
          <p className="text-lg text-neutral-600 max-w-3xl mx-auto">Pour les marques : savoir quelles publicités marchent, les faire tourner par des créateurs, les diffuser en règle. Pour les créateurs : vendre leurs vidéos, au prix qu&apos;ils fixent.</p>
        </div>

        <div className="grid gap-8">
          <Card className="p-8" data-testid="how-brand">
            <h2 className="text-2xl font-bold text-neutral-900 mb-1">🏢 Pour les marques</h2>
            <p className="text-neutral-600 mb-6">De l&apos;idée à la publicité, en quatre étapes. Les outils des étapes 1 et 2 sont gratuits, sans abonnement.</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {BRAND_PHASES.map((ph) => (
                <div key={ph.n} className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center flex-shrink-0 font-semibold">{ph.n}</span><span className="text-lg font-bold text-neutral-900">{ph.phase}</span></div>
                  <p className="text-sm text-primary-700 font-medium mb-3">{ph.lead}</p>
                  <ul className="space-y-4">
                    {ph.steps.map((st) => (
                      <li key={st.title}>
                        <div className="font-semibold text-neutral-900 text-sm">{st.title}</div>
                        <div className="text-sm text-neutral-600">{st.text}</div>
                        {st.href && <Link href={st.href} className="text-sm text-primary-700 underline">{st.cta}</Link>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/publicites-concurrents"><Button variant="outline" className="w-full sm:w-auto">Scanner un concurrent</Button></Link>
              <Link href="/register?role=brand"><Button className="w-full sm:w-auto">Créer ma première campagne</Button></Link>
            </div>
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
              commission réduite à {cfg.ambassadorFeePercent} % au lieu de {cfg.platformFeePercent} %, campagnes {cfg.earlyAccessHours} h en avant-première, devis remontés en tête chez les marques, place en tête de l&apos;annuaire, présence sur notre page d&apos;accueil si vous l&apos;autorisez,
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
              <div className="font-semibold text-neutral-900 mb-1">Ce qui marche, avant de tourner</div>
              <p className="text-neutral-600">Les publicités de vos concurrents classées par durée de diffusion et l&apos;audit des vôtres, lues par l&apos;IA sans jugement : des constats comptés, puis un brief en un clic. <Link href="/publicites-concurrents" className="text-primary-700 underline">Essayer</Link></p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Contrat de cession de droits automatique</div>
              <p className="text-neutral-600">À chaque devis accepté, un contrat PDF reprend les parties, la mission, le prix et les droits cédés. Rappel 30 jours avant expiration, prolongation en un clic.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Candidature spontanée en vidéo</div>
              <p className="text-neutral-600">Un créateur tourne une vidéo avec votre produit sans que vous l&apos;ayez demandé. Vous la regardez en filigrane, vous ne payez que si vous la gardez. <Link href="/candidature-spontanee" className="text-primary-600 underline">Comment ça marche</Link></p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Garantie de remplacement</div>
              <p className="text-neutral-600">Un créateur en retard de plus de {cfg.replacementGraceHours} h ? La marque confie la mission à un autre devis, le montant bloqué est libéré, sans frais.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Score de conformité</div>
              <p className="text-neutral-600">Durée, format, résolution, son et mention du produit vérifiés automatiquement à la livraison, avant validation.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Prix affichés partout</div>
              <p className="text-neutral-600">Pour la marque, le prix du devis HT est le prix payé (TVA en sus si le créateur y est assujetti). Pour le créateur, une commission de 10 % est retenue sur le versement. Rien d'autre.</p>
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
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Factures, avoirs et relevés automatiques</div>
              <p className="text-neutral-600">Une facture PDF par mission, émise au nom du créateur grâce au mandat de facturation, un avoir en cas de remboursement, un relevé mensuel pour chaque comptable. TVA appliquée selon le statut du créateur.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Avis en double aveugle</div>
              <p className="text-neutral-600">Marque et créateur se notent sans voir l&apos;avis de l&apos;autre ; les deux sont publiés ensemble. Un désaccord sur une livraison devient un litige arbitré par notre équipe, après réponse du créateur.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Devis et contrats pour vos clients hors plateforme</div>
              <p className="text-neutral-600">Un créateur fait un devis et un contrat de cession en un clic pour un client rencontré ailleurs. Le client peut payer via NeedCreator, montant bloqué, contrat, facture, ou en direct : outils gratuits.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Académie et kit média pour les créateurs</div>
              <p className="text-neutral-600">Cinq guides gratuits avec quiz, un badge Formé qui compte dans le classement des candidatures, une page publique avec QR code, un calendrier de paiements et le suivi des seuils micro-entreprise.</p>
            </div>
            <div>
              <div className="font-semibold text-neutral-900 mb-1">Modèles, campagnes privées et équipe</div>
              <p className="text-neutral-600">Six modèles de brief par secteur, duplication d&apos;une campagne passée, campagnes visibles des seuls créateurs invités, et plusieurs collaborateurs sur le même compte marque.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
