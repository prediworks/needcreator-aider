'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

/** Requête partagée avec le bouton à compteur de l'outil de prospection */
export function useBrandSearches() {
  return useQuery({ queryKey: ['acq-brand-searches'], queryFn: async () => (await api.get('/admin/acquisition/brand-searches')).data, refetchInterval: 60000 });
}

/**
 * Marques cherchées par les créateurs dans « Candidature vidéo » sans résultat : ils possèdent le produit et voulaient tourner.
 * La fiche se crée sur un clic, jamais toute seule ; les créateurs sont prévenus quand la marque devient proposable.
 */
export default function BrandSearches() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useBrandSearches();
  const onError = (e: any) => toast.error(getErrorMessage(e), { duration: 10000 });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['acq-brand-searches'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-overview'] }); };
  const create = useMutation({ mutationFn: async ({ norm, name }: { norm: string; name?: string }) => (await api.post('/admin/acquisition/brand-searches', { norm, action: 'create', ...(name ? { name } : {}) })).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); refresh(); }, onError });
  const dismiss = useMutation({ mutationFn: async (norm: string) => (await api.post('/admin/acquisition/brand-searches', { norm, action: 'dismiss' })).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError });
  const list = data?.searches || [];
  return (
    <Card className="p-6" data-testid="brand-searches">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Marques cherchées par les créateurs</h2>
      <p className="text-sm text-neutral-600 mb-3">Ce qu&apos;un créateur a tapé dans « Candidature vidéo » sans rien trouver. Il possède sans doute le produit et voulait tourner : c&apos;est la meilleure marque à démarcher. « Créer la fiche marque » la met en prospection avec cet argument, prévient les créateurs qui l&apos;ont cherchée, et la réserve dix jours au créateur s&apos;il est seul. Les très grandes marques sont refusées.</p>
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : list.length === 0 ? <p className="text-sm text-neutral-500">Aucune recherche sans résultat pour l&apos;instant.</p> : (
        <div className="space-y-2">
          {list.map((s: any) => (
            <div key={s.norm} className={`flex items-center gap-3 flex-wrap border rounded-lg p-3 text-sm ${s.status === 'open' ? 'border-neutral-200' : 'border-neutral-100 bg-neutral-50 text-neutral-600'}`} data-testid="brand-search">
              <span className="font-medium text-neutral-900">{s.query}</span>
              <span className="text-xs text-neutral-600">{s.creators} créateur{s.creators > 1 ? 's' : ''} · {s.searches} recherche{s.searches > 1 ? 's' : ''} · dernière le {formatDate(s.lastAt)}</span>
              {s.status === 'created' && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Fiche créée, créateurs prévenus</span>}
              {s.status === 'open' && s.existingLeadId && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800" title="Une fiche porte déjà ce nom : « Créer la fiche marque » la relie et prévient les créateurs">Déjà en prospection ({s.existingStatus})</span>}
              {s.status === 'open' && (
                <span className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { if (s.existingLeadId) { create.mutate({ norm: s.norm }); return; } const n = prompt('Nom de la marque (corrigez une faute de frappe du créateur si besoin) :', s.query); if (n !== null && n.trim()) create.mutate({ norm: s.norm, name: n.trim() }); }} isLoading={create.isPending} data-testid="brand-search-create">{s.existingLeadId ? 'Relier et prévenir' : 'Créer la fiche marque'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(s.norm)} isLoading={dismiss.isPending} title="Faute de frappe, marque hors sujet ou trop grande : la recherche sort de la liste">Ignorer</Button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
