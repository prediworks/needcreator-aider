'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'À valider', cls: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Validée', cls: 'bg-green-100 text-green-800' },
  refused: { label: 'Refusée', cls: 'bg-neutral-100 text-neutral-600' },
};
const TIER: Record<string, { label: string; cls: string }> = {
  ok: { label: 'Marque accessible', cls: 'bg-green-50 text-green-800' },
  large: { label: 'Grande marque', cls: 'bg-orange-100 text-orange-800' },
  huge: { label: 'Très grande marque', cls: 'bg-red-100 text-red-800' },
};
const AI_SIZE: Record<string, string> = { unknown: 'inconnue de l\'IA', small: 'petite', medium: 'moyenne', large: 'grande', huge: 'très grande' };

/** Requête partagée avec le bouton à compteur de l'outil de prospection */
export function useBrandSuggestions() {
  return useQuery({ queryKey: ['acq-brand-suggestions'], queryFn: async () => (await api.get('/admin/acquisition/brand-suggestions')).data.suggestions, refetchInterval: 60000 });
}

/** Marques suggérées par les créateurs (ils possèdent le produit) : à valider avant tout tournage */
export default function BrandSuggestions() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBrandSuggestions();
  const decide = useMutation({
    mutationFn: async ({ id, ...body }: any) => (await api.post(`/admin/acquisition/brand-suggestions/${id}`, body)).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); queryClient.invalidateQueries({ queryKey: ['acq-brand-suggestions'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-overview'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const list = data || [];
  return (
    <Card className="p-6" data-testid="brand-suggestions">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Marques suggérées par les créateurs</h2>
      <p className="text-sm text-neutral-600 mb-3">Le créateur possède déjà le produit et propose de tourner une vidéo pour la marque. Validez : la fiche de la marque est créée, qualifiée, et réservée dix jours à ce créateur. Refusez : il reçoit votre motif. La taille est une estimation (annonces actives sur Meta, connaissance de l&apos;IA) ; les seuils se règlent dans Réglages → Prospection.</p>
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : list.length === 0 ? <p className="text-sm text-neutral-500">Aucune marque suggérée pour l&apos;instant.</p> : (
        <div className="space-y-3">
          {list.map((s: any) => (
            <div key={s.id} className="border border-neutral-200 rounded-lg p-3 text-sm" data-testid="brand-suggestion">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-neutral-900">{s.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS[s.status]?.cls}`}>{STATUS[s.status]?.label}{s.auto ? ' d\'office' : ''}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${TIER[s.tier]?.cls}`}>{TIER[s.tier]?.label}</span>
              </div>
              <div className="text-neutral-700 mt-1">Produit possédé : <strong>{s.product}</strong> · suggérée par {s.creatorName || 'un créateur'} le {formatDate(s.createdAt)}</div>
              <div className="text-xs text-neutral-600 mt-0.5">
                {s.size?.ads != null ? `${s.size.ads} annonce(s) active(s) sur Meta` : 'annonces Meta : inconnu'} · taille selon l&apos;IA : {AI_SIZE[s.size?.ai] || 'non estimée'}{s.size?.group ? ` · groupe : ${s.size.group}` : ''}{s.size?.reason ? ` · ${s.size.reason}` : ''}
              </div>
              <div className="flex gap-3 flex-wrap mt-1 text-xs">
                {s.website && <a href={s.website} target="_blank" rel="noopener noreferrer" className="underline text-primary-700">Site</a>}
                {s.instagram && <a href={s.instagram} target="_blank" rel="noopener noreferrer" className="underline text-primary-700">Instagram</a>}
              </div>
              {s.status === 'refused' && s.reason && <div className="text-xs text-neutral-500 mt-1">Motif : {s.reason}</div>}
              {s.status === 'pending' && (
                <div className="flex gap-2 flex-wrap mt-2 items-center">
                  <Button size="sm" onClick={() => { const email = prompt('Adresse email de la marque, si vous la connaissez (sinon laissez vide : elle sera cherchée sur son site) :', ''); if (email !== null) decide.mutate({ id: s.id, action: 'approve', email }); }} isLoading={decide.isPending} title="Crée la fiche de la marque, la réserve dix jours au créateur et le prévient">Valider</Button>
                  <Button size="sm" variant="outline" onClick={() => { const reason = prompt('Motif du refus, envoyé au créateur (marque trop grande, hors cible, déjà cliente…) :', ''); if (reason !== null) decide.mutate({ id: s.id, action: 'refuse', reason }); }} title="Le créateur reçoit le motif et peut suggérer une autre marque">Refuser</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
