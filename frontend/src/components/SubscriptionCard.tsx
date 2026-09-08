'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Crown, Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils';

/**
 * Abonnement Pro : état, essai, souscription (Stripe Checkout), gestion (portail)
 */
export default function SubscriptionCard() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { data, isLoading } = useQuery({ queryKey: ['billing'], queryFn: async () => (await api.get('/billing/status')).data });

  const sync = useMutation({
    mutationFn: async () => (await api.post('/billing/sync')).data,
    onSuccess: async () => { queryClient.invalidateQueries({ queryKey: ['billing'] }); await refreshUser(); },
  });
  useEffect(() => {
    const flag = searchParams.get('billing');
    if (flag === 'success') { toast.success('Bienvenue dans NeedCreator Pro !'); sync.mutate(); }
    if (flag === 'cancel') toast.info('Souscription annulée, vous restez sur le plan actuel.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const checkout = useMutation({
    mutationFn: async () => (await api.post('/billing/checkout')).data,
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const portal = useMutation({
    mutationFn: async () => (await api.post('/billing/portal')).data,
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });

  if (isLoading || !data) return null;
  const pro = data.plan === 'pro';
  const trialing = data.status === 'trialing';

  return (
    <Card className={`p-6 ${pro ? 'border-yellow-300 bg-gradient-to-r from-yellow-50 to-white' : ''}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2">
            <Crown className={`w-5 h-5 ${pro ? 'text-yellow-600' : 'text-neutral-400'}`} /> {pro ? 'NeedCreator Pro' : 'Plan gratuit'}
          </h2>
          {pro && trialing && <p className="text-sm text-yellow-800 mt-1">Essai gratuit jusqu&apos;au {formatDate(data.trialEndsAt)}{data.hasStripeSubscription ? '' : ' — sans carte. Souscrivez avant la fin pour conserver vos avantages.'}</p>}
          {pro && !trialing && <p className="text-sm text-neutral-700 mt-1">Abonnement actif{data.currentPeriodEnd ? ` · prochain prélèvement le ${formatDate(data.currentPeriodEnd)}` : ''}{data.cancelAtPeriodEnd ? ' · résiliation programmée' : ''}</p>}
          {!pro && <p className="text-sm text-neutral-700 mt-1">Commission {data.standardFeePercent} % · {data.aiBriefQuota} briefs IA par mois ({data.aiBriefsUsed} utilisé{data.aiBriefsUsed > 1 ? 's' : ''}) · 1 créateur par campagne</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(!pro || (trialing && !data.hasStripeSubscription)) && (
            <Button onClick={() => checkout.mutate()} isLoading={checkout.isPending}><Sparkles className="w-4 h-4 mr-2" /> {trialing ? 'Souscrire maintenant' : `Passer en Pro · ${data.price} €/mois`}</Button>
          )}
          {data.hasStripeSubscription && <Button variant="outline" onClick={() => portal.mutate()} isLoading={portal.isPending}>Gérer mon abonnement</Button>}
        </div>
      </div>
      <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-neutral-700">
        <li>✓ Commission réduite à {data.proFeePercent} % (au lieu de {data.standardFeePercent} %)</li>
        <li>✓ Brief IA illimité</li>
        <li>✓ Campagnes gifting (produit offert)</li>
        <li>✓ Campagnes multi-créateurs et paiement groupé</li>
        <li>✓ Aucune limite de campagnes, d&apos;invitations ou de messages</li>
        <li>✓ Support prioritaire</li>
      </ul>
    </Card>
  );
}
