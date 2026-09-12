import Link from 'next/link';
import { fetchPublicConfig, plural } from '@/lib/publicConfig';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Check, X, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Tarifs',
  description: 'Tarifs NeedCreator : offre gratuite complète pour les marques, le prix du devis HT est le prix payé, sans frais ajoutés. Le créateur reçoit 90 % de son devis. Pro à 79 €/mois seulement pour le volume.',
  alternates: { canonical: '/pricing' },
};

type Cell = { text: string; ok?: boolean };

/** Inclus dans les deux offres : le cœur du service, sans limite de durée */
const included = (cfg: { autoApprovalDays: number }): string[] => [
  'Campagnes et devis reçus illimités',
  'Le prix du devis est le prix payé : aucun frais ajouté',
  'Contrat de cession de droits (PDF) à chaque devis accepté, rappel avant expiration',
  'Garantie de remplacement si le créateur ne livre pas, sans frais',
  'Score de conformité au brief à la livraison',
  `Révisions précisées dans chaque devis, validation automatique à ${plural(cfg.autoApprovalDays, 'jour')}`,
  'Contre-proposition de devis et comparateur de candidats',
  'Modèles de campagne par secteur, duplication d\'une campagne passée',
  'Campagnes privées, visibles des seuls créateurs invités',
  'Équipe : collaborateurs sur le même compte marque',
  'Factures PDF par mission, avoirs, relevé mensuel',
  'Litige arbitré par notre équipe, avis en double aveugle',
  'Publication Shopify en un clic, vidéos prêtes à diffuser en option',
  'Rédaction de brief par l\'IA (3 par mois)',
];

/** Ce que Pro ajoute : du volume, pas des fonctions de base */
const rows = (): { label: string; free: Cell; pro: Cell }[] => [
  { label: 'Plusieurs créateurs sur une même campagne', free: { text: '1 créateur sélectionné par campagne' }, pro: { text: 'Plusieurs créateurs, un seul paiement groupé', ok: true } },
  { label: 'Campagnes gifting (produit offert à la place d\'une rémunération)', free: { text: 'Non proposé' }, pro: { text: 'Oui : 5 € de frais de service par vidéo livrée', ok: true } },
  { label: 'Rédaction de brief par l\'IA', free: { text: '3 par mois' }, pro: { text: 'Illimitée', ok: true } },
  { label: 'Limites de départ (voir note)', free: { text: 'Levées dès votre première campagne terminée' }, pro: { text: 'Aucune dès le premier jour', ok: true } },
];

const STARTING_LIMITS_NOTE = 'Note : pour protéger les créateurs des faux comptes, une nouvelle marque gratuite est limitée à 2 campagnes ouvertes en même temps, 5 invitations et 20 messages par jour. Ces limites disparaissent définitivement dès qu\'une première campagne est terminée. Elles ne concernent pas les marques Pro.';

const faq = (cfg: { autoApprovalDays: number; replacementGraceHours: number }) => [
  ['Y a-t-il des frais cachés pour la marque ?', 'Non. Vous payez exactement le montant du devis accepté, hors taxes, plus la TVA lorsque le créateur y est assujetti (indiqué sur chaque devis). La commission de NeedCreator est retenue sur la somme versée au créateur, jamais ajoutée à votre paiement. L\'abonnement Pro est facultatif et n\'est utile qu\'à partir de plusieurs campagnes par mois.'],
  ['Quand suis-je débité ?', 'À la sélection du créateur, le montant du devis est bloqué sur votre carte, sans être prélevé. Le débit a lieu uniquement quand vous validez la livraison, ou automatiquement ' + plural(cfg.autoApprovalDays, 'jour') + ' après la livraison si vous ne répondez pas.'],
  ['Que se passe-t-il si les vidéos ne conviennent pas ?', 'Vous pouvez demander des modifications, dans la limite du nombre de révisions prévu par le devis que vous avez accepté. En cas de désaccord persistant, notre équipe intervient pour trouver une solution.'],
  ['Qu\'est-ce que le gifting ?', 'Une campagne où le créateur reçoit un produit (30 € minimum) à la place d\'une rémunération. Réservée aux marques Pro, limitée à 2 vidéos par campagne et 2 campagnes par mois. Seuls 5 € de frais de service par vidéo livrée sont facturés, annoncés avant paiement. Le créateur choisit s\'il accepte ce type de campagne.'],
  ['Qui détient les droits sur les vidéos ?', 'Les droits cédés (durée, supports, territoire, exclusivité éventuelle) sont fixés dans le devis du créateur et repris dans un contrat PDF généré à l\'acceptation. Vous êtes prévenu 30 jours avant l\'expiration et pouvez demander une prolongation, dont le créateur fixe le prix.'],
  ['Que se passe-t-il si le créateur ne livre pas ?', 'Il est relancé à la date prévue. Après ' + cfg.replacementGraceHours + ' heures de retard, vous pouvez confier la mission à l\'un des autres créateurs ayant envoyé un devis, en un clic : le montant bloqué est libéré et la nouvelle mission démarre immédiatement. Sans frais.'],
  ['Comment le créateur est-il payé ?', 'Par virement automatique sur son compte Stripe, dès la validation de la livraison. Il reçoit 90 % du devis. Sur une campagne gifting, aucune commission n\'est retenue.'],
];

