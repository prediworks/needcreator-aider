'use client';

import { Suspense } from 'react';
import { useRequireAuth } from '@/hooks/useAuth';
import { useDeliveries } from '@/hooks/useDeliveries';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { Package, Clock, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { DELIVERY_STATUS } from '@/lib/labels';

function DeliveriesContent() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') || undefined;
  const { data, isLoading } = useDeliveries({ status }, ready);

  if (!ready) return <Spinner />;

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'submitted':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'approved':
      case 'auto_approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'revision_requested':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default:
        return <Package className="w-5 h-5 text-neutral-500" />;
    }
  };

  const isBrand = user?.role === 'brand';

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {isBrand ? 'Livraisons reçues' : 'Mes livraisons'}
          </h1>
          <p className="text-neutral-600">
            {isBrand
              ? 'Validez les vidéos ou demandez des révisions (2 maximum). Sans réponse sous 7 jours, la livraison est approuvée automatiquement.'
              : 'Suivez vos missions : envoyez vos vidéos, soumettez-les, puis recevez votre paiement après validation.'}
          </p>
        </div>

        {isLoading ? (
          <Spinner fullScreen={false} />
        ) : data?.deliveries?.length > 0 ? (
          <div className="space-y-4">
            {data.deliveries.map((delivery: any) => (
              <Card
                key={delivery._id}
                className="p-6 hover:shadow-lg transition cursor-pointer"
                onClick={() => router.push(`/deliveries/${delivery._id}`)}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4 flex-1 min-w-[240px]">
                    <div className="mt-1">
                      {getStatusIcon(delivery.status)}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-semibold text-lg text-neutral-900">
                          {delivery.campaignId?.title}
                        </h3>
                        <Badge map={DELIVERY_STATUS} value={delivery.status} />
                      </div>

                      <div className="flex items-center gap-2 text-sm text-neutral-600 mb-3 flex-wrap">
                        <span>
                          {isBrand
                            ? `Créateur : ${delivery.creatorId?.profile?.name}`
                            : `Marque : ${delivery.brandId?.profile?.companyName}`}
                        </span>
                        <span>•</span>
                        <span>{delivery.files?.length || 0} fichier(s)</span>
                        {delivery.revisionCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{delivery.revisionCount} révision(s)</span>
                          </>
                        )}
                      </div>

                      {delivery.status === 'submitted' && delivery.daysUntilAutoApproval !== null && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 inline-block">
                          <p className="text-sm text-yellow-800">
                            ⏰ Approbation automatique dans {delivery.daysUntilAutoApproval} jour(s)
                          </p>
                        </div>
                      )}

                      <div className="text-xs text-neutral-500">
                        {delivery.submittedAt
                          ? `Soumise ${formatRelativeTime(delivery.submittedAt)}`
                          : `Créée ${formatRelativeTime(delivery.createdAt)}`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary-600 mb-2">
                      {formatCurrency(isBrand ? delivery.payment?.amount : delivery.payment?.creatorAmount)}
                    </div>
                    <Button size="sm" variant="outline">
                      Voir détails
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Package className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              Aucune livraison
            </h3>
            <p className="text-neutral-600">
              {isBrand
                ? 'Les livraisons apparaîtront ici dès que vous aurez sélectionné un créateur sur une campagne.'
                : 'Vos livraisons apparaîtront ici une fois que vous aurez été sélectionné pour une campagne.'}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DeliveriesContent />
    </Suspense>
  );
}
