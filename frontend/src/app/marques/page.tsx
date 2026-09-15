import Link from 'next/link';
import type { Metadata } from 'next';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { CheckCircle, Shield, FileSignature, UserX, ShieldCheck, Clapperboard, Sparkles, Clock, ArrowRight, LayoutTemplate, Users, FileText, FolderOpen, Gift } from 'lucide-react';
import { SITE_URL } from '@/lib/legal';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';
import RegistryMock from '@/components/RegistryMock';

export const metadata: Metadata = {
  title: 'Trouver des créateurs UGC : NeedCreator pour les marques',
  description: 'Publiez un brief, recevez des devis de créateurs UGC vérifiés avec portfolio vidéo, payez le prix du devis à la validation ou offrez votre produit (gifting). Contrat de droits, garantie de remplacement et contrôle de conformité inclus.',
  alternates: { canonical: '/marques' },
};

export default async function BrandsPage() {
  const cfg = await fetchPublicConfig();
  const days = plural(cfg.autoApprovalDays, 'jour');

  const reasons: [any, string, string][] = [
    [Shield, 'Vous payez le prix du devis, rien de plus', `Le créateur fixe son prix, vous l'acceptez ou non. Le montant est bloqué sur votre carte à la sélection et débité uniquement quand vous validez les vidéos. Sans réponse de votre part sous ${days}, la validation est automatique.`],
    [Gift, 'Gifting : payez en produit', `Pas de budget vidéo ? Envoyez votre produit (${cfg.giftingMinProductValue} € de valeur minimum) à la place d'une rémunération. Le créateur qui accepte livre ses vidéos, contrôlées comme une mission payée, et vous gardez les droits prévus au brief. Gratuit en Pro, ${cfg.giftingFeePerVideo} € HT par vidéo livrée avec l'offre gratuite.`],
    [FolderOpen, 'Contenus & droits : le CRM de votre contenu créatif', 'Tous vos contenus et leurs contrats au même endroit, y compris ceux achetés ailleurs (agence, autre plateforme, direct) : créateur, type de contrat, supports, territoire, date de fin, facture, où c\'est utilisé. Rappels 30 et 7 jours avant expiration, renouvellement en un clic, import Excel, export.'],
    [FileSignature, 'Un contrat de cession de droits à chaque mission', 'Généré automatiquement à l\'acceptation du devis, en PDF : durée, supports, territoire, exclusivité. Vous êtes prévenu 30 jours avant l\'expiration et pouvez prolonger les droits.'],
    [ShieldCheck, 'Chaque vidéo est contrôlée avant votre validation', 'Nombre de vidéos, durée, format, résolution, son, et présence du produit dans la bande-son : un score de conformité au brief vous est présenté avant de valider.'],
    [UserX, 'Garantie de remplacement, sans frais', `Un créateur qui ne livre pas ? Après ${cfg.replacementGraceHours} h de retard, confiez la mission à l'un des autres devis reçus, en un clic. Le montant bloqué est libéré.`],
    [Clapperboard, 'Des vidéos prêtes à diffuser', 'En option, recevez chaque vidéo déclinée aux formats de chaque réseau (vertical, carré, horizontal), avec vignette et sous-titres automatiques. Publication Shopify en un clic.'],
    [Sparkles, 'Un brief guidé, rédigé avec vous', `Formulaire pas à pas, budget suggéré d'après les devis acceptés, rédaction assistée par l'IA (${cfg.aiBriefFreeQuota} briefs par mois offerts). Le nombre de révisions est écrit dans le devis que vous acceptez : pas de surprise après la livraison.`],
    [LayoutTemplate, 'Partez d\'un modèle, ou d\'une campagne passée', 'Six modèles de brief par secteur (beauté, e-commerce, food, tech, mode, services) pré-remplissent votre campagne. Dupliquez une campagne réussie en un clic. Campagnes privées, sur invitation, pour retravailler avec vos créateurs habituels.'],
    [Users, 'Toute votre équipe sur un seul compte', 'Invitez vos collaborateurs : chacun a son accès et agit au nom de l\'entreprise. Campagnes, missions et factures sont partagées. Seul le propriétaire gère l\'équipe, les informations administratives et l\'abonnement.'],
    [FileText, 'Factures automatiques, TVA gérée', 'Une facture PDF par mission, un avoir en cas de remboursement, un relevé mensuel pour votre comptable. Les devis sont hors taxes ; la TVA n\'est ajoutée que si le créateur y est assujetti, et c\'est indiqué avant d\'accepter.'],
  ];

  const steps: [string, string, string][] = [
    ['1', 'Publiez votre brief', 'Cinq minutes suffisent. Les créateurs de vos niches sont prévenus.'],
    ['2', 'Recevez des devis', 'Portfolio vidéo, prix, délai, droits cédés et score de matching pour chaque candidat.'],
    ['3', 'Sélectionnez et bloquez le montant', 'Votre carte est autorisée, pas débitée. Le contrat est généré.'],
    ['4', 'Validez, diffusez', 'Vidéos contrôlées, révisions prévues au devis, paiement à la validation. Chaque vidéo entre dans votre registre Contenus & droits, avec ses droits et sa date de fin ; la facture arrive toute seule.'],
  ];

  const faq: [string, string][] = [
    ['Combien coûte une vidéo UGC ?', `Les créateurs fixent leur prix hors taxes, généralement à partir de 80 €. Vous payez exactement le devis accepté, plus la TVA si le créateur y est assujetti (indiqué sur le devis). La commission de NeedCreator (${cfg.platformFeePercent} %) est retenue sur la part du créateur, jamais ajoutée à votre paiement. Vous recevez une facture pour chaque mission.`],
    ['Quand suis-je débité ?', `Jamais avant d'avoir vu les vidéos. Le montant est bloqué à la sélection et prélevé à votre validation, ou automatiquement ${days} après la livraison si vous ne répondez pas.`],
    ['Et si les vidéos ne conviennent pas ?', `Vous demandez des modifications, dans la limite prévue par le devis. Si le créateur ne livre pas, la garantie de remplacement s'applique. Si, révisions épuisées, les vidéos ne correspondent toujours pas au brief, vous ouvrez un litige : le créateur répond, notre équipe tranche, et le montant bloqué est réparti ou remboursé en conséquence.`],
    ['Puis-je payer en produit plutôt qu\'en argent ?', `Oui, c'est le gifting : vous créez une campagne « produit offert » (${cfg.giftingMinProductValue} € de valeur minimum), les créateurs intéressés candidatent, vous en sélectionnez un, vous lui envoyez le produit, il livre ses vidéos. Contrôle de conformité, contrat de droits et révisions fonctionnent comme pour une mission payée. Gratuit en Pro ; avec l'offre gratuite, ${cfg.giftingFeePerVideo} € HT de frais de service par vidéo livrée.`],
    ['Puis-je choisir mes créateurs à l\'avance ?', 'Oui. Invitez directement des créateurs depuis l\'annuaire, ou publiez une campagne privée : elle n\'est visible que des créateurs que vous invitez, sans annonce aux autres. Chaque créateur affiche sa disponibilité et, s\'il a suivi notre académie, un badge Formé.'],
    ['Puis-je retravailler avec le même créateur ?', `Oui, en un clic : « Reconduire avec ce créateur » depuis une mission validée crée une campagne privée avec le même brief et son dernier devis pré-rempli. NeedCreator vous offre une remise fidélité de ${cfg.repeatDiscountPercent} % sur le prix, sans rien retirer au créateur.`],
    ['Puis-je suivre les contenus achetés en dehors de NeedCreator ?', 'Oui. Le registre « Contenus & droits » accepte tout contenu et tout contrat artistique, d\'où qu\'il vienne : vous saisissez ou importez depuis Excel le créateur, le type de contrat, les dates, les supports, le territoire, le prix, les liens vers le contrat et la facture. Vous êtes prévenu avant chaque expiration et vous relancez le créateur en un clic.'],
    ['Comment fonctionnent les avis ?', 'En double aveugle, comme sur Airbnb : vous notez le créateur, il vous note, et les deux avis sont publiés en même temps. Personne n\'ajuste son avis en fonction de l\'autre. Vous pouvez répondre publiquement, une fois.'],
    ['Ai-je le droit d\'utiliser les vidéos en publicité ?', 'Oui si le devis le prévoit : les supports (organique, publicité, site, e-mail…), la durée et le territoire sont écrits dans le contrat. Vous pouvez acheter une prolongation à l\'expiration.'],
    ['Faut-il un abonnement ?', 'Non, et vous ne perdez rien : l\'offre gratuite comprend tout, campagnes illimitées, contrat de droits, garantie de remplacement, factures, équipe, modèles, sans limite de durée. L\'offre Pro n\'est utile qu\'à partir de plusieurs campagnes par mois : plusieurs créateurs par campagne, gifting sans frais de service, brief IA illimité.'],
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-50 to-white py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-6 text-sm font-medium text-primary-700">Pour les marques et les e-commerçants</div>
          <h1 className="text-4xl md:text-6xl font-bold text-neutral-900 mb-6">
            Des vidéos UGC livrées, contrôlées, <span className="text-primary-500">payées seulement si elles vous conviennent</span>
          </h1>
          <p className="text-xl text-neutral-600 mb-8 max-w-2xl mx-auto">
            Publiez un brief, choisissez un créateur vérifié sur son portfolio, rémunérez-le au prix de son devis ou avec votre produit offert. Débit à la validation seulement, contrat de droits, garantie de remplacement et registre de tous vos contenus, même achetés ailleurs, inclus.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register?role=brand"><Button size="lg" className="w-full sm:w-auto">Publier ma première campagne <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link href="/nos-createurs"><Button variant="outline" size="lg" className="w-full sm:w-auto">Voir des créateurs</Button></Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-neutral-600 flex-wrap">
            {['Gratuit et complet, Pro seulement pour le volume', 'Aucun frais ajouté au devis', 'Débit à la validation seulement'].map((t) => (
              <span key={t} className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-primary-500" />{t}</span>
            ))}
          </div>
          <p className="mt-5 text-sm text-neutral-700 flex items-center justify-center gap-2 flex-wrap"><Gift className="w-4 h-4 text-primary-600 shrink-0" /><span>Deux façons de rémunérer un créateur : <strong>un devis</strong>, ou <strong>votre produit offert</strong> (gifting), à partir de {cfg.giftingMinProductValue} € de valeur.</span></p>
          <Link href="#contenus-droits" className="mt-6 inline-flex items-center gap-2 bg-white border border-primary-200 rounded-full px-4 py-2 text-sm text-neutral-800 hover:border-primary-400">
            <FolderOpen className="w-4 h-4 text-primary-600" /> <span><strong>Inclus :</strong> le registre de tous vos contenus et de leurs droits, y compris ceux achetés ailleurs.</span> <span className="text-primary-600 underline">Voir comment</span>
          </Link>
        </div>
      </section>

      {/* Raisons */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Pourquoi les marques choisissent NeedCreator</h2>
            <p className="text-lg text-neutral-600">Tout ce qui fait perdre du temps ou de l&apos;argent sur une plateforme UGC, réglé à la racine.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reasons.map(([Icon, title, text]) => (
              <Card key={title} className="p-6">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4"><Icon className="w-6 h-6 text-primary-600" /></div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h3>
                <p className="text-sm text-neutral-600">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contenus & droits */}
      <section id="contenus-droits" className="py-20 bg-primary-50 scroll-mt-24">
        <div className="container mx-auto px-4 max-w-5xl grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center px-3 py-1 bg-white rounded-full mb-4 text-sm font-medium text-primary-700"><FolderOpen className="w-4 h-4 mr-2" /> Inclus, gratuit · aucun concurrent ne le propose</div>
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">Une vidéo diffusée après la fin des droits, c&apos;est un risque. NeedCreator vous prévient avant.</h2>
            <p className="text-lg text-neutral-700 mb-2"><strong>Même pour vos contenus achetés ailleurs</strong> : agence, autre plateforme, créateur contacté en direct.</p>
            <p className="text-neutral-700 mb-5">Chaque contenu avec son créateur, son contrat, ses supports, sa date de fin et l&apos;endroit où il est diffusé. Rappel 30 jours puis 7 jours avant l&apos;échéance, renouvellement en un clic, import Excel.</p>
            <Link href="/contenus-et-droits"><Button>Découvrir Contenus &amp; droits <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
          </div>
          <RegistryMock />
        </div>
      </section>

      {/* Étapes */}
      <section className="py-20 bg-neutral-50">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-3xl font-bold text-neutral-900 text-center mb-12">De votre brief à vos vidéos</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map(([n, title, sub]) => (
              <div key={n} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-4 text-lg font-bold">{n}</div>
                <h3 className="font-semibold text-neutral-900 mb-1">{title}</h3>
                <p className="text-sm text-neutral-600">{sub}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-neutral-500 mt-10 flex items-center justify-center gap-2"><Clock className="w-4 h-4" /> Premières vidéos en général sous 7 à 10 jours après la sélection.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold text-neutral-900 text-center mb-10">Questions fréquentes</h2>
          <div className="space-y-4">
            {faq.map(([q, a]) => (
              <Card key={q} className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-2">{q}</h3>
                <p className="text-sm text-neutral-600">{a}</p>
              </Card>
            ))}
          </div>
          <p className="text-center text-sm text-neutral-500 mt-8">Le détail des offres est sur la page <Link href="/pricing" className="text-primary-600 underline">Tarifs</Link>, le parcours complet sur <Link href="/how-it-works" className="text-primary-600 underline">Comment ça marche</Link>.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Votre première campagne en cinq minutes</h2>
          <p className="text-xl text-primary-50 mb-8">Gratuit, sans engagement. Vous ne payez qu&apos;un devis accepté, à la validation des vidéos.</p>
          <Link href="/register?role=brand"><Button size="lg" variant="outline" className="bg-white text-primary-600 hover:bg-primary-50 border-white">Créer mon compte marque</Button></Link>
        </div>
      </section>
    </div>
  );
}