function CellView({ cell, strong }: { cell: Cell; strong?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {cell.ok === true && <Check className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" aria-label="Inclus" />}
      {cell.ok === false && <X className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" aria-label="Non inclus" />}
      <span className={strong ? 'font-medium text-neutral-900' : 'text-neutral-700'}>{cell.text}</span>
    </div>
  );
}

export default async function PricingPage() {
  const cfg = await fetchPublicConfig();
  const ROWS = rows();
  const INCLUDED = included(cfg);
  const FAQ = faq(cfg);
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* 1. La règle */}
      <section className="bg-gradient-to-br from-primary-50 to-white py-16">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4">Le prix du devis est le prix payé.</h1>
          <p className="text-lg text-neutral-600">
            Aucun frais ajouté pour la marque : le prix du devis HT, plus la TVA lorsque le créateur y est assujetti. NeedCreator retient 10 % du devis sur le versement au créateur. Rien d&apos;autre.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-5xl py-12 space-y-16">
        {/* 2. Marques : Gratuit vs Pro */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-neutral-900 mb-2">Pour les marques</h2>
            <p className="text-neutral-600"><strong className="text-neutral-900">L&apos;offre gratuite est complète</strong> : vous publiez, sélectionnez, payez et récupérez vos droits sans limite de durée. Pro ajoute du volume, pas des fonctions de base, et jamais de frais sur les devis.</p>
          </div>

          {/* Inclus dans les deux offres */}
          <Card className="p-6 md:p-8 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Check className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-neutral-900">Inclus dans les deux offres, gratuit pour toujours</h3>
            </div>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-neutral-700">
              {INCLUDED.map((t) => (
                <li key={t} className="flex items-start gap-2"><Check className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" aria-hidden />{t}</li>
              ))}
            </ul>
          </Card>

          <h3 className="text-lg font-semibold text-neutral-900 text-center mb-4">Ce que Pro ajoute</h3>

          {/* Tableau (desktop) */}
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left p-5 w-1/3 align-bottom text-neutral-500 font-medium">Seules différences</th>
                    <th className="text-left p-5 w-1/3 align-bottom">
                      <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Gratuit, tout compris</div>
                      <div className="text-3xl font-bold text-neutral-900">0 €</div>
                      <div className="text-neutral-500 font-normal">Pour toujours. Tout ce qu&apos;il faut pour vos campagnes.</div>
                    </th>
                    <th className="text-left p-5 w-1/3 align-bottom bg-primary-50">
                      <div className="text-xs uppercase tracking-wide text-primary-700 mb-1">Pro, pour le volume</div>
                      <div className="text-3xl font-bold text-neutral-900">79 € <span className="text-base font-normal text-neutral-500">HT / mois</span></div>
                      <div className="text-neutral-600 font-normal">Utile à partir de plusieurs campagnes par mois. 14 jours offerts, sans carte, sans engagement.</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label} className="border-b border-neutral-100 last:border-0">
                      <td className="p-5 text-neutral-900 font-medium align-top">{r.label}</td>
                      <td className="p-5 align-top"><CellView cell={r.free} /></td>
                      <td className="p-5 align-top bg-primary-50/50"><CellView cell={r.pro} /></td>
                    </tr>
                  ))}
                  <tr>
                    <td className="p-5"></td>
                    <td className="p-5">
                      <Link href="/register?role=brand"><Button variant="outline" className="w-full">Commencer gratuitement</Button></Link>
                    </td>
                    <td className="p-5 bg-primary-50/50">
                      <Link href="/register?role=brand"><Button className="w-full">Essayer Pro 14 jours</Button></Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>
            <p className="text-xs text-neutral-500 mt-3">{STARTING_LIMITS_NOTE}</p>
          </div>

          {/* Cartes empilées (mobile) */}
          <div className="md:hidden space-y-6">
            {(['free', 'pro'] as const).map((plan) => (
              <Card key={plan} className={`p-6 ${plan === 'pro' ? 'border-primary-300 bg-primary-50/40' : ''}`}>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">{plan === 'free' ? 'Gratuit, tout compris' : 'Pro, pour le volume'}</div>
                <div className="text-3xl font-bold text-neutral-900 mb-1">{plan === 'free' ? '0 €' : '79 € HT / mois'}</div>
                <div className="text-sm text-neutral-600 mb-5">{plan === 'free' ? 'Pour toujours. Tout ce qu\'il faut pour vos campagnes.' : 'Utile à partir de plusieurs campagnes par mois. 14 jours offerts, sans carte, sans engagement.'}</div>
                <ul className="space-y-3 text-sm">
                  {ROWS.map((r) => (
                    <li key={r.label}>
                      <div className="text-neutral-500 text-xs mb-0.5">{r.label}</div>
                      <CellView cell={r[plan]} strong />
                    </li>
                  ))}
                </ul>
                <Link href="/register?role=brand" className="block mt-6">
                  <Button variant={plan === 'free' ? 'outline' : 'primary'} className="w-full">{plan === 'free' ? 'Commencer gratuitement' : 'Essayer Pro 14 jours'}</Button>
                </Link>
              </Card>
            ))}
            <p className="text-xs text-neutral-500">{STARTING_LIMITS_NOTE}</p>
          </div>
        </section>

        {/* 3. Créateurs */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-neutral-900 mb-2">Pour les créateurs</h2>
            <p className="text-neutral-600">Inscription gratuite. Vous fixez votre prix HT, vous recevez 90 % (plus la TVA sur votre part si vous y êtes assujetti).</p>
          </div>
          <Card className="p-8 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="text-5xl font-bold text-secondary-500 mb-2">90 %</div>
              <p className="text-neutral-700 mb-4">de votre devis HT vous est viré, automatiquement, dès la validation de la livraison. NeedCreator retient une commission de 10 % du devis sur chaque mission payée, facturée avec TVA. Vos factures à la marque sont émises en votre nom par la plateforme.</p>
              <ul className="space-y-2 text-sm text-neutral-700">
                {[
                  'Vous fixez librement le prix de chaque devis',
                  'Paiement garanti : le montant est bloqué avant que vous ne commenciez',
                  `Validation automatique si la marque ne répond pas sous ${plural(cfg.autoApprovalDays, 'jour')}`,
                  'Gifting : produit offert, aucune commission',
                  'Factures émises en votre nom, relevé mensuel, calendrier de paiements',
                  'Académie gratuite, badge Formé, kit média avec QR code',
                ].map((t) => (
                  <li key={t} className="flex gap-2"><Check className="w-4 h-4 text-secondary-500 mt-0.5 flex-shrink-0" />{t}</li>
                ))}
              </ul>
              <Link href="/register?role=creator" className="block mt-6">
                <Button variant="secondary">Devenir créateur</Button>
              </Link>
            </div>
            <div className="bg-neutral-50 rounded-xl p-6 text-sm">
              <div className="text-neutral-500 mb-3">Exemple</div>
              <div className="flex justify-between py-2 border-b border-neutral-200"><span>Votre devis (HT)</span><span className="font-medium">100 €</span></div>
              <div className="flex justify-between py-2 border-b border-neutral-200 text-neutral-600"><span>Commission NeedCreator (10 %)</span><span>− 10 €</span></div>
              <div className="flex justify-between py-2 font-semibold text-green-700"><span>Viré sur votre compte</span><span>90 €</span></div>
              <p className="text-xs text-neutral-500 mt-2">Créateur assujetti à la TVA : la marque paie 120 € TTC, vous recevez 108 € TTC (90 € HT + votre TVA), commission 12 € TTC.</p>
            </div>
          </Card>
        </section>

        {/* 4. Une mission en chiffres */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-6">Une mission en chiffres</h2>
          <div className="grid md:grid-cols-3 gap-4 items-stretch">
            {[
              ['Le créateur envoie un devis', '300 € HT', 'pour 3 vidéos'],
              ['La marque paie', '300 € HT', 'exactement le devis, aucun frais ajouté (TVA en sus si le créateur y est assujetti)'],
              ['Le créateur reçoit', '270 €', 'NeedCreator retient 30 € (10 %)'],
            ].map(([title, amount, sub], i) => (
              <div key={title} className="relative">
                <Card className="p-6 text-center h-full">
                  <div className="text-sm text-neutral-500 mb-2">{title}</div>
                  <div className="text-3xl font-bold text-neutral-900 mb-1">{amount}</div>
                  <div className="text-sm text-neutral-600">{sub}</div>
                </Card>
                {i < 2 && <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-neutral-300" />}
              </div>
            ))}
          </div>
        </section>

        {/* 5. FAQ */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-6">Questions fréquentes</h2>
          <div className="space-y-3 max-w-3xl mx-auto">
            {FAQ.map(([q, a]) => (
              <details key={q} className="bg-white border border-neutral-200 rounded-lg p-4 group">
                <summary className="font-medium text-neutral-900 cursor-pointer list-none flex justify-between items-center">
                  {q}
                  <span className="text-neutral-400 group-open:rotate-90 transition">›</span>
                </summary>
                <p className="mt-3 text-sm text-neutral-700">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
