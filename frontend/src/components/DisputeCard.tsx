'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Gavel, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/utils';

/**
 * Litige : refus définitif demandé par la marque quand les révisions prévues au devis sont épuisées.
 * Marque : ouvre le litige (motif obligatoire). Créateur : répond une fois. Les deux : voient la décision de l'équipe.
 */
export default function DisputeCard({ delivery, role }: { delivery: any; role: 'brand' | 'creator' }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [response, setResponse] = useState('');
  const dispute = delivery.dispute || {};
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['delivery', delivery._id] }); queryClient.invalidateQueries({ queryKey: ['deliveries'] }); };

  const openDispute = useMutation({
    mutationFn: async () => (await api.post(`/deliveries/${delivery._id}/dispute`, { reason })).data,
    onSuccess: (d) => { toast.success(d.message); setOpen(false); refresh(); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const respond = useMutation({
    mutationFn: async () => (await api.post(`/deliveries/${delivery._id}/dispute/respond`, { response })).data,
    onSuccess: (d) => { toast.success(d.message); refresh(); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  // 1. Marque : proposer le refus définitif (révisions épuisées, livraison soumise)
  if (role === 'brand' && delivery.canDispute && dispute.status !== 'open') {
    return (
      <Card className="p-5 border-red-200">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-900">Les révisions prévues au devis sont épuisées</h3>
            <p className="text-sm text-neutral-600 mt-1">Si les vidéos ne correspondent toujours pas au brief, vous pouvez demander un refus définitif. Notre équipe examine les vidéos, le brief et vos échanges, puis tranche : paiement intégral, partage, ou remboursement. La validation automatique est suspendue le temps de l&apos;examen.</p>
            {!open ? (
              <Button variant="outline" size="sm" className="mt-3 border-red-300 text-red-700 hover:bg-red-50" onClick={() => setOpen(true)}>Demander un refus définitif</Button>
            ) : (
              <div className="mt-3 space-y-2">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Expliquez précisément ce qui ne correspond pas au brief (20 caractères minimum). Ce texte sera lu par le créateur et par notre équipe." className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { if (confirm('Ouvrir un litige ? La validation automatique sera suspendue et notre équipe tranchera.')) openDispute.mutate(); }} isLoading={openDispute.isPending} disabled={reason.trim().length < 20}>Ouvrir le litige</Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (!dispute.status || dispute.status === 'none') return null;

  // 2. Litige ouvert
  if (dispute.status === 'open') {
    return (
      <Card className="p-5 border-red-200 bg-red-50/40">
        <div className="flex items-start gap-3">
          <Gavel className="w-5 h-5 text-red-600 mt-0.5" />
          <div className="flex-1 text-sm">
            <h3 className="font-semibold text-neutral-900">Litige en cours d&apos;examen</h3>
            <p className="text-neutral-600 mt-1">Ouvert le {formatDate(dispute.openedAt)}. La validation automatique est suspendue. Notre équipe tranche après avoir lu les deux parties : paiement intégral, partage, ou remboursement de la marque.</p>
            <div className="mt-3 bg-white border border-neutral-200 rounded-lg p-3">
              <div className="text-xs text-neutral-500 mb-1">Motif de la marque</div>
              <p className="text-neutral-800 whitespace-pre-line">{dispute.reason}</p>
            </div>
            {dispute.creatorResponse ? (
              <div className="mt-2 bg-white border border-neutral-200 rounded-lg p-3">
                <div className="text-xs text-neutral-500 mb-1">Réponse du créateur ({formatDate(dispute.creatorRespondedAt)})</div>
                <p className="text-neutral-800 whitespace-pre-line">{dispute.creatorResponse}</p>
              </div>
            ) : role === 'creator' ? (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-neutral-600">Votre réponse (une seule, 10 caractères minimum) : expliquez en quoi vos vidéos respectent le brief.</label>
                <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={4} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <Button size="sm" onClick={() => respond.mutate()} isLoading={respond.isPending} disabled={response.trim().length < 10}>Envoyer ma réponse</Button>
              </div>
            ) : (
              <p className="text-xs text-neutral-500 mt-2">Le créateur n&apos;a pas encore répondu.</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // 3. Litige tranché
  const outcome = dispute.outcome === 'approve'
    ? 'Paiement intégral au créateur.'
    : dispute.outcome === 'refund_full'
      ? 'Remboursement intégral de la marque, mission refusée.'
      : `Partage : ${dispute.creatorPercent} % du prix payé (${dispute.paidAmount} €), ${dispute.refundedAmount} € rendus à la marque.`;
  return (
    <Card className="p-5 border-neutral-200">
      <div className="flex items-start gap-3">
        <Gavel className="w-5 h-5 text-neutral-600 mt-0.5" />
        <div className="flex-1 text-sm">
          <h3 className="font-semibold text-neutral-900">Litige tranché le {formatDate(dispute.resolvedAt)}</h3>
          <p className="text-neutral-800 mt-1"><strong>{outcome}</strong></p>
          {dispute.note && <p className="text-neutral-600 mt-1 whitespace-pre-line">{dispute.note}</p>}
        </div>
      </div>
    </Card>
  );
}
