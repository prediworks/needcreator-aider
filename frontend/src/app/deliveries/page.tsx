'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useAuth';
import { useDeliveries } from '@/hooks/useDeliveries';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { Package, Clock, CheckCircle, AlertCircle, ArrowRight, CalendarClock, Video } from 'lucide-react';
import { formatCurrency, formatRelativeTime, formatDate } from '@/lib/utils';
import { DELIVERY_STATUS } from '@/lib/labels';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { plural } from '@/lib/publicConfig';

/**
 * Onglets de filtre. Côté créateur la page s'appelle « Mes missions » (une mission = brief, tournage, envoi, validation, paiement).
 * `?status=` reste accepté pour les anciens liens (ex. tableau de bord marque).
 */
const FILTERS: { key: string; label: string; brandLabel?: string; statuses: string[] }[] = [
  { key: 'all', label: 'Toutes', statuses: [] },
  { key: 'todo', label: 'À livrer', brandLabel: 'En production', statuses: ['pending'] },
  { key: 'revision', label: 'Révision demandée', statuses: ['revision_requested'] },
  { key: 'submitted', label: 'En attente de validation', brandLabel: 'À valider', statuses: ['submitted', 'disputed'] },
  { key: 'done', label: 'Terminées', statuses: ['approved', 'auto_approved', 'rejected'] },
];

const ORDER: Record<string, number> = { pending: 0, revision_requested: 1, submitted: 2, disputed: 2, approved: 3, auto_approved: 3, rejected: 4 };

