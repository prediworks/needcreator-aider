'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertTriangle, CreditCard, ExternalLink, RefreshCw, Wallet } from 'lucide-react';

/**
 * Solde Stripe de la plateforme, lu en direct : ce qui est disponible, ce qui doit rester pour les missions en cours et les créateurs,
 * et le résultat (il manque X €, ou X € de commissions peuvent partir à la banque). Quand il manque de l'argent, « Payer par carte » ouvre
 * une page de paiement Stripe qui réapprovisionne le solde (l'ajout par virement n'est pas proposé par Stripe sur ce compte).
 * `banner` : simple bandeau rouge en haut de l'administration, affiché seulement quand il manque de l'argent.
 */
const STRIPE_BALANCE_URL = 'https://dashboard.stripe.com/balance/overview';

// « Voir le détail » : la carte peut ne pas être encore affichée (changement d'onglet), on la cherche pendant deux secondes puis on y descend
function scrollToCard(tries = 20) {
  const el = document.querySelector('[data-testid="stripe-balance"]');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (tries > 0) window.setTimeout(() => scrollToCard(tries - 1), 100);
}

export function useStripeBalance(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'stripe-balance'],
    queryFn: async () => (await api.get('/admin/stripe-balance')).data,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Nombre de points d'attention pour la pastille de l'onglet Factures : solde insuffisant, versements créateurs en attente */
export const balanceAlerts = (b: any) => (b ? (b.shortfall >= 1 ? 1 : 0) + (b.reserve?.awaiting?.length || 0) : 0);

