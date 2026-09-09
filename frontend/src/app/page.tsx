import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Sparkles, TrendingUp, Shield, Zap, CheckCircle, Video, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import { SITE_URL, COMPANY } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'NeedCreator : plateforme UGC pour marques et créateurs',
  description: 'Trouvez des créateurs UGC vérifiés en France. Publiez un brief, recevez des devis avec portfolio vidéo, payez à la validation. Commission unique de 10 %, 2 révisions incluses.',
  alternates: { canonical: '/' },
};

const JSON_LD = {
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
      offers: { '@type': 'Offer', priceCurrency: 'EUR', price: '0', description: 'Inscription gratuite, commission de 10 % par mission' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Qu\'est-ce qu\'une vidéo UGC ?', acceptedAnswer: { '@type': 'Answer', text: 'Une vidéo UGC (user generated content) est un contenu authentique tourné par un créateur indépendant pour présenter un produit ou un service, dans le style des réseaux sociaux.' } },
        { '@type': 'Question', name: 'Combien coûte une vidéo UGC sur NeedCreator ?', acceptedAnswer: { '@type': 'Answer', text: 'Les créateurs fixent leur prix dans leur devis, généralement à partir de 80 €. NeedCreator prélève une commission unique de 10 %, ou 8 % avec l\'abonnement Pro.' } },
        { '@type': 'Question', name: 'Quand le créateur est-il payé ?', acceptedAnswer: { '@type': 'Answer', text: 'Le montant est bloqué à la sélection du créateur et versé uniquement après validation de la livraison par la marque, ou automatiquement après 7 jours sans réponse.' } },
      ],
    },
  ],
};

export default function HomePage() {
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
              <Link href="/register?role=brand">
                <Button size="lg" className="w-full sm:w-auto">
                  Je suis une marque
                </Button>
              </Link>
              <Link href="/register?role=creator">
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
                <span>Commission unique de 10%</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>2 révisions incluses</span>
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
              [Clock, 'Validation automatique', 'Sans réponse de la marque sous 7 jours, la livraison est approuvée. Personne ne reste bloqué.'],
              [Video, 'Portfolio vidéo interactif', 'Regardez les vidéos des créateurs directement dans la plateforme, sans téléchargement.'],
              [TrendingUp, 'Prix transparents', 'Budget par vidéo affiché partout, commission de 10% annoncée dès le départ.'],
              [CheckCircle, 'Créateurs vérifiés', 'Chaque profil est validé manuellement par notre équipe, avec 3 vidéos minimum.'],
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
              ['4', 'Validez et payez', 'Ou 2 révisions incluses'],
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
