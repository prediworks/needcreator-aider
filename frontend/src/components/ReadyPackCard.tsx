'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PaymentCard from '@/components/PaymentCard';
import { Clapperboard, Download, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const FORMATS: Record<string, string> = {
  '9:16': 'Vertical 9:16 (TikTok, Reels, Shorts)',
  '1:1': 'Carré 1:1 (feed Instagram, Facebook)',
  '16:9': 'Horizontal 16:9 (YouTube, site web)',
};

/**
 * Pack "vidéo prête à diffuser" : déclinaisons de format, vignette, sous-titres (option facturée)
 */
export default function ReadyPackCard({ delivery }: { delivery: any }) {
  const queryClient = useQueryClient();
  const rp = delivery.readyPack || { status: 'none' };
  const videos = (delivery.files || []).filter((f: any) => !f.superseded && f.type === 'video');
  const [formats, setFormats] = useState<string[]>(['9:16']);
  const [subtitles, setSubtitles] = useState(false);
  const [thumbnail, setThumbnail] = useState(true);
  const price = (delivery.readyPackPricePerVideo || 0) * videos.length;

  const request = useMutation({
    mutationFn: async () => (await api.post(`/deliveries/${delivery._id}/ready-pack`, { formats, subtitles, thumbnail })).data,
    onSuccess: (d) => { toast.success(d.message); queryClient.invalidateQueries({ queryKey: ['delivery', delivery._id] }); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  // Rafraîchit pendant le traitement
  useEffect(() => {
    if (!['queued', 'processing'].includes(rp.status)) return;
    const t = setInterval(() => queryClient.invalidateQueries({ queryKey: ['delivery', delivery._id] }), 5000);
    return () => clearInterval(t);
  }, [rp.status, delivery._id, queryClient]);

  if (videos.length === 0) return null;

  const toggle = (f: string) => setFormats(formats.includes(f) ? formats.filter((x) => x !== f) : [...formats, f]);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Clapperboard className="w-5 h-5 text-primary-500" />
        <h2 className="text-lg font-semibold text-neutral-900">Pack « prêt à diffuser »</h2>
        {price > 0 && rp.status === 'none' && <span className="text-xs bg-primary-50 text-primary-800 px-2 py-0.5 rounded-full">{formatCurrency(delivery.readyPackPricePerVideo)} HT / vidéo</span>}
      </div>
      <p className="text-sm text-neutral-600 mb-4">Recevez vos vidéos déclinées aux bons formats pour chaque réseau, avec vignette et sous-titres. Traitement automatique en quelques minutes.</p>

      {rp.status === 'none' || rp.status === 'failed' ? (
        <div className="space-y-3">
          {rp.status === 'failed' && <div className="text-sm text-red-700 bg-red-50 rounded p-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {rp.error || 'Le traitement a échoué'} — vous pouvez relancer.</div>}
          <div>
            <div className="text-sm font-medium text-neutral-800 mb-1">Formats</div>
            {Object.entries(FORMATS).map(([f, l]) => (
              <label key={f} className="flex items-center gap-2 text-sm text-neutral-700 py-0.5"><input type="checkbox" checked={formats.includes(f)} onChange={() => toggle(f)} /> {l}</label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" checked={thumbnail} onChange={(e) => setThumbnail(e.target.checked)} /> Vignette (image de couverture)</label>
          <label className={`flex items-center gap-2 text-sm ${delivery.readyPackSubtitlesAvailable ? 'text-neutral-700' : 'text-neutral-400'}`}>
            <input type="checkbox" checked={subtitles} disabled={!delivery.readyPackSubtitlesAvailable} onChange={(e) => setSubtitles(e.target.checked)} /> Sous-titres automatiques incrustés{!delivery.readyPackSubtitlesAvailable ? ' (transcription non configurée)' : ''}
          </label>
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <div className="text-sm text-neutral-700">{videos.length} vidéo(s) × {formats.length} format(s) · <strong>{price > 0 ? formatCurrency(price) : 'inclus'}</strong></div>
            <Button onClick={() => request.mutate()} isLoading={request.isPending} disabled={formats.length === 0}>
              {price > 0 ? 'Commander le pack' : 'Générer le pack'}
            </Button>
          </div>
        </div>
      ) : rp.status === 'awaiting_payment' ? (
        <PaymentCard
          deliveryId={delivery._id}
          intentPath={`/deliveries/${delivery._id}/ready-pack/payment-intent`}
          confirmPath={`/deliveries/${delivery._id}/ready-pack/confirm`}
          title="Paiement du pack"
          subtitle={`${formatCurrency(rp.price)} — débité immédiatement, traitement lancé aussitôt.`}
          buttonLabel={`Payer ${formatCurrency(rp.price)}`}
          immediate
        />
      ) : ['queued', 'processing'].includes(rp.status) ? (
        <div className="flex items-center gap-2 text-sm text-neutral-700"><Loader2 className="w-4 h-4 animate-spin" /> Traitement en cours… cette page se met à jour automatiquement.</div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-sm text-green-700 mb-3"><CheckCircle className="w-4 h-4" /> Pack prêt{rp.error ? ` (${rp.error})` : ''}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {(rp.outputs || []).map((o: any, i: number) => (
              <div key={i} className="border border-neutral-200 rounded-lg p-3 text-sm">
                <div className="font-medium text-neutral-900">{o.kind === 'video' ? `Vidéo ${o.format}${o.subtitled ? ' sous-titrée' : ''}` : o.kind === 'thumbnail' ? 'Vignette' : 'Sous-titres (SRT)'}</div>
                <div className="text-xs text-neutral-500 truncate">{o.sourceName}{o.width ? ` · ${o.width}×${o.height}` : ''}</div>
                {o.error ? <div className="text-xs text-red-600 mt-1">{o.error}</div> : (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline text-xs flex items-center gap-1 mt-1"><Download className="w-3 h-3" /> Télécharger</a>
                )}
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => request.mutate()} isLoading={request.isPending}>Regénérer avec d&apos;autres options</Button>
        </div>
      )}
    </Card>
  );
}
