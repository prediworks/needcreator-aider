'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { CreditCard, Lock } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

const CARD_STYLE = {
  hidePostalCode: true,
  style: { base: { fontSize: '16px', color: '#2D3748', '::placeholder': { color: '#a0aec0' } }, invalid: { color: '#e53e3e' } },
};

function GroupCheckout({ campaignId, clientSecret, total, count }: { campaignId: string; clientSecret: string; total: number; count: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  const payAll = useMutation({
    mutationFn: async (paymentMethodId: string) => (await api.post(`/campaigns/${campaignId}/pay-all`, { paymentMethodId })).data,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) return;
      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, { payment_method: { card } });
      if (error) { toast.error(error.message || 'Carte refusée'); return; }
      const pm = typeof setupIntent?.payment_method === 'string' ? setupIntent.payment_method : setupIntent?.payment_method?.id;
      if (!pm) { toast.error('Carte non enregistrée'); return; }
      const result = await payAll.mutateAsync(pm);
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      if (result.paid === count) toast.success(`${result.paid} paiement(s) bloqué(s). Les créateurs peuvent commencer.`);
      else toast.warning(result.message, { duration: 8000 });
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erreur lors du paiement'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="border border-neutral-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-primary-500">
        <CardElement options={CARD_STYLE} onChange={(e) => setComplete(e.complete)} />
      </div>
      <Button type="submit" className="w-full" isLoading={submitting} disabled={!stripe || !complete}>
        <Lock className="w-4 h-4 mr-2" /> Bloquer {formatCurrency(total)} pour {count} créateur(s)
      </Button>
      <p className="text-xs text-neutral-500 text-center">Une seule saisie de carte : chaque mission est autorisée séparément et prélevée uniquement à sa validation.</p>
    </form>
  );
}

/**
 * Paiement groupé de toutes les sélections en attente d'une campagne
 */
export default function GroupPaymentCard({ campaignId, pending }: { campaignId: string; pending: any[] }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['payment-setup', campaignId, pending.length],
    queryFn: async () => (await api.post(`/campaigns/${campaignId}/payment-setup`)).data,
    enabled: pending.length > 0,
  });

  if (!stripePromise) return null;

  return (
    <Card className="p-6 border-primary-300 border-2">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center"><CreditCard className="w-5 h-5 text-primary-600" /></div>
        <div>
          <h3 className="font-semibold text-neutral-900">{pending.length} paiement(s) à confirmer</h3>
          <p className="text-sm text-neutral-600">Payez toutes vos sélections en une fois.</p>
        </div>
      </div>
      <ul className="text-sm text-neutral-700 mb-4 space-y-1">
        {pending.map((d: any) => (
          <li key={d._id} className="flex justify-between"><span>{d.creatorId?.profile?.name || 'Créateur'}</span><span className="font-medium">{formatCurrency(d.payment?.amount)}</span></li>
        ))}
      </ul>
      {isLoading ? <Spinner fullScreen={false} /> : error || !data?.clientSecret ? (
        <p className="text-sm text-red-700">{getErrorMessage(error, 'Paiement indisponible')}</p>
      ) : (
        <Elements stripe={stripePromise} options={{ locale: 'fr' }}>
          <GroupCheckout campaignId={campaignId} clientSecret={data.clientSecret} total={data.total} count={data.count} />
        </Elements>
      )}
    </Card>
  );
}
