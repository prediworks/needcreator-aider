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
  style: {
    base: { fontSize: '16px', color: '#2D3748', '::placeholder': { color: '#a0aec0' } },
    invalid: { color: '#e53e3e' },
  },
};

interface CheckoutProps { deliveryId: string; amount: number; clientSecret: string; confirmPath: string; buttonLabel?: string; immediate?: boolean }

function CheckoutForm({ deliveryId, amount, clientSecret, confirmPath, buttonLabel, immediate }: CheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const confirmOnServer = useMutation({
    mutationFn: async () => (await api.post(confirmPath)).data,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) return;
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });
      if (error) {
        toast.error(error.message || 'Paiement refusé');
        return;
      }
      if (paymentIntent && ['requires_capture', 'succeeded'].includes(paymentIntent.status)) {
        await confirmOnServer.mutateAsync();
        queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] });
        queryClient.invalidateQueries({ queryKey: ['deliveries'] });
        toast.success(immediate ? 'Paiement confirmé.' : 'Paiement confirmé. Le montant est bloqué et sera versé au créateur après votre validation.');
      } else {
        toast.warning(`Paiement en attente (statut : ${paymentIntent?.status})`);
      }
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Erreur lors du paiement'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border border-neutral-300 rounded-lg px-3 py-3 bg-white focus-within:ring-2 focus-within:ring-primary-500">
        <CardElement options={CARD_STYLE} onChange={(e) => setCardComplete(e.complete)} />
      </div>
      <p className="text-xs text-neutral-500">Numéro de carte, date d&apos;expiration et code de sécurité.</p>
      <Button type="submit" className="w-full" isLoading={submitting} disabled={!stripe || !elements || !cardComplete}>
        <Lock className="w-4 h-4 mr-2" />
        {buttonLabel || `Bloquer ${formatCurrency(amount)}`}
      </Button>
      {!immediate && (
        <p className="text-xs text-neutral-500 text-center">
          Votre carte est autorisée, pas débitée. Le montant n&apos;est prélevé qu&apos;à la validation de la livraison (ou après 7 jours sans réponse).
        </p>
      )}
    </form>
  );
}

/**
 * Écran de paiement affiché à la marque tant que le montant n'est pas bloqué
 */
interface PaymentCardProps {
  deliveryId: string;
  intentPath?: string;
  confirmPath?: string;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  immediate?: boolean;
}

export default function PaymentCard({ deliveryId, intentPath, confirmPath, title, subtitle, buttonLabel, immediate }: PaymentCardProps) {
  const ip = intentPath || `/deliveries/${deliveryId}/payment-intent`;
  const cp = confirmPath || `/deliveries/${deliveryId}/confirm-payment`;
  const { data, isLoading, error } = useQuery({
    queryKey: ['payment-intent', ip],
    queryFn: async () => (await api.get(ip)).data,
  });

  if (!stripePromise) {
    return (
      <Card className="p-6 bg-red-50 border-red-200">
        <p className="text-sm text-red-800">Clé publique Stripe manquante (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY dans frontend/.env.local).</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-primary-300 border-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900">{title || 'Paiement à confirmer'}</h3>
          <p className="text-sm text-neutral-600">{subtitle || 'Le créateur commencera dès que le montant est bloqué.'}</p>
        </div>
      </div>

      {isLoading ? (
        <Spinner fullScreen={false} />
      ) : error || !data?.clientSecret ? (
        <p className="text-sm text-red-700">{getErrorMessage(error, 'Paiement indisponible')}</p>
      ) : (
        <Elements stripe={stripePromise} options={{ locale: 'fr' }}>
          <CheckoutForm deliveryId={deliveryId} amount={data.amount} clientSecret={data.clientSecret} confirmPath={cp} buttonLabel={buttonLabel} immediate={immediate} />
        </Elements>
      )}
    </Card>
  );
}