export default function StripeBalance({ banner = false, onOpen }: { banner?: boolean; onOpen?: () => void }) {
  const { data: b, isLoading, isError, refetch, isFetching } = useStripeBalance();
  // Réapprovisionnement par carte : montant proposé (manque + frais Stripe estimés), modifiable ; le paiement se fait sur la page de Stripe
  const [amount, setAmount] = useState('');
  useEffect(() => { if (b?.topupSuggested) setAmount(String(b.topupSuggested)); }, [b?.topupSuggested]);
  const [back, setBack] = useState('');
  useEffect(() => { if (!banner) setBack(new URLSearchParams(window.location.search).get('topup') || ''); }, [banner]);
  const retry = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/stripe-balance/retry/${id}`)).data,
    onSuccess: (d: any) => { toast.success(d.message); refetch(); },
    onError: (e: any) => { toast.error(getErrorMessage(e), { duration: 8000 }); refetch(); },
  });
  const topup = useMutation({
    mutationFn: async () => (await api.post('/admin/stripe-balance/topup', { amount: Number(String(amount).replace(',', '.')) })).data,
    onSuccess: (d: any) => { window.location.href = d.url; },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  if (banner) {
    if (!b || !(b.shortfall >= 1)) return null;
    return (
      <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 flex items-start gap-3 text-sm text-red-900" data-testid="stripe-balance-banner">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">{`Solde Stripe insuffisant : il manque ${formatCurrency(b.shortfall)}.`}</span>{' '}
          <span>Sans cette somme, un créateur ne pourra pas être payé à la validation de sa mission.</span>{' '}
          {onOpen && <button type="button" onClick={() => { onOpen(); scrollToCard(); }} className="underline font-medium" data-testid="stripe-balance-banner-open">Voir le détail</button>}
        </div>
      </div>
    );
  }

  const row = (label: string, value: number, opts: { strong?: boolean; minus?: boolean; hint?: string } = {}) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${opts.strong ? 'font-semibold text-neutral-900' : 'text-neutral-700'}`}>
      <span>{opts.minus ? '− ' : ''}{label}{opts.hint ? <span className="text-xs text-neutral-500 font-normal">{` ${opts.hint}`}</span> : null}</span>
      <span className="tabular-nums whitespace-nowrap">{formatCurrency(value)}</span>
    </div>
  );

  return (
    <Card className="p-6 mb-6 scroll-mt-24" data-testid="stripe-balance">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Wallet className="w-5 h-5 text-primary-600" /> Solde Stripe</h2>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="text-sm text-neutral-600 underline inline-flex items-center gap-1" data-testid="stripe-balance-refresh"><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Actualiser</button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">L&apos;argent des missions reste sur Stripe jusqu&apos;à la validation. Ce calcul dit si le solde couvre ce qui est dû, et ce qui peut partir à votre banque.</p>

      {isLoading && <p className="text-sm text-neutral-500">Lecture du solde chez Stripe…</p>}
      {isError && <p className="text-sm text-red-700" data-testid="stripe-balance-error">Lecture du solde Stripe impossible pour le moment. Réessayez avec « Actualiser ».</p>}

      {back === 'ok' && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-neutral-800" data-testid="stripe-balance-paid">Paiement reçu. La somme apparaît dans « En attente d&apos;encaissement » et devient disponible en quelques jours.</p>}
      {back === 'cancel' && <p className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700" data-testid="stripe-balance-cancelled">Paiement abandonné : rien n&apos;a été débité.</p>}
      {b && (
        <>
          {b.shortfall >= 1 ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 mb-4" data-testid="stripe-balance-short">
              <div className="text-sm text-red-900">Il manque sur Stripe</div>
              <div className="text-3xl font-bold text-red-700 tabular-nums">{formatCurrency(b.shortfall)}</div>
              <p className="text-sm text-red-900 mt-1">Sans cette somme, le versement au créateur échouera à la validation de la mission. Vous pouvez la remettre sur Stripe en payant par carte.</p>
              <form onSubmit={(e) => { e.preventDefault(); topup.mutate(); }} className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center" data-testid="stripe-balance-topup">
                <label className="inline-flex items-center gap-2 text-sm text-red-900"><span>Montant à payer</span>
                  <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-lg border border-red-300 bg-white px-3 py-2 text-right tabular-nums text-neutral-900" aria-label="Montant à payer par carte" data-testid="stripe-balance-topup-amount" /> <span>€</span>
                </label>
                <button type="submit" disabled={topup.isPending} className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60" data-testid="stripe-balance-topup-pay"><CreditCard className="w-4 h-4" /> {topup.isPending ? 'Ouverture de Stripe…' : 'Payer par carte'}</button>
              </form>
              <p className="text-xs text-red-900/80 mt-2">{`Le montant proposé couvre le manque et les frais de Stripe (2 % + 0,25 € au plus). L'argent apparaît d'abord « en attente d'encaissement », puis devient disponible en quelques jours. À utiliser pour dépanner : Stripe peut demander des explications sur un paiement fait avec votre propre carte.`}</p>
              <a href={STRIPE_BALANCE_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline text-red-900" data-testid="stripe-balance-link">Ouvrir la page Soldes de Stripe <ExternalLink className="w-3 h-3" /></a>
            </div>
          ) : b.shortNow >= 1 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 mb-4 text-sm text-amber-900" data-testid="stripe-balance-wait">
              <span className="font-semibold">{`Rien à virer : ${formatCurrency(b.pending)} sont en cours d'encaissement chez Stripe.`}</span>{' '}
              <span>Le solde disponible ne couvre pas encore tout, mais il le fera quand cette somme arrivera.</span>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-4 text-sm text-neutral-800" data-testid="stripe-balance-ok">
              <span className="font-semibold">Le solde couvre toutes les missions en cours.</span>{' '}
              <span>{b.payable ? `${formatCurrency(b.amount)} de commissions peuvent partir à votre banque au prochain virement mensuel.` : 'Aucune commission à virer pour le moment.'}</span>
            </div>
          )}

          <div className="text-sm divide-y divide-neutral-100 max-w-xl">
            {row('Solde disponible', b.available, { strong: true })}
            {row('En attente d\'encaissement', b.pending, { hint: '(pas encore disponible)' })}
            {(b.reserve?.lines || []).filter((l: any) => l.amount > 0).map((l: any) => <div key={l.label}>{row(l.label, l.amount, { minus: true, hint: `(${l.count})` })}</div>)}
            {row('Total à laisser sur Stripe', b.reserve?.total || 0, { strong: true })}
            {row('Marge de sécurité', b.cushion, { hint: '(réglable dans Paramètres)' })}
          </div>

          {b.reserve?.awaiting?.length > 0 && (
            <div className="mt-5" data-testid="stripe-balance-awaiting">
              <h3 className="font-semibold text-neutral-900">{`Versements aux créateurs en attente (${b.reserve.awaiting.length})`}</h3>
              <p className="text-xs text-neutral-500 mb-2">Missions validées dont le créateur n&apos;a pas encore reçu son argent. Le versement est retenté automatiquement toutes les heures.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-neutral-500 border-b border-neutral-200"><th className="py-2 pr-3">Créateur</th><th className="py-2 pr-3 text-right">À verser</th><th className="py-2 pr-3">Validée le</th><th className="py-2 pr-3">Raison</th><th className="py-2" /></tr></thead>
                  <tbody>
                    {b.reserve.awaiting.map((a: any) => (
                      <tr key={a.id} className="border-b border-neutral-100 align-top" data-testid="stripe-balance-awaiting-row">
                        <td className="py-2 pr-3 font-medium">{a.creator || '—'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(a.amount)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{a.approvedAt ? formatDate(a.approvedAt) : '—'}</td>
                        <td className="py-2 pr-3">
                          <span className={a.reason === 'pending' ? 'text-neutral-600' : 'text-red-700'}>{({ no_account: 'Le créateur n\'a pas connecté son compte Stripe', balance: 'Solde Stripe insuffisant', error: 'Refusé par Stripe', pending: 'Prochain essai dans l\'heure' } as any)[a.reason]}</span>
                          {a.reason === 'error' && a.error ? <span className="block text-xs text-neutral-500">{a.error}</span> : null}
                          {a.triedAt && a.reason !== 'pending' && a.reason !== 'no_account' ? <span className="block text-xs text-neutral-500">{`Dernier essai : ${formatDate(a.triedAt)}`}</span> : null}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <Link href={`/deliveries/${a.id}`} className="text-primary-600 underline text-xs mr-3">Mission</Link>
                          {a.reason !== 'no_account' && <button type="button" disabled={retry.isPending} onClick={() => retry.mutate(a.id)} className="inline-flex items-center gap-1 rounded-lg border border-primary-600 text-primary-700 text-xs font-semibold px-2 py-1 disabled:opacity-60" data-testid="stripe-balance-retry">{retry.isPending && retry.variables === a.id ? 'Envoi…' : 'Relancer'}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!b.manual && (
            <p className="mt-4 text-sm text-red-800 flex items-start gap-2" data-testid="stripe-balance-auto"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{`Calendrier des virements Stripe : « ${b.schedule} ». Stripe envoie tout le solde à votre banque, y compris l'argent des missions en cours. À passer en « Manuel » dans Stripe : Paramètres, Virements.`}</span></p>
          )}
        </>
      )}
    </Card>
  );
}
