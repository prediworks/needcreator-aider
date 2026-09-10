'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PaymentCard from '@/components/PaymentCard';
import { FileSignature, Download, CalendarClock } from 'lucide-react';
import { RIGHTS_DURATION, RIGHTS_SUPPORTS } from '@/lib/labels';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Contrat de mission (PDF), droits d'utilisation et prolongation
 */
export default function ContractCard({ delivery, role }: { delivery: any; role: 'brand' | 'creator' }) {
  const queryClient = useQueryClient();
  const id = delivery._id;
  const { data, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: async () => (await api.get(`/deliveries/${id}/contract`)).data,
    enabled: !!delivery.contract?.number,
  });
  const contract = data?.contract;
  const ext = data?.rightsExtension || { status: 'none' };
  const isDone = ['approved', 'auto_approved'].includes(delivery.status);
  const [message, setMessage] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('1y');
  const [showRequest, setShowRequest] = useState(false);
  const [showPropose, setShowPropose] = useState(false);

  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['contract', id] }); queryClient.invalidateQueries({ queryKey: ['delivery', id] }); };
  const useAct = (path: string, body?: any, ok?: string) => useMutation({
    mutationFn: async () => (await api.post(`/deliveries/${id}/rights-extension/${path}`, body)).data,
    onSuccess: (d) => { toast.success(d.message || ok || 'OK'); if (d.warning) toast.warning(d.warning, { duration: 8000 }); refresh(); setShowRequest(false); setShowPropose(false); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const request = useAct('request', { message });
  const propose = useAct('propose', { price: Number(price), duration });
  const accept = useAct('accept');
  const decline = useAct('decline');

  if (!delivery.contract?.number) return null;

  const endAt = contract?.rightsEndAt;
  const daysLeft = endAt ? Math.ceil((new Date(endAt).getTime() - Date.now()) / 86400000) : null;

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold text-neutral-900 mb-1 flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary-500" /> Contrat et droits d&apos;utilisation</h2>
      <p className="text-sm text-neutral-500 mb-4">Contrat de mission et cession de droits <strong>{delivery.contract.number}</strong>, généré à l&apos;acceptation du devis.</p>

      {isLoading || !contract ? null : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <a href={contract.url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><Download className="w-4 h-4 mr-1" /> Télécharger le contrat (PDF)</Button></a>
            {(contract.addenda || []).map((a: any) => (
              <a key={a.number} href={a.url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost"><Download className="w-4 h-4 mr-1" /> Avenant {a.number}</Button></a>
            ))}
          </div>

          <div className="text-sm text-neutral-700 bg-neutral-50 rounded-lg p-4 space-y-1">
            <div><strong>Droits cédés :</strong> {RIGHTS_DURATION[contract.rights?.duration] || contract.rights?.duration} · {(contract.rights?.supports || []).map((s: string) => RIGHTS_SUPPORTS[s] || s).join(', ')} · {contract.rights?.territories}{contract.rights?.exclusivity ? ` · exclusivité ${contract.rights.exclusivityMonths || 12} mois` : ''}</div>
            {isDone ? (
              <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-neutral-500" />
                {endAt
                  ? <span>Fin des droits le <strong>{formatDate(endAt)}</strong>{daysLeft !== null && daysLeft <= 30 && daysLeft > 0 ? <span className="text-orange-700"> · dans {daysLeft} jour(s)</span> : null}{daysLeft !== null && daysLeft <= 0 ? <span className="text-red-700"> · expirés</span> : null}</span>
                  : <span>Droits <strong>illimités</strong> dans le temps</span>}
              </div>
            ) : (
              <div className="text-neutral-500">Les droits courent à partir de la validation de la livraison.</div>
            )}
          </div>

          {/* Prolongation */}
          {isDone && endAt && (
            <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
              <h3 className="font-medium text-neutral-900">Prolongation des droits</h3>

              {ext.status === 'requested' && (
                <p className="text-sm text-neutral-700">{role === 'brand' ? 'Demande envoyée au créateur, en attente de sa proposition.' : `La marque souhaite prolonger les droits${ext.requestMessage ? ` : « ${ext.requestMessage} »` : '.'}`}</p>
              )}
              {ext.status === 'proposed' && (
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm">
                  <div>Proposition du créateur : <strong>{RIGHTS_DURATION[ext.duration]}</strong> supplémentaire(s) pour <strong>{ext.price} € HT</strong>{ext.note ? ` · ${ext.note}` : ''}</div>
                  {role === 'brand' && (
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => accept.mutate()} isLoading={accept.isPending}>Accepter et payer</Button>
                      <Button size="sm" variant="ghost" onClick={() => decline.mutate()} isLoading={decline.isPending}>Refuser</Button>
                    </div>
                  )}
                  {role === 'creator' && <div className="text-neutral-500 mt-1">En attente de la réponse de la marque.</div>}
                </div>
              )}
              {ext.status === 'awaiting_payment' && role === 'brand' && (
                <PaymentCard
                  deliveryId={id}
                  intentPath={`/deliveries/${id}/rights-extension/payment-intent`}
                  confirmPath={`/deliveries/${id}/rights-extension/confirm`}
                  title="Paiement de la prolongation"
                  subtitle={`${RIGHTS_DURATION[ext.duration]} supplémentaire(s) · débité immédiatement`}
                  buttonLabel="Payer la prolongation"
                  immediate
                />
              )}
              {ext.status === 'awaiting_payment' && role === 'creator' && <p className="text-sm text-neutral-700">La marque a accepté : paiement en cours.</p>}
              {ext.status === 'paid' && <p className="text-sm text-green-700">Dernière prolongation confirmée le {formatDate(ext.paidAt)}.</p>}
              {ext.status === 'declined' && <p className="text-sm text-neutral-500">La dernière proposition a été refusée.</p>}

              {role === 'brand' && !['requested', 'proposed', 'awaiting_payment'].includes(ext.status) && (
                showRequest ? (
                  <div className="space-y-2">
                    <Input label="Message au créateur (optionnel)" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nous aimerions continuer à diffuser la vidéo un an de plus." />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => request.mutate()} isLoading={request.isPending}>Envoyer la demande</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowRequest(false)}>Annuler</Button>
                    </div>
                  </div>
                ) : <Button size="sm" variant="outline" onClick={() => setShowRequest(true)}>Demander une prolongation</Button>
              )}

              {role === 'creator' && !['awaiting_payment'].includes(ext.status) && (
                showPropose ? (
                  <div className="space-y-2">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <Input label="Prix de la prolongation (€ HT)" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="150" />
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Durée supplémentaire</label>
                        <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                          {Object.entries(RIGHTS_DURATION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">Vous recevez 90 % du prix, comme pour une mission.</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => propose.mutate()} isLoading={propose.isPending} disabled={price === '' || Number(price) < 0}>Envoyer la proposition</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowPropose(false)}>Annuler</Button>
                    </div>
                  </div>
                ) : <Button size="sm" variant="outline" onClick={() => setShowPropose(true)}>{ext.status === 'requested' ? 'Faire une proposition' : 'Proposer une prolongation'}</Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
