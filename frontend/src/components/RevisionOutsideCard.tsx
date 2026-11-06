'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

/**
 * Révision faite hors NeedCreator (ex. « publiez-la sur Instagram ») : pas de nouvelle version à envoyer.
 * Marque : valide la dernière version et paie. Créateur : signale la révision faite, la livraison repasse « à valider ».
 */
export default function RevisionOutsideCard({ delivery, role }: { delivery: any; role: 'brand' | 'creator' }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const id = delivery._id;
  const urlOk = !url.trim() || /^https?:\/\/\S+\.\S+/.test(url.trim());

  const mutation = useMutation({
    mutationFn: async () => role === 'brand'
      ? (await api.post(`/deliveries/${id}/approve`, { withoutNewVersion: true, publishedUrl: url.trim() })).data
      : (await api.post(`/deliveries/${id}/revision/outside`, { publishedUrl: url.trim() })).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      if (role === 'brand') {
        if (data?.warning) toast.warning(`Livraison approuvée. ${data.warning}`, { duration: 8000 });
        else toast.success('Livraison approuvée, paiement versé au créateur.');
      } else toast.success('C\'est noté : la marque est prévenue et peut valider.');
      setOpen(false);
      setUrl('');
    },
    onError: (e: any) => {
      if (e?.response?.data?.code === 'PAYMENT_EXPIRED') {
        queryClient.invalidateQueries({ queryKey: ['delivery', id] });
        queryClient.invalidateQueries({ queryKey: ['payment-intent'] });
        setOpen(false);
      }
      toast.error(getErrorMessage(e), { duration: 10000 });
    },
  });

  const go = () => {
    if (!urlOk) return;
    const msg = role === 'brand'
      ? `Valider sans nouvelle version ?\n\nLa dernière version envoyée est validée et le paiement de ${formatCurrency(delivery.payment?.creatorAmount)} est versé au créateur. Cette action est définitive.`
      : 'Signaler la révision comme faite hors NeedCreator ?\n\nVotre dernière version repasse « à valider » chez la marque, qui est prévenue.';
    if (confirm(msg)) mutation.mutate();
  };

  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50" data-testid={`revision-outside-${role}`}>
      <p className="text-sm text-neutral-700">
        {role === 'brand'
          ? 'La révision a été faite en dehors de NeedCreator (par exemple une publication sur Instagram ou TikTok) ? Validez sans attendre de nouvelle version.'
          : 'La révision ne demande pas de nouvelle vidéo (par exemple une publication sur Instagram ou TikTok) ? Signalez-la comme faite.'}
      </p>
      {!open ? (
        <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setOpen(true)}>
          {role === 'brand' ? 'Valider sans nouvelle version' : 'Révision faite hors NeedCreator'}
        </Button>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block text-xs font-medium text-neutral-700">Lien de la publication (facultatif)</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/p/…"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {!urlOk && <p className="text-xs text-red-600">Collez une adresse complète, commençant par https://</p>}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={go} isLoading={mutation.isPending} disabled={!urlOk}>
              {role === 'brand' ? 'Valider et payer' : 'Signaler comme faite'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setOpen(false); setUrl(''); }}>Annuler</Button>
          </div>
        </div>
      )}
    </div>
  );
}
