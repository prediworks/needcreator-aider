import Link from 'next/link';
import type { Metadata } from 'next';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { CheckCircle, Shield, FileSignature, UserX, ShieldCheck, Clapperboard, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { SITE_URL } from '@/lib/legal';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';

export const metadata: Metadata = {
  title: 'Trouver des créateurs UGC : NeedCreator pour les marques',
  description: 'Publiez un brief, recevez des devis de créateurs UGC vérifiés avec portfolio vidéo, payez le prix du devis à la validation. Contrat de droits, garantie de remplacement et contrôle de conformité inclus.',
  alternates: { canonical: '/marques' },
};

export default async function BrandsPage() {
  const cfg = await fetchPublicConfig();
  const days = plural(cfg.autoApprovalDays, 'jour');
  const revisions = plural(cfg.maxRevisions, 'révision');

  const reasons: [any, string, string][] = [
    [Shield, 'Vous payez le prix du devis, rien de plus', `Le créateur fixe son prix, vous l'acceptez ou non. Le montant est bloqué sur votre carte à la sélection et débité uniquement quand vous validez les vidéos. Sans réponse de votre part sous ${days}, la validation est automatique.`],
    [FileSignature, 'Un contrat de cession de droits à chaque mission', 'Généré automatiquement à l\'acceptation du devis, en PDF : durée, supports, territoire, exclusivité. Vous êtes prévenu 30 jours avant l\'expiration et pouvez prolonger les droits.'],
    [ShieldCheck, 'Chaque vidéo est contrôlée avant votre validation', 'Nombre de vidéos, durée, format, résolution, son, et présence du produit dans la bande-son : un score de conformité au brief vous est présenté avant de valider.'],
    [UserX, 'Garantie de remplacement, sans frais', `Un créateur qui ne livre pas ? Après ${cfg.replacementGraceHours} h de retard, confiez la mission à l'un des autres devis reçus, en un clic. Le montant bloqué est libéré.`],
    [Clapperboard, 'Des vidéos prêtes à diffuser', 'En option, recevez chaque vidéo déclinée aux formats de chaque réseau (vertical, carré, horizontal), avec vignette et sous-titres automatiques. Publication Shopify en un clic.'],
    [Sparkles, 'Un brief guidé, rédigé avec vous', `Formulaire pas à pas, budget suggéré d'après les devis acceptés, rédaction assistée par l'IA (${cfg.aiBriefFreeQuota} briefs par mois offerts). ${revisions} incluses sur chaque livraison.`],
  ];

  const steps: [string, string, string][] = [
    ['1', 'Publiez votre brief', 'Cinq minutes suffisent. Les créateurs de vos niches sont prévenus.'],
    ['2', 'Recevez des devis', 'Portfolio vidéo, prix, délai, droits cédés et score de matching pour chaque candidat.'],
    ['3', 'Sélectionnez et bloquez le montant', 'Votre carte est autorisée, pas débitée. Le contrat est généré.'],
    ['4', 'Validez, diffusez', `Vidéos contrôlées, ${revisions} incluses, paiement à la validation. Vous gardez les droits convenus.`],
  ];

  const faq: [string, string][] = [
    ['Combien coûte une vidéo UGC ?', `Les créateurs fixent leur prix, généralement à partir de 80 €. Vous payez exactement le devis accepté : la commission de NeedCreator (${cfg.platformFeePercent} %) est retenue sur la part du créateur, jamais ajoutée à votre paiement.`],
    ['Quand suis-je débité ?', `Jamais avant d'avoir vu les vidéos. Le montant est bloqué à la sélection et prélevé à votre validation, ou automatiquement ${days} après la livraison si vous ne répondez pas.`],
    ['Et si les vidéos ne conviennent pas ?', `Vous demandez des modifications, ${revisions} incluses. Si le créateur ne livre pas, la garantie de remplacement s'applique. En cas de désaccord persistant, notre équipe intervient.`],
    ['Ai-je le droit d\'utiliser les vidéos en publicité ?', 'Oui si le devis le prévoit : les supports (organique, publicité, site, e-mail…), la durée et le territoire sont écrits dans le contrat. Vous pouvez acheter une prolongation à l\'expiration.'],
    ['Faut-il un abonnement ?', 'Non. L\'inscription et les campagnes sont gratuites. L\'offre Pro, facultative, ajoute le brief IA illimité, les campagnes multi-créateurs et le gifting.'],
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
            Des vidéos UGC livrées, contrôlées, <span className="text-primary-500">au prix du devis</span>
          </h1>
          <p className="text-xl text-neutral-600 mb-8 max-w-2xl mx-auto">
            Publiez un brief, choisissez un créateur vérifié sur son portfolio, payez uniquement quand les vidéos vous conviennent. Contrat de droits et garantie de remplacement inclus.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register?role=brand"><Button size="lg" className="w-full sm:w-auto">Publier ma première campagne <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link href="/nos-createurs"><Button variant="outline" size="lg" className="w-full sm:w-auto">Voir des créateurs</Button></Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-neutral-600 flex-wrap">
            {['Inscription gratuite', 'Aucun frais ajouté au devis', 'Débit à la validation seulement'].map((t) => (
              <span key={t} className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-primary-500" />{t}</span>
            ))}
          </div>
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
