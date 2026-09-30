import type { Metadata } from 'next';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Clapperboard, Eye, Lock, FileSignature, BellOff, Video, Euro, Send, ShoppingCart, ArrowRight } from 'lucide-react';
import { fetchPublicConfig } from '@/lib/publicConfig';

export const metadata: Metadata = {
  title: 'Candidature spontanée en vidéo : une vidéo UGC déjà tournée, à regarder avant de payer',
  description: 'Un créateur vérifié tourne une vidéo avec votre produit, sans commande de votre part. Vous la regardez en filigrane, vous ne payez que si vous la gardez, droits inclus. Pour les créateurs : proposez une vidéo à une marque, à votre prix.',
  alternates: { canonical: '/candidature-spontanee' },
};

/**
 * Page publique de la candidature spontanée en vidéo : le créateur tourne d'abord, la marque regarde avant de payer.
 * Un seul argument, répété pour les deux publics : rien à payer ni à signer avant d'avoir vu la vidéo.
 */
export default async function SpontaneousApplicationPage() {
  const cfg = await fetchPublicConfig();
  const brandSteps: [any, string, string][] = [
    [Video, 'Un créateur tourne', 'Il possède déjà l\'un de vos produits. Il tourne 15 à 30 secondes, sans brief et sans commande de votre part.'],
    [Send, 'Vous recevez un lien', 'Par email ou en message privé : la vidéo se regarde en filigrane, avec un devis clair : prix, durée des droits, supports.'],
    [Eye, 'Vous regardez', 'Aucun compte à créer pour regarder. Vous jugez sur pièce, pas sur un portfolio ou une promesse.'],
    [ShoppingCart, 'Vous gardez, ou non', 'Elle vous plaît ? Un clic, le paiement est bloqué, la version sans filigrane vous est livrée dans la minute. Sinon, rien : personne ne vous relance.'],
  ];
  const creatorSteps: [any, string, string][] = [
    [ShoppingCart, 'Choisissez une marque', 'Parmi celles que NeedCreator démarche, ou suggérez celle dont vous possédez un produit. Les marques qui ont demandé une vidéo sont affichées en premier.'],
    [Video, 'Tournez 20 secondes', 'Le produit bien visible, une accroche dans les trois premières secondes. Nos accroches suggérées sont affichées pour chaque marque.'],
    [Euro, 'Fixez votre prix et vos droits', 'Vous décidez du prix, de la durée et des supports cédés. Le devis et le contrat sont générés pour vous.'],
    [Send, 'NeedCreator la présente', 'Nous vérifions la vidéo, puis nous la proposons à la marque. Vous êtes prévenu quand elle est proposée, quand la marque ouvre la page, quand elle achète.'],
  ];
  const guarantees: [any, string, string][] = [
    [Eye, 'Voir avant de payer', 'La vidéo se regarde en entier, en filigrane. Le prix et les droits sont écrits avant tout engagement.'],
    [Lock, 'Paiement bloqué, puis versé', 'Le montant est bloqué à l\'acceptation et versé au créateur seulement après votre validation de la vidéo livrée.'],
    [FileSignature, 'Droits inclus', 'Un contrat de cession de droits accompagne chaque vidéo : durée, supports, territoire, écrits noir sur blanc.'],
    [BellOff, 'Aucune relance', 'Une vidéo qui ne vous plaît pas ne vous coûte rien, et personne ne vous écrira pour insister.'],
  ];
  const faq: [string, string][] = [
    ['Combien coûte une vidéo ?', 'Le prix est fixé par le créateur et écrit sur le devis, avant que vous regardiez. En général entre 80 et 150 € HT pour une première vidéo, droits inclus.'],
    ['Que se passe-t-il si la vidéo ne me plaît pas ?', 'Rien. Vous fermez la page, la vidéo reste au créateur, et personne ne vous relance. Vous pouvez aussi la décliner en un clic pour que le créateur le sache.'],
    ['Puis-je demander une vidéo pour un produit précis ?', 'Oui. Répondez « oui vidéo » à l\'un de nos emails, ou écrivez-nous en indiquant le produit : nos créateurs qui le possèdent sont prévenus, et vous recevez un lien sous dix jours.'],
    ['Et si aucun créateur n\'a mon produit ?', 'Nous vous le disons franchement, et nous vous proposons une campagne au produit offert : vous envoyez le produit à un créateur vérifié, qui tourne la vidéo en échange.'],
    ['Que se passe-t-il pour le créateur si la marque ne répond pas ?', 'La vidéo lui appartient : elle rejoint son portfolio et peut être proposée à une autre marque. Trois candidatures en cours au plus par créateur, pour garder la qualité.'],
  ];
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="bg-gradient-to-br from-primary-50 to-white py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-6 text-sm font-medium text-primary-700"><Clapperboard className="w-4 h-4 mr-2" /> Candidature spontanée en vidéo</div>
          <h1 className="text-4xl md:text-6xl font-bold text-neutral-900 mb-6">Une vidéo déjà tournée pour votre produit, <span className="text-primary-500">à regarder avant de payer</span></h1>
          <p className="text-xl text-neutral-600 mb-4 max-w-2xl mx-auto">Un créateur vérifié tourne une vidéo avec votre produit, sans que vous ayez rien demandé. Vous la regardez en filigrane. Elle vous plaît ? Elle est à vous en un clic, droits inclus. Sinon, rien.</p>
          <p className="text-neutral-600 mb-8 max-w-2xl mx-auto">Pas de brief, pas de casting, pas d&apos;attente : vous jugez une vidéo finie, pas une promesse.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register?role=brand"><Button size="lg">Je suis une marque</Button></Link>
            <Link href="/register?role=creator"><Button size="lg" variant="outline">Je suis créateur</Button></Link>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold text-neutral-900 text-center mb-3">Pour les marques : quatre étapes, aucune avant d&apos;avoir vu</h2>
          <p className="text-lg text-neutral-600 text-center mb-12 max-w-2xl mx-auto">Le paiement n&apos;intervient qu&apos;à la fin, et seulement si vous gardez la vidéo.</p>
          <div className="grid md:grid-cols-4 gap-6">
            {brandSteps.map(([Icon, title, text], i) => (
              <Card key={title} className="p-6">
                <div className="flex items-center gap-3 mb-3"><div className="text-3xl font-bold text-primary-500">{i + 1}</div><Icon className="w-6 h-6 text-primary-600" /></div>
                <h3 className="font-semibold text-neutral-900 mb-2">{title}</h3>
                <p className="text-sm text-neutral-600">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-primary-50">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 text-center mb-10">Ce qui est garanti</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {guarantees.map(([Icon, title, text]) => (
              <div key={title} className="bg-white rounded-xl p-6">
                <div className="w-11 h-11 bg-primary-100 rounded-lg flex items-center justify-center mb-4"><Icon className="w-6 h-6 text-primary-600" /></div>
                <h3 className="font-semibold text-neutral-900 mb-2">{title}</h3>
                <p className="text-sm text-neutral-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-neutral-900 text-white">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-3">Pour les créateurs : n&apos;attendez pas d&apos;être choisi</h2>
          <p className="text-lg text-neutral-300 text-center mb-12 max-w-2xl mx-auto">Les marques reçoivent des demandes de collaboration tous les jours et n&apos;en lisent aucune. Ce qu&apos;elles ouvrent, c&apos;est une vidéo déjà tournée pour leur produit.</p>
          <div className="grid md:grid-cols-4 gap-6">
            {creatorSteps.map(([Icon, title, text], i) => (
              <div key={title} className="bg-neutral-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-3"><div className="text-3xl font-bold text-primary-400">{i + 1}</div><Icon className="w-6 h-6 text-primary-400" /></div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-neutral-300">{text}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-neutral-400 text-center mt-8">{`Vous êtes payé comme pour une mission : ${cfg.creatorSharePercent} % du devis, versé à la validation. Inscription gratuite, aucun abonnement.`}</p>
          <div className="text-center mt-6"><Link href="/register?role=creator"><Button>Créer mon profil créateur <ArrowRight className="w-4 h-4 ml-1" /></Button></Link></div>
        </div>
      </section>

      <section className="py-20 bg-neutral-50">
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
    </div>
  );
}
