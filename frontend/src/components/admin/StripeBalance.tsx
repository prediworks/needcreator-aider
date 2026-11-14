'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, ExternalLink, RefreshCw, Wallet } from 'lucide-react';

/**
 * Solde Stripe de la plateforme, lu en direct : ce qui est disponible, ce qui doit rester pour les missions en cours et les créateurs,
 * et le résultat (il manque X € à virer sur Stripe, ou X € de commissions peuvent partir à la banque). Lecture seule : l'argent s'ajoute
 * par virement bancaire depuis la page Soldes de Stripe, rien ne bouge depuis ici.
 * `banner` : simple bandeau rouge en haut de l'administration, affiché seulement quand il manque de l'argent.
 */
const STRIPE_BALANCE_URL = 'https://dashboard.stripe.com/balance/overview';

export function useStripeBalance(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'stripe-balance'],
    queryFn: async () => (await api.get('/admin/stripe-balance')).data,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export default function StripeBalance({ banner = false, onOpen }: { banner?: boolean; onOpen?: () => void }) {
  const { data: b, isLoading, isError, refetch, isFetching } = useStripeBalance();

  if (banner) {
    if (!b || !(b.shortfall >= 1)) return null;
    return (
      <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 flex items-start gap-3 text-sm text-red-900" data-testid="stripe-balance-banner">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold">{`Solde Stripe insuffisant : il manque ${formatCurrency(b.shortfall)}.`}</span>{' '}
          <span>Sans cette somme, un créateur ne pourra pas être payé à la validation de sa mission.</span>{' '}
          {onOpen && <button type="button" onClick={onOpen} className="underline font-medium" data-testid="stripe-balance-banner-open">Voir le détail</button>}
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
    <Card className="p-6 mb-6" data-testid="stripe-balance">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Wallet className="w-5 h-5 text-primary-600" /> Solde Stripe</h2>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="text-sm text-neutral-600 underline inline-flex items-center gap-1" data-testid="stripe-balance-refresh"><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Actualiser</button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">L&apos;argent des missions reste sur Stripe jusqu&apos;à la validation. Ce calcul dit si le solde couvre ce qui est dû, et ce qui peut partir à votre banque.</p>

      {isLoading && <p className="text-sm text-neutral-500">Lecture du solde chez Stripe…</p>}
      {isError && <p className="text-sm text-red-700" data-testid="stripe-balance-error">Lecture du solde Stripe impossible pour le moment. Réessayez avec « Actualiser ».</p>}

      {b && (
        <>
          {b.shortfall >= 1 ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 mb-4" data-testid="stripe-balance-short">
              <div className="text-sm text-red-900">Il manque sur Stripe</div>
              <div className="text-3xl font-bold text-red-700 tabular-nums">{formatCurrency(b.shortfall)}</div>
              <p className="text-sm text-red-900 mt-1">C&apos;est le montant à virer depuis votre banque. Dans Stripe, page Soldes, bouton « Ajouter au solde » : Stripe affiche l&apos;IBAN et la référence à utiliser. Comptez un à deux jours ouvrés.</p>
              <a href={STRIPE_BALANCE_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-red-600 text-white text-sm font-semibold px-3 py-2" data-testid="stripe-balance-link">Ouvrir la page Soldes de Stripe <ExternalLink className="w-4 h-4" /></a>
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

          {!b.manual && (
            <p className="mt-4 text-sm text-red-800 flex items-start gap-2" data-testid="stripe-balance-auto"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{`Calendrier des virements Stripe : « ${b.schedule} ». Stripe envoie tout le solde à votre banque, y compris l'argent des missions en cours. À passer en « Manuel » dans Stripe : Paramètres, Virements.`}</span></p>
          )}
        </>
      )}
    </Card>
  );
}
