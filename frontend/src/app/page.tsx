import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Sparkles, TrendingUp, Shield, Zap, CheckCircle, Video, Clock, FileSignature, UserX, ShieldCheck, FileText, Users, Bell } from 'lucide-react';
import type { Metadata } from 'next';
import { SITE_URL, COMPANY } from '@/lib/legal';
import FeaturedCreatorsSection from '@/components/FeaturedCreatorsSection';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';

export const metadata: Metadata = {
  title: 'NeedCreator : plateforme UGC pour marques et créateurs',
  description: 'Trouvez des créateurs UGC vérifiés en France. Publiez un brief, recevez des devis avec portfolio vidéo, payez le prix du devis à la validation, sans frais ajoutés. Révisions incluses.',
  alternates: { canonical: '/' },
};

const jsonLd = (cfg: { autoApprovalDays: number; replacementGraceHours: number }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'NeedCreator',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      email: COMPANY.contactEmail,
    },
    {
      '@type': 'WebSite',
      name: 'NeedCreator',
      url: SITE_URL,
      inLanguage: 'fr-FR',
    },
    {
      '@type': 'Service',
      name: 'Plateforme de contenu UGC',
      provider: { '@type': 'Organization', name: 'NeedCreator' },
      areaServed: 'FR',
      description: 'Mise en relation entre marques et créateurs de vidéos UGC, avec paiement sécurisé et validation garantie.',
      offers: { '@type': 'Offer', priceCurrency: 'EUR', price: '0', description: 'Inscription gratuite. La marque paie le prix du devis, sans frais ajoutés.' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Qu\'est-ce qu\'une vidéo UGC ?', acceptedAnswer: { '@type': 'Answer', text: 'Une vidéo UGC (user generated content) est un contenu authentique tourné par un créateur indépendant pour présenter un produit ou un service, dans le style des réseaux sociaux.' } },
        { '@type': 'Question', name: 'Combien coûte une vidéo UGC sur NeedCreator ?', acceptedAnswer: { '@type': 'Answer', text: 'Les créateurs fixent leur prix dans leur devis, généralement à partir de 80 €. La marque paie exactement ce prix hors taxes, plus la TVA si le créateur y est assujetti, sans frais ajoutés. NeedCreator retient une commission de 10 % sur le versement au créateur.' } },
        { '@type': 'Question', name: 'Quand le créateur est-il payé ?', acceptedAnswer: { '@type': 'Answer', text: 'Le montant est bloqué à la sélection du créateur et versé uniquement après validation de la livraison par la marque, ou automatiquement après ' + plural(cfg.autoApprovalDays, 'jour') + ' sans réponse.' } },
        { '@type': 'Question', name: 'Qui détient les droits sur les vidéos UGC ?', acceptedAnswer: { '@type': 'Answer', text: 'Les droits cédés (durée, supports, territoire, exclusivité) sont définis dans le devis du créateur et repris dans un contrat PDF généré à l\'acceptation. La marque est prévenue 30 jours avant l\'expiration et peut prolonger les droits.' } },
        { '@type': 'Question', name: 'Que se passe-t-il si le créateur ne livre pas ?', acceptedAnswer: { '@type': 'Answer', text: 'Après ' + cfg.replacementGraceHours + ' heures de retard, la marque peut confier la mission à l\'un des autres créateurs ayant envoyé un devis, en un clic. Le montant bloqué est libéré et la nouvelle mission démarre immédiatement.' } },
      ],
    },
  ],
});

