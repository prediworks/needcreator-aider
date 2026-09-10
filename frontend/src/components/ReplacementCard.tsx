'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { UserX, Star, RefreshCw } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LEVELS } from '@/lib/labels';
import { toast } from 'sonner';

/**
 * Garantie de remplacement : le créateur n'a pas livré, la marque confie la mission à un autre candidat en un clic
 */
export default function ReplacementCard({ delivery }: { delivery: any }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['replacement', delivery._id],
    queryFn: async () => (await api.get(`/deliveries/${delivery._id}/replacement/candidates`)).data,
    enabled: !!delivery.replacementAvailable,
  });
  const select = useMutation({
    mutationFn: async (creatorId: string) => (await api.post(`/deliveries/${delivery._id}/replacement/select/${creatorId}`)).data,
    onSuccess: (d) => {
      toast.success(d.message);
      if (d.warning) toast.warning(d.warning, { duration: 8000 });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      router.push(`/deliveries/${d.delivery._id}`);
    },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  if (!delivery.isLate || ['approved', 'auto_approved', 'rejected'].includes(delivery.status)) return null;

  return (
    <Card className="p-6 border-orange-300 bg-orange-50/40">
      <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2 mb-1"><UserX className="w-5 h-5 text-orange-600" /> Livraison en retard</h2>
      <p className="text-sm text-neutral-700 mb-4">
        La date de livraison prévue ({formatDate(delivery.productionDeadline)}) est dépassée et rien n&apos;a été livré. Le créateur a été relancé.
        {!delivery.replacementAvailable && ` Passé ${data?.graceHours || 48} h de retard, vous pourrez confier la mission à un autre créateur, sans frais : le montant bloqué sera libéré.`}
      </p>
      {delivery.replacementAvailable && (
        <>
          <p className="text-sm font-medium text-neutral-900 mb-3">Garantie de remplacement : choisissez un autre créateur parmi les meilleurs devis reçus. Le montant bloqué est libéré, la nouvelle mission démarre tout de suite.</p>
          {isLoading ? <p className="text-sm text-neutral-500">Chargement des candidats…</p> : !data?.candidates?.length ? (
            <p className="text-sm text-neutral-600">Aucun autre devis disponible sur cette campagne. Vous pouvez la republier ou inviter des créateurs depuis l&apos;annuaire.</p>
          ) : (
            <div className="space-y-3">
              {data.candidates.map((c: any) => (
                <div key={c.creatorId} className="bg-white border border-neutral-200 rounded-lg p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium text-neutral-900">{c.name} <span className="text-xs text-neutral-500">· {LEVELS?.[c.level]?.label || c.level}</span></div>
                    <div className="text-sm text-neutral-600 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-500" /> {c.rating ? c.rating.toFixed(1) : '—'} · {c.completedJobs} mission(s)</span>
                      <span>· {formatCurrency(c.price)} · {c.estimatedDeliveryDays} jours</span>
                      {c.matchScore ? <span>· matching {c.matchScore} %</span> : null}
                    </div>
                    {c.proposal && <p className="text-sm text-neutral-700 mt-1 line-clamp-2">{c.proposal}</p>}
                  </div>
                  {confirming === c.creatorId ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => select.mutate(c.creatorId)} isLoading={select.isPending}><RefreshCw className="w-4 h-4 mr-1" /> Confirmer</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Annuler</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConfirming(c.creatorId)}>Confier la mission</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
