'use client';

import { useAuth } from '@/hooks/useAuth';
import { useDeliveries } from '@/hooks/useDeliveries';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Package, Clock, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';

export default function DeliveriesPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const { data, isLoading } = useDeliveries();

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
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

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'En attente',
      submitted: 'Soumis',
      approved: 'Approuvé',
      auto_approved: 'Auto-approuvé',
      revision_requested: 'Révision demandée',
      rejected: 'Rejeté',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      submitted: 'bg-blue-100 text-blue-700',
      approved: 'bg-green-100 text-green-700',
      auto_approved: 'bg-green-100 text-green-700',
      revision_requested: 'bg-orange-100 text-orange-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-neutral-100 text-neutral-700';
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {user?.role === 'brand' ? 'Livraisons reçues' : 'Mes livraisons'}
          </h1>
          <p className="text-neutral-600">
            {user?.role === 'brand' 
              ? 'Gérez les livrables de vos campagnes' 
              : 'Suivez l\'état de vos livraisons'}
          </p>
        </div>

        {/* Deliveries List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          </div>
        ) : data?.deliveries?.length > 0 ? (
          <div className="space-y-4">
            {data.deliveries.map((delivery: any) => (
              <Card
                key={delivery._id}
                className="p-6 hover:shadow-lg transition cursor-pointer"
                onClick={() => router.push(`/deliveries/${delivery._id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Status Icon */}
                    <div className="mt-1">
                      {getStatusIcon(delivery.status)}
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg text-neutral-900">
                          {delivery.campaignId?.title}
                        </h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(delivery.status)}`}>
                          {getStatusLabel(delivery.status)}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-neutral-600 mb-3">
                        {user?.role === 'brand' ? (
                          <>
                            <span>Créateur: {delivery.creatorId?.profile?.name}</span>
                            <span>•</span>
                          </>
                        ) : (
                          <>
                            <span>Marque: {delivery.brandId?.profile?.companyName}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>{delivery.files?.length || 0} fichiers</span>
                        {delivery.revisionCount > 0 && (
                          <>
                            <span>•</span>
                            <span>{delivery.revisionCount} révision(s)</span>
                          </>
                        )}
                      </div>

                      {/* Auto-approval warning */}
                      {delivery.status === 'submitted' && delivery.daysUntilAutoApproval !== null && user?.role === 'brand' && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                          <p className="text-sm text-yellow-800">
                            ⏰ Auto-approbation dans {delivery.daysUntilAutoApproval} jour(s)
                          </p>
                        </div>
                      )}

                      <div className="text-xs text-neutral-500">
                        {delivery.submittedAt 
                          ? `Soumis ${formatRelativeTime(delivery.submittedAt)}`
                          : `Créé ${formatRelativeTime(delivery.createdAt)}`}
                      </div>
                    </div>
                  </div>

                  {/* Amount & Action */}
                  <div className="text-right ml-4">
                    <div className="text-2xl font-bold text-primary-600 mb-2">
                      {formatCurrency(delivery.payment?.amount)}
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
              {user?.role === 'brand' 
                ? 'Les livraisons de vos campagnes apparaîtront ici'
                : 'Vos livraisons apparaîtront ici une fois que vous aurez été sélectionné pour une campagne'}
            </p>
          </Card>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: data.pagination.pages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                variant={page === data.pagination.page ? 'primary' : 'outline'}
                size="sm"
              >
                {page}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