function daysLeft(date?: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function Deadline({ delivery }: { delivery: any }) {
  if (!['pending', 'revision_requested'].includes(delivery.status)) return null;
  const d = daysLeft(delivery.productionDeadline);
  if (d === null) return <span className="text-neutral-500 inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Délai : après réception du produit</span>;
  if (d < 0) return <span className="text-red-600 font-medium inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> En retard de {-d} jour{-d > 1 ? 's' : ''}</span>;
  if (d === 0) return <span className="text-orange-600 font-medium inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> À livrer aujourd&apos;hui</span>;
  return <span className={`inline-flex items-center gap-1 ${d <= 3 ? 'text-orange-600 font-medium' : 'text-neutral-600'}`}><CalendarClock className="w-3.5 h-3.5" /> Dans {d} jour{d > 1 ? 's' : ''} ({formatDate(delivery.productionDeadline)})</span>;
}

function DeliveriesContent() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyStatus = searchParams.get('status');
  const filter = searchParams.get('filter') || (legacyStatus ? FILTERS.find((f) => f.statuses.includes(legacyStatus))?.key || 'all' : 'all');
  const { data, isLoading } = useDeliveries({ limit: 100 }, ready);
  const cfg = usePublicConfig();

  const isBrand = user?.role === 'brand';
  const all: any[] = useMemo(() => data?.deliveries || [], [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const f of FILTERS) if (f.statuses.length) c[f.key] = all.filter((d) => f.statuses.includes(d.status)).length;
    return c;
  }, [all]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
    const list = f.statuses.length ? all.filter((d) => f.statuses.includes(d.status)) : all.slice();
    // Urgence d'abord : missions à livrer triées par date limite, puis révisions, puis en attente de validation, puis terminées (récentes en premier)
    return list.sort((a, b) => {
      const oa = ORDER[a.status] ?? 9, ob = ORDER[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      if (oa <= 1) {
        const da = a.productionDeadline ? new Date(a.productionDeadline).getTime() : Infinity;
        const db = b.productionDeadline ? new Date(b.productionDeadline).getTime() : Infinity;
        if (da !== db) return da - db;
      }
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  }, [all, filter]);

  if (!ready) return <Spinner />;

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'pending': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'submitted': return <Package className="w-5 h-5 text-blue-500" />;
      case 'approved':
      case 'auto_approved': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'revision_requested': return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default: return <Package className="w-5 h-5 text-neutral-500" />;
    }
  };

  const noun = isBrand ? 'livraison' : 'mission';

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {isBrand ? 'Livraisons reçues' : 'Mes missions'}
          </h1>
          <p className="text-neutral-600">
            {isBrand
              ? `Validez les vidéos ou demandez des révisions, dans la limite prévue par le devis. Sans réponse sous ${plural(cfg.autoApprovalDays, 'jour')}, la livraison est approuvée automatiquement.`
              : 'Une mission par campagne gagnée : envoyez vos vidéos avant la date limite, soumettez-les, puis recevez votre paiement après validation.'}
          </p>
        </div>

        {/* Onglets de filtre avec compteurs */}
        <div className="flex gap-2 flex-wrap mb-6" role="tablist">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            const n = counts[f.key] || 0;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => router.replace(f.key === 'all' ? '/deliveries' : `/deliveries?filter=${f.key}`)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${active ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'}`}
              >
                {isBrand && f.brandLabel ? f.brandLabel : f.label}
                <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-neutral-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <Spinner fullScreen={false} />
        ) : visible.length > 0 ? (
          <div className="space-y-4">
            {visible.map((delivery: any) => {
              const expected = delivery.expectedCount || 1;
              const sent = delivery.itemCount ?? (delivery.files?.length || 0);
              return (
                <Card
                  key={delivery._id}
                  className={`p-6 hover:shadow-lg transition cursor-pointer ${delivery.isLate ? 'border-red-200' : ''}`}
                  onClick={() => router.push(`/deliveries/${delivery._id}`)}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-4 flex-1 min-w-[240px]">
                      <div className="mt-1">{getStatusIcon(delivery.status)}</div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h3 className="font-semibold text-lg text-neutral-900">{delivery.campaignId?.title}</h3>
                          <Badge map={DELIVERY_STATUS} value={delivery.status} />
                          {delivery.isLate && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">En retard</span>}
                        </div>

                        <div className="text-sm text-neutral-600 mb-2">
                          {isBrand ? `Créateur : ${delivery.creatorId?.profile?.name}` : `Marque : ${delivery.brandId?.profile?.companyName}`}
                        </div>

                        <div className="flex items-center gap-x-4 gap-y-1 text-sm flex-wrap">
                          <Deadline delivery={delivery} />
                          <span className="text-neutral-600 inline-flex items-center gap-1"><Video className="w-3.5 h-3.5" /> {sent}/{expected} vidéo{expected > 1 ? 's' : ''} envoyée{sent > 1 ? 's' : ''}</span>
                          {delivery.revisionCount > 0 && <span className="text-neutral-600">{delivery.revisionCount} révision{delivery.revisionCount > 1 ? 's' : ''}</span>}
                        </div>

                        {delivery.status === 'submitted' && delivery.daysUntilAutoApproval !== null && delivery.daysUntilAutoApproval !== undefined && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mt-3 inline-block">
                            <p className="text-sm text-yellow-800">
                              ⏰ {isBrand ? 'Approbation automatique' : 'Validation automatique'} dans {delivery.daysUntilAutoApproval} jour(s)
                            </p>
                          </div>
                        )}

                        <div className="text-xs text-neutral-500 mt-2">
                          {delivery.submittedAt ? `Soumise ${formatRelativeTime(delivery.submittedAt)}` : `Démarrée ${formatRelativeTime(delivery.createdAt)}`}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary-600">
                        {formatCurrency(isBrand ? delivery.payment?.amount : delivery.payment?.creatorAmount)}
                      </div>
                      {!isBrand && <div className="text-xs text-neutral-500 mb-2">{['approved', 'auto_approved'].includes(delivery.status) ? 'gagnés' : 'à recevoir après validation'}</div>}
                      <Button size="sm" variant="outline">
                        Voir {noun === 'mission' ? 'la mission' : 'détails'}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Package className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              {all.length > 0 ? `Aucune ${noun} dans cette catégorie` : isBrand ? 'Aucune livraison' : 'Aucune mission'}
            </h3>
            <p className="text-neutral-600 mb-4">
              {all.length > 0
                ? 'Changez de filtre pour voir vos autres missions.'
                : isBrand
                  ? 'Les livraisons apparaîtront ici dès que vous aurez sélectionné un créateur sur une campagne.'
                  : 'Une mission démarre dès qu\'une marque accepte votre devis. En attendant, candidatez aux campagnes ouvertes.'}
            </p>
            {!isBrand && all.length === 0 && (
              <Link href="/campaigns"><Button>Voir les campagnes ouvertes <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            )}
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
