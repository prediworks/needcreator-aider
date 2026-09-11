import Link from 'next/link';
import type { Metadata } from 'next';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { CheckCircle, Euro, Lock, FileSignature, CalendarCheck, Star, Gift, ArrowRight, Clock } from 'lucide-react';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';
import FeaturedCreatorsSection from '@/components/FeaturedCreatorsSection';

export const metadata: Metadata = {
  title: 'Créateur UGC rémunéré : NeedCreator pour les créateurs',
  description: 'Vendez vos vidéos UGC aux marques sans publier sur votre compte. Vous fixez votre prix, le paiement est bloqué avant de tourner, un contrat protège vos droits. Inscription gratuite.',
  alternates: { canonical: '/createurs' },
};

export default async function CreatorsPage() {
  const cfg = await fetchPublicConfig();
  const days = plural(cfg.autoApprovalDays, 'jour');

  const reasons: [any, string, string][] = [
    [Euro, 'Vous fixez votre prix', 'Chaque campagne, vous envoyez un devis : prix, délai, droits cédés. La marque accepte ou non. Pas de grille imposée, pas d\'enchères à la baisse.'],
    [Lock, 'Payé, c\'est garanti', `Le montant est bloqué par la marque avant que vous tourniez. Vous recevez ${cfg.creatorSharePercent} % de votre devis dès la validation, ou automatiquement sous ${days} si la marque ne répond pas. Virement Stripe direct.`],
    [FileSignature, 'Un contrat qui protège vos droits', 'Durée, supports et territoire d\'utilisation de vos vidéos sont écrits dans un contrat généré à chaque mission. Quand les droits expirent, la marque vous achète une prolongation, au prix que vous fixez.'],
    [CalendarCheck, 'Des missions claires', 'Brief détaillé, date limite affichée, nombre de vidéos attendu, révisions cadrées. Vous savez exactement quoi livrer et quand vous serez payé.'],
    [Star, 'Devenez Ambassadeur', `Publiez une vidéo sur NeedCreator sur vos réseaux : vous voyez chaque campagne ${cfg.earlyAccessHours} h avant tout le monde, vos devis remontent en tête chez les marques et votre profil en tête de notre annuaire.`],
    [Gift, 'Parrainez, gagnez', `${cfg.referralCreatorBonus} € pour chaque créateur que vous parrainez et qui livre sa première mission. Et si vous aimez tester des produits, les campagnes gifting sont à vous, sans commission.`],
  ];

  const steps: [string, string, string][] = [
    ['1', 'Créez votre profil', `Nom, niches, ${cfg.minCreatorVideos} vidéos de portfolio. Validation sous 24 h.`],
    ['2', 'Envoyez vos devis', 'Un fil de campagnes selon vos niches. Votre prix, votre délai, vos conditions.'],
    ['3', 'Tournez sereinement', 'Sélectionné ? Le paiement est déjà bloqué et le contrat signé.'],
    ['4', 'Livrez, encaissez', `Envoyez vos vidéos. Validation par la marque ou automatique sous ${days}, puis virement Stripe.`],
  ];

  const faq: [string, string][] = [
    ['Faut-il beaucoup d\'abonnés ?', 'Non. L\'UGC est publié sur les comptes des marques, pas sur le vôtre. Les marques regardent votre portfolio, pas votre audience. Trois vidéos suffisent pour commencer.'],
    ['Combien je gagne par vidéo ?', `Le prix que vous demandez, moins la commission de ${cfg.platformFeePercent} %. Les devis acceptés démarrent en général autour de 80 € par vidéo et montent avec l'expérience et les droits cédés.`],
    ['Et si la marque ne répond pas ?', `Elle a ${days} pour valider ou demander une révision. Passé ce délai, la livraison est validée et le paiement part automatiquement. Personne ne reste bloqué.`],
    ['Dois-je avoir un statut ?', 'Oui, pour être payé : micro-entreprise ou société. Ces informations figurent sur le contrat de chaque mission. Le compte Stripe se connecte en deux minutes.'],
    ['C\'est gratuit ?', 'Oui. Aucun abonnement, aucun frais d\'inscription. La commission n\'est retenue que sur une mission payée.'],
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
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-6 text-sm font-medium text-primary-700">Pour les créateurs de contenu</div>
          <h1 className="text-4xl md:text-6xl font-bold text-neutral-900 mb-6">
            Vendez vos vidéos aux marques, <span className="text-primary-500">sans publier sur votre compte</span>
          </h1>
          <p className="text-xl text-neutral-600 mb-8 max-w-2xl mx-auto">
            Une source de revenus en plus : vous fixez votre prix, le paiement est bloqué avant de tourner, un contrat protège vos droits. Quelle que soit la taille de votre audience.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register?role=creator"><Button size="lg" className="w-full sm:w-auto">Créer mon profil créateur <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link href="/how-it-works"><Button variant="outline" size="lg" className="w-full sm:w-auto">Voir comment ça marche</Button></Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-neutral-600 flex-wrap">
            {['Inscription gratuite', `${cfg.creatorSharePercent} % du devis pour vous`, 'Paiement bloqué avant de tourner'].map((t) => (
              <span key={t} className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-primary-500" />{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Raisons */}
      <section className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Pourquoi les créateurs choisissent NeedCreator</h2>
            <p className="text-lg text-neutral-600">Ce que les plateformes UGC vous font subir, en moins. Ce qui vous fait gagner, en plus.</p>
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
          <h2 className="text-3xl font-bold text-neutral-900 text-center mb-12">De votre profil à votre premier virement</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map(([n, title, sub]) => (
              <div key={n} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-4 text-lg font-bold">{n}</div>
                <h3 className="font-semibold text-neutral-900 mb-1">{title}</h3>
                <p className="text-sm text-neutral-600">{sub}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-neutral-500 mt-10 flex items-center justify-center gap-2"><Clock className="w-4 h-4" /> Votre premier devis peut partir le jour de la validation de votre profil.</p>
        </div>
      </section>

      {/* Créateurs déjà là (affiché seulement s'il y en a) */}
      <FeaturedCreatorsSection />

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
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Cinq minutes pour créer votre profil</h2>
          <p className="text-xl text-primary-50 mb-8">Gratuit. Trois vidéos de portfolio, et vos premiers devis peuvent partir.</p>
          <Link href="/register?role=creator"><Button size="lg" variant="outline" className="bg-white text-primary-600 hover:bg-primary-50 border-white">Créer mon profil créateur</Button></Link>
        </div>
      </section>
    </div>
  );
}
