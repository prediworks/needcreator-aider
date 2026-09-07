'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useStripeConnectStatus, useStartStripeConnect } from '@/hooks/useProfile';
import { CreditCard, CheckCircle, AlertTriangle } from 'lucide-react';

/**
 * Bloc "Recevoir mes paiements" : connexion du compte Stripe du créateur
 */
export default function StripeConnectCard() {
  const searchParams = useSearchParams();
  const { data, isLoading, refetch } = useStripeConnectStatus();
  const start = useStartStripeConnect();

  useEffect(() => {
    const flag = searchParams.get('stripe');
    if (flag === 'return') {
      toast.success('Retour de Stripe : vérification de votre compte…');
      refetch();
    } else if (flag === 'refresh') {
      toast.info('Le lien Stripe a expiré, cliquez à nouveau pour reprendre.');
    }
  }, [searchParams, refetch]);

  const complete = data?.connected && data?.onboardingComplete;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Recevoir mes paiements</h3>
            {isLoading ? (
              <p className="text-sm text-neutral-500">Vérification…</p>
            ) : complete ? (
              <p className="text-sm text-green-700 flex items-center gap-1 mt-1">
                <CheckCircle className="w-4 h-4" /> Compte Stripe connecté, vos gains seront virés automatiquement.
              </p>
            ) : data?.connected ? (
              <p className="text-sm text-orange-700 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-4 h-4" /> Compte créé mais incomplet : terminez la vérification Stripe.
              </p>
            ) : (
              <p className="text-sm text-neutral-600 mt-1">
                Connectez un compte Stripe (2 minutes) pour recevoir vos paiements. Vous pouvez candidater sans, mais le virement attendra cette étape.
              </p>
            )}
          </div>
        </div>
        {!complete && (
          <Button size="sm" onClick={() => start.mutate()} isLoading={start.isPending}>
            {data?.connected ? 'Terminer' : 'Connecter Stripe'}
          </Button>
        )}
      </div>
    </Card>
  );
}