export default async function HomePage() {
  const cfg = await fetchPublicConfig();
  const JSON_LD = jsonLd(cfg);
  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-50 to-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary-600 mr-2" />
              <span className="text-sm font-medium text-primary-700">
                La plateforme UGC la plus simple et transparente
              </span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 mb-6">
              Des vidéos UGC
              <span className="text-primary-500"> authentiques</span>, sans friction
            </h1>

            <p className="text-xl text-neutral-600 mb-8 max-w-2xl mx-auto">
              Publiez un brief, recevez des candidatures de créateurs vérifiés avec leur portfolio vidéo,
              payez uniquement à la validation.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/marques">
                <Button size="lg" className="w-full sm:w-auto">
                  Je suis une marque
                </Button>
              </Link>
              <Link href="/createurs">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Je suis créateur
                </Button>
              </Link>
            </div>

            <div className="mt-8 flex items-center justify-center gap-8 text-sm text-neutral-600 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>Vidéos dès 80€</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>Vous payez le prix du devis, rien de plus</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>Révisions incluses, précisées dans chaque devis</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Pourquoi NeedCreator ?
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Tout ce qui agace sur les plateformes UGC, en moins.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              [Zap, 'Matching intelligent', 'Chaque candidature affiche un score basé sur les niches, le budget, la note et la réactivité du créateur.'],
              [Shield, 'Paiement sécurisé', 'Le montant est bloqué via Stripe à la sélection et versé au créateur seulement après votre validation.'],
              [Clock, 'Validation automatique', `Sans réponse de la marque sous ${plural(cfg.autoApprovalDays, 'jour')}, la livraison est approuvée. Personne ne reste bloqué.`],
              [FileSignature, 'Contrat et droits clairs', 'Chaque devis accepté génère un contrat de cession de droits en PDF. Durée, supports et territoire sont écrits, avec rappel avant expiration.'],
              [UserX, 'Garantie de remplacement', `Un créateur qui ne livre pas ? Après ${cfg.replacementGraceHours} h de retard, confiez la mission à un autre devis en un clic, sans frais.`],
              [ShieldCheck, 'Conformité vérifiée', 'À la livraison, durée, format, son et mention du produit sont contrôlés automatiquement avant votre validation.'],
              [Video, 'Portfolio vidéo interactif', 'Regardez les vidéos des créateurs directement dans la plateforme, sans téléchargement.'],
              [TrendingUp, 'Prix transparents', 'Le prix affiché est le prix payé. Aucun frais ajouté pour la marque, aucun abonnement obligatoire.'],
              [CheckCircle, 'Créateurs vérifiés et formés', 'Chaque profil est validé manuellement par notre équipe, avec 3 vidéos minimum et identité administrative renseignée. Une académie gratuite et un badge Formé distinguent les créateurs qui l\'ont suivie.'],
              [FileText, 'Factures automatiques', 'Une facture PDF par mission, émise au nom du créateur, un avoir en cas de remboursement, un relevé mensuel. TVA gérée selon le statut de chacun.'],
              [Users, 'Modèles, campagnes privées, équipe', 'Six modèles de brief par secteur, duplication d\'une campagne passée, campagnes visibles uniquement des créateurs invités, et des collaborateurs qui travaillent sur le même compte marque.'],
              [Bell, 'Rien ne s\'enlise', 'Relances automatiques à chaque étape, notifications dans l\'application, avis en double aveugle publiés ensemble, litiges arbitrés par notre équipe.'],
            ].map(([Icon, title, text]: any) => (
              <div key={title} className="text-center p-6">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold text-neutral-900 mb-2">{title}</h3>
                <p className="text-neutral-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-20 bg-neutral-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
            {[
              ['1', 'Publiez un brief', '5 minutes, budget suggéré'],
              ['2', 'Choisissez un créateur', 'Portfolio vidéo + score de matching'],
              ['3', 'Recevez vos vidéos', 'En moyenne sous 7 à 10 jours'],
              ['4', 'Validez et payez', 'Révisions incluses, précisées dans le devis'],
            ].map(([n, title, sub]) => (
              <div key={n}>
                <div className="text-4xl font-bold text-primary-500 mb-2">{n}</div>
                <div className="font-semibold text-neutral-900">{title}</div>
                <div className="text-sm text-neutral-600">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ambassadeurs (créateurs ayant autorisé la communication) : masqué s'il n'y en a pas encore */}
      <FeaturedCreatorsSection />

      {/* CTA Section */}
      <section className="py-20 bg-primary-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Prêt à créer du contenu authentique ?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Inscription gratuite. Vous ne payez qu&apos;au moment de sélectionner un créateur.
          </p>
          <Link href="/register">
            <Button variant="secondary" size="lg">
              Commencer gratuitement
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
