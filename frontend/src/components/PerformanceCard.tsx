'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { PLATFORMS } from '@/lib/labels';
import { BarChart3, Save } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

const NETWORKS = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'];
const fmt = (n?: number) => (n || 0).toLocaleString('fr-FR');

/**
 * Performances des vidéos livrées (saisie manuelle par la marque ou le créateur)
 */
export default function PerformanceCard({ delivery }: { delivery: any }) {
  const queryClient = useQueryClient();
  const items: any[] = [
    ...(delivery.files || []).filter((f: any) => !f.superseded).map((f: any) => ({ id: f._id, label: f.filename || 'Fichier', url: '' })),
    ...(delivery.links || []).filter((l: any) => !l.superseded).map((l: any) => ({ id: l._id, label: l.title || l.url, url: l.url, platform: l.platform })),
  ];
  const perf: any[] = delivery.performance || [];
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});

  const save = useMutation({
    mutationFn: async (body: any) => (await api.patch(`/deliveries/${delivery._id}/performance`, body)).data,
    onSuccess: () => { toast.success('Performances enregistrées'); setEditing(null); queryClient.invalidateQueries({ queryKey: ['delivery', delivery._id] }); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  const totals = perf.reduce((a, p) => ({ views: a.views + (p.views || 0), likes: a.likes + (p.likes || 0), comments: a.comments + (p.comments || 0), shares: a.shares + (p.shares || 0) }), { views: 0, likes: 0, comments: 0, shares: 0 });

  const startEdit = (item: any) => {
    const existing = perf.find((p) => p.itemId === item.id) || {};
    setForm({ itemId: item.id, platform: existing.platform || item.platform || 'other', url: existing.url || item.url || '', views: existing.views || 0, likes: existing.likes || 0, comments: existing.comments || 0, shares: existing.shares || 0 });
    setEditing(item.id);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary-500" /> Performances des vidéos</h2>
        {perf.length > 0 && <span className="text-sm text-neutral-600">{fmt(totals.views)} vues · {fmt(totals.likes)} likes · {fmt(totals.comments)} commentaires</span>}
      </div>
      <p className="text-xs text-neutral-500 mb-4">Renseignez les chiffres de la publication (vues, likes…). La connexion automatique aux réseaux sociaux arrivera plus tard.</p>

      <div className="space-y-2">
        {items.map((item) => {
          const p = perf.find((x) => x.itemId === item.id);
          const isEditing = editing === item.id;
          return (
            <div key={item.id} className="border border-neutral-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900 truncate">{item.label}</div>
                  {p ? (
                    <div className="text-xs text-neutral-600">{PLATFORMS[p.platform] || p.platform} · {fmt(p.views)} vues · {fmt(p.likes)} likes · {fmt(p.comments)} comm. · {fmt(p.shares)} partages · maj {formatRelativeTime(p.updatedAt)}{p.url ? <> · <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">publication</a></> : null}</div>
                  ) : <div className="text-xs text-neutral-400">Pas encore de chiffres</div>}
                </div>
                {!isEditing && <Button size="sm" variant="outline" onClick={() => startEdit(item)}>{p ? 'Mettre à jour' : 'Renseigner'}</Button>}
              </div>
              {isEditing && (
                <div className="mt-3 grid sm:grid-cols-6 gap-2 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Réseau</label>
                    <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full px-2 py-2 border border-neutral-300 rounded-lg text-sm">
                      {NETWORKS.map((n) => <option key={n} value={n}>{PLATFORMS[n]}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-4"><Input label="Lien de la publication" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
                  {['views', 'likes', 'comments', 'shares'].map((k) => (
                    <Input key={k} label={{ views: 'Vues', likes: 'Likes', comments: 'Commentaires', shares: 'Partages' }[k]} type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: parseInt(e.target.value) || 0 })} />
                  ))}
                  <div className="sm:col-span-2 flex gap-2">
                    <Button size="sm" onClick={() => save.mutate({ ...form, url: form.url || undefined })} isLoading={save.isPending}><Save className="w-4 h-4 mr-1" /> Enregistrer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
