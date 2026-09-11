'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Package, Truck, CheckCircle, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

/**
 * Suivi de l'envoi du produit sur une livraison
 */
export default function ShippingCard({ delivery, role }: { delivery: any; role: 'brand' | 'creator' }) {
  const queryClient = useQueryClient();
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [note, setNote] = useState('');
  const shipping = delivery.shipping || {};
  const address = shipping.address || {};
  const hasAddress = !!(address.line1 && address.city);

  const update = useMutation({
    mutationFn: async (body: any) => (await api.patch(`/deliveries/${delivery._id}/shipping`, body)).data,
    onSuccess: (d) => {
      toast.success(d.message);
      queryClient.invalidateQueries({ queryKey: ['delivery', delivery._id] });
    },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  if (!shipping.required && shipping.status === 'none' && role === 'creator') return null;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2"><Package className="w-5 h-5 text-primary-500" /> Envoi du produit</h2>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          shipping.status === 'received' ? 'bg-green-100 text-green-800' : shipping.status === 'shipped' ? 'bg-blue-100 text-blue-800' : shipping.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-neutral-100 text-neutral-600'
        }`}>
          {shipping.status === 'received' ? 'Reçu' : shipping.status === 'shipped' ? 'Expédié' : shipping.status === 'pending' ? 'À expédier' : 'Pas d\'envoi'}
        </span>
      </div>

      {/* Étapes */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
        {[['Adresse', hasAddress], ['Expédié', ['shipped', 'received'].includes(shipping.status)], ['Reçu', shipping.status === 'received']].map(([l, done], i) => (
          <div key={i} className={`rounded-lg py-2 ${done ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}>{done ? '✓ ' : ''}{l as string}</div>
        ))}
      </div>

      {role === 'brand' && (
        <div className="space-y-4">
          <div className="text-sm">
            <div className="font-medium text-neutral-800 flex items-center gap-1 mb-1"><MapPin className="w-4 h-4" /> Adresse du créateur</div>
            {hasAddress ? (
              <address className="not-italic text-neutral-700 bg-neutral-50 rounded p-3">
                {address.name}<br />{address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />{address.postalCode} {address.city}<br />{address.country}{address.phone ? <><br />📞 {address.phone}</> : null}
              </address>
            ) : (
              <p className="text-orange-700 bg-orange-50 rounded p-3">Le créateur n&apos;a pas encore renseigné son adresse. Demandez-la lui via la messagerie.</p>
            )}
          </div>

          {shipping.status === 'pending' && (
            <div className="border-t border-neutral-100 pt-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input label="Transporteur" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Colissimo, Chronopost, UPS…" />
                <Input label="Numéro de suivi" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="6A1234567890" />
              </div>
              <Input label="Lien de suivi (optionnel)" type="url" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://www.laposte.fr/outils/suivre-vos-envois?code=…" />
              <Input label="Note pour le créateur (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="2 coloris dans le colis, testez le rouge en priorité" />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => update.mutate({ action: 'shipped', carrier, trackingNumber: tracking, trackingUrl, note })} isLoading={update.isPending}>
                  <Truck className="w-4 h-4 mr-2" /> Marquer comme expédié
                </Button>
                <Button variant="ghost" onClick={() => update.mutate({ action: 'not_required' })} isLoading={update.isPending}>Pas d&apos;envoi nécessaire</Button>
              </div>
            </div>
          )}
          {shipping.status === 'none' && !shipping.required && (
            <Button variant="outline" size="sm" onClick={() => update.mutate({ action: 'shipped', carrier, trackingNumber: tracking })} isLoading={update.isPending}>
              <Truck className="w-4 h-4 mr-2" /> J&apos;envoie quand même un produit
            </Button>
          )}
        </div>
      )}

      {(shipping.status === 'shipped' || shipping.status === 'received') && (
        <div className="text-sm text-neutral-700 space-y-1 border-t border-neutral-100 pt-3 mt-3">
          <div>Expédié le {shipping.shippedAt ? formatDate(shipping.shippedAt) : '—'}{shipping.carrier ? ` via ${shipping.carrier}` : ''}</div>
          {shipping.trackingNumber && (
            <div>Suivi : {shipping.trackingUrl ? <a href={shipping.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">{shipping.trackingNumber}</a> : shipping.trackingNumber}</div>
          )}
          {shipping.note && <div className="text-neutral-600">Note : {shipping.note}</div>}
          {shipping.status === 'received' && <div className="text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Reçu le {formatDate(shipping.receivedAt)}</div>}
        </div>
      )}

      {role === 'creator' && shipping.status === 'pending' && (
        <div className="text-sm text-neutral-700">
          La marque doit vous envoyer un produit avant la production.{' '}
          {hasAddress ? 'Votre adresse est transmise.' : <>Renseignez votre adresse dans <Link href="/profile#address" className="text-primary-600 underline">votre profil</Link> pour qu&apos;elle puisse l&apos;expédier.</>}
        </div>
      )}
      {role === 'creator' && shipping.status === 'shipped' && (
        <Button className="mt-3" onClick={() => update.mutate({ action: 'received' })} isLoading={update.isPending}>
          <CheckCircle className="w-4 h-4 mr-2" /> J&apos;ai reçu le produit
        </Button>
      )}

      {delivery.productionDeadline && (
        <p className="text-xs text-neutral-500 mt-3">Livraison des vidéos attendue avant le <strong>{formatDate(delivery.productionDeadline)}</strong> ({delivery.estimatedDeliveryDays} jours{shipping.status === 'received' ? ' après réception' : ''}).</p>
      )}
    </Card>
  );
}
