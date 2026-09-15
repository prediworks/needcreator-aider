'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { Radar, Copy, ExternalLink, RefreshCw, Trash2, Download, UserPlus, Play } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'À qualifier', cls: 'bg-neutral-100 text-neutral-700' },
  qualified: { label: 'Qualifié', cls: 'bg-blue-100 text-blue-800' },
  to_contact: { label: 'À contacter', cls: 'bg-indigo-100 text-indigo-800' },
  contacted: { label: 'Contacté', cls: 'bg-orange-100 text-orange-800' },
  replied: { label: 'A répondu', cls: 'bg-purple-100 text-purple-800' },
  registered: { label: 'Inscrit', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Hors cible', cls: 'bg-red-50 text-red-700' },
  excluded: { label: 'Déjà connu', cls: 'bg-neutral-100 text-neutral-500' },
};
const SOURCE: Record<string, string> = { youtube: 'YouTube', meta: 'Pub Meta', manual: 'Manuel' };

function ManualForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<any>({ kind: 'creator', name: '', handle: '', url: '', website: '', email: '', description: '', niche: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const missing = [!f.name.trim() && 'un nom'].filter(Boolean) as string[];
  const add = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/leads', f)).data, onSuccess: (d) => { toast.success(d.message); onDone(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  return (
    <Card className="p-4 mb-4">
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type</label><select value={f.kind} onChange={(e) => set('kind', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"><option value="creator">Créateur</option><option value="brand">Marque</option></select></div>
        <Input label="Nom" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Input label={f.kind === 'creator' ? 'Pseudo' : 'Secteur'} value={f.kind === 'creator' ? f.handle : f.niche} onChange={(e) => set(f.kind === 'creator' ? 'handle' : 'niche', e.target.value)} />
        <Input label="Profil ou page (URL)" value={f.url} onChange={(e) => set('url', e.target.value)} />
        <Input label="Site" value={f.website} onChange={(e) => set('website', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <div className="sm:col-span-3"><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Bio, description, ce que vend la marque… (sert à la qualification IA)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" /></div>
      </div>
      <div className="flex items-center gap-2 flex-wrap"><Button size="sm" onClick={() => add.mutate()} isLoading={add.isPending} disabled={missing.length > 0}>Ajouter et qualifier</Button><Button size="sm" variant="outline" onClick={onDone}>Annuler</Button><MissingHint items={missing} /></div>
    </Card>
  );
}

export default function AcquisitionTool() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'creator' | 'brand'>('creator');
  const [status, setStatus] = useState('qualified');
  const [hasEmail, setHasEmail] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { data: ov } = useQuery({ queryKey: ['acquisition-overview'], queryFn: async () => (await api.get('/admin/acquisition')).data, refetchInterval: (query) => (query.state.data?.progress?.running ? 4000 : false) });
  const { data, isLoading } = useQuery({ queryKey: ['acquisition-leads', kind, status, hasEmail, q], queryFn: async () => (await api.get('/admin/acquisition/leads', { params: { kind, status: status || undefined, hasEmail: hasEmail || undefined, q: q || undefined, limit: 200 } })).data });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-overview'] }); };
  const patch = useMutation({ mutationFn: async ({ id, ...body }: any) => (await api.patch(`/admin/acquisition/leads/${id}`, body)).data, onSuccess: () => refresh(), onError: (e: any) => toast.error(getErrorMessage(e)) });
  const bulk = useMutation({ mutationFn: async (body: any) => (await api.patch('/admin/acquisition/leads/bulk', body)).data, onSuccess: (d) => { toast.success(d.message); setSelected([]); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const requalify = useMutation({ mutationFn: async (id: string) => (await api.post(`/admin/acquisition/leads/${id}/requalify`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/admin/acquisition/leads/${id}`)).data, onSuccess: () => refresh(), onError: (e: any) => toast.error(getErrorMessage(e)) });
  const run = useMutation({ mutationFn: async (kinds: string[]) => (await api.post('/admin/acquisition/run', { kinds })).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const importDir = useMutation({ mutationFn: async (ids?: string[]) => (await api.post('/admin/acquisition/import-directory', ids ? { ids } : {})).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); setSelected([]); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Message copié'); } catch { toast.error('Copie impossible'); } };
  const exportCsv = async (markContacted: boolean) => {
    try {
      const r = await api.get('/admin/acquisition/export.csv', { params: { kind, status: status || 'qualified', markContacted: markContacted ? '1' : '0' }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `prospects-${kind}.csv`; a.click(); URL.revokeObjectURL(url);
      if (markContacted) refresh();
    } catch (e: any) { toast.error(getErrorMessage(e)); }
  };
  const s = ov?.settings; const counts = ov?.counts?.[kind] || {};
  const total = (st: string) => counts[st]?.n || 0;
  const daysLeft = ov?.meta?.expiresAt ? Math.ceil((new Date(ov.meta.expiresAt).getTime() - Date.now()) / 86400000) : null;
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Radar className="w-5 h-5 text-primary-500" /> Prospection</h2>
            <p className="text-sm text-neutral-600 mt-1">Chaque nuit, les agents cherchent des créateurs (YouTube) et des marques (bibliothèque publicitaire Meta), trouvent leur email et les qualifient avec l&apos;IA. Vous exportez les qualifiés vers votre outil de mailing, ou copiez le message pour les contacter à la main sur les réseaux. Réglages dans l&apos;onglet Réglages, groupe « Prospection ».</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => run.mutate(['creator'])} isLoading={run.isPending} disabled={!!ov?.progress?.running || !s?.youtube}><Play className="w-4 h-4 mr-1" /> Chercher des créateurs</Button>
            <Button size="sm" variant="outline" onClick={() => run.mutate(['brand'])} isLoading={run.isPending} disabled={!!ov?.progress?.running || !s?.meta}><Play className="w-4 h-4 mr-1" /> Chercher des marques</Button>
          </div>
        </div>
        {s && (
          <div className="text-xs text-neutral-600 flex gap-3 flex-wrap">
            <span className={s.enabled ? 'text-green-700' : 'text-orange-700'}>Recherche nocturne : {s.enabled ? 'activée' : 'désactivée'}</span>
            <span className={s.youtube ? 'text-green-700' : 'text-red-700'}>YouTube : {s.youtube ? 'clé présente' : 'clé absente'}</span>
            <span className={ov?.meta?.valid ? 'text-green-700' : 'text-orange-700'}>Meta : {!ov?.meta?.configured ? 'jeton absent' : ov.meta.valid === false ? 'jeton invalide' : daysLeft !== null ? `jeton valide, expire dans ${daysLeft} j${daysLeft <= 10 ? ' : à renouveler dans les réglages' : ''}` : 'jeton présent'}</span>
            <span className={s.ai ? 'text-green-700' : 'text-red-700'}>IA : {s.ai ? 'configurée' : 'non configurée (pas de qualification)'}</span>
            <span>{s.creatorKeywords} lignes de mots-clés créateurs · {s.brandKeywords} marques · {s.dailyLimit} nouveaux par nuit max</span>
          </div>
        )}
        {ov?.progress?.running && <div className="mt-3 text-sm px-3 py-2 rounded-lg bg-primary-50 text-primary-800">Recherche en cours ({ov.progress.step === 'sourcing' ? 'sources' : 'qualification IA'}) : {ov.progress.found} trouvés, {ov.progress.created} nouveaux, {ov.progress.qualified} qualifiés…</div>}
        {ov?.runs?.length ? (
          <details className="mt-3 text-xs text-neutral-600"><summary className="cursor-pointer">Dernières exécutions ({ov.runs.length})</summary>
            <ul className="mt-2 space-y-1">{ov.runs.map((r: any) => <li key={r.runId}><span className="font-mono">{r.runId}</span> · {formatDateTime(r.startedAt)} · {r.trigger} · YouTube {r.sources?.youtube?.searched || 0} recherches, {r.sources?.youtube?.new || 0} nouveaux ({r.sources?.youtube?.withEmail || 0} avec email) · Meta {r.sources?.meta?.searched || 0} recherches, {r.sources?.meta?.new || 0} nouveaux ({r.sources?.meta?.withEmail || 0} avec email) · {r.qualified} qualifiés{r.issues?.length ? ` · ${r.issues.length} erreur(s) : ${r.issues[0]}` : ''}</li>)}</ul>
          </details>
        ) : null}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {(['creator', 'brand'] as const).map((k) => <button key={k} type="button" onClick={() => { setKind(k); setSelected([]); }} className={`px-3 py-1.5 rounded-lg text-sm ${kind === k ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{k === 'creator' ? 'Créateurs' : 'Marques'} ({Object.values(ov?.counts?.[k] || {}).reduce((a: number, c: any) => a + c.n, 0)})</button>)}
          <span className="text-neutral-300">|</span>
          {['qualified', 'to_contact', 'contacted', 'replied', 'registered', 'new', 'rejected', 'excluded'].map((st) => <button key={st} type="button" onClick={() => { setStatus(status === st ? '' : st); setSelected([]); }} className={`px-2.5 py-1 rounded-full text-xs ${status === st ? 'bg-neutral-900 text-white' : STATUS[st].cls}`}>{STATUS[st].label} {total(st)}</button>)}
          <select value={hasEmail} onChange={(e) => setHasEmail(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1 text-xs"><option value="">Email : tous</option><option value="1">Avec email</option><option value="0">Sans email</option></select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" className="border border-neutral-300 rounded-lg px-2 py-1 text-xs w-40" />
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-4 text-xs">
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}><UserPlus className="w-4 h-4 mr-1" /> Ajouter à la main</Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv(false)}><Download className="w-4 h-4 mr-1" /> Export CSV (avec email)</Button>
          <Button size="sm" variant="outline" onClick={() => { if (confirm('Exporter et marquer ces prospects « contactés » ?')) exportCsv(true); }}><Download className="w-4 h-4 mr-1" /> Export + marquer contactés</Button>
          {kind === 'creator' && <Button size="sm" variant="outline" onClick={() => { if (confirm(selected.length ? `Ajouter ${selected.length} créateur(s) à l'annuaire des créateurs référencés ?` : 'Ajouter tous les créateurs qualifiés à l\'annuaire des créateurs référencés ?')) importDir.mutate(selected.length ? selected : undefined); }} isLoading={importDir.isPending}>Vers l&apos;annuaire {selected.length ? `(${selected.length})` : '(tous les qualifiés)'}</Button>}
          {selected.length > 0 && <>
            <span className="text-neutral-500">{selected.length} sélectionné(s) :</span>
            <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids: selected, status: 'to_contact' })}>À contacter</Button>
            <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids: selected, status: 'contacted', contactedVia: 'email' })}>Contactés</Button>
            <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids: selected, status: 'rejected' })}>Hors cible</Button>
          </>}
        </div>
        {adding && <ManualForm onDone={() => { setAdding(false); refresh(); }} />}
        {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : !data?.leads?.length ? (
          <p className="text-sm text-neutral-500">Aucun prospect dans cette catégorie. {status === 'qualified' && total('new') > 0 ? `${total('new')} en attente de qualification (IA).` : ''} Lancez une recherche ou activez la recherche nocturne dans les réglages.</p>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-neutral-500 flex items-center gap-2"><input type="checkbox" checked={selected.length === data.leads.length} onChange={(e) => setSelected(e.target.checked ? data.leads.map((l: any) => l._id) : [])} /> Tout sélectionner ({data.total} au total)</label>
            {data.leads.map((l: any) => {
              const st = STATUS[l.status] || STATUS.new;
              return (
                <div key={l._id} className="border border-neutral-200 rounded-lg p-3 text-sm" data-testid="lead">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1" checked={selected.includes(l._id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l._id] : selected.filter(x => x !== l._id))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-900">{l.name}</span>
                        {l.handle && <span className="text-neutral-500">{l.handle}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>
                        {l.score != null && <span className={`px-2 py-0.5 rounded-full text-xs ${l.score >= 70 ? 'bg-green-100 text-green-800' : l.score >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-neutral-100 text-neutral-600'}`}>score {l.score}</span>}
                        <span className="text-xs text-neutral-500">{SOURCE[l.source] || l.source} · {l.niche || '?'}{l.stats?.subscribers ? ` · ${l.stats.subscribers.toLocaleString('fr-FR')} abonnés` : ''}{l.stats?.ads ? ` · ${l.stats.ads} annonce(s)` : ''}{l.keyword ? ` · « ${l.keyword} »` : ''}</span>
                      </div>
                      <div className="text-xs text-neutral-600 mt-1">{l.email ? <span className="text-green-700">{l.email} <span className="text-neutral-400">({l.emailSource})</span></span> : <span className="text-orange-700">pas d&apos;email : contact sur le réseau</span>}{l.aiSummary ? ` · ${l.aiSummary}` : ''}{l.signals?.length ? ` · ${l.signals.join(' · ')}` : ''}{l.error ? <span className="text-red-600"> · {l.error}</span> : ''}</div>
                      {l.message && <div className="text-xs text-neutral-700 mt-1 bg-neutral-50 rounded px-2 py-1">{l.message}</div>}
                      {l.notes && <div className="text-xs text-neutral-500 mt-1">Note : {l.notes}</div>}
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end shrink-0">
                      {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-neutral-500 hover:text-primary-600" title="Ouvrir le profil"><ExternalLink className="w-4 h-4" /></a>}
                      {l.message && <button type="button" onClick={() => copy(l.message)} className="p-1.5 text-neutral-500 hover:text-primary-600" title="Copier le message"><Copy className="w-4 h-4" /></button>}
                      <button type="button" onClick={() => requalify.mutate(l._id)} className="p-1.5 text-neutral-500 hover:text-primary-600" title="Requalifier avec l'IA"><RefreshCw className="w-4 h-4" /></button>
                      <select value={l.status} onChange={(e) => patch.mutate({ id: l._id, status: e.target.value, contactedVia: 'manuel' })} className="border border-neutral-300 rounded px-1 py-1 text-xs" aria-label="Statut">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                      <button type="button" onClick={() => { const n = prompt('Note', l.notes || ''); if (n !== null) patch.mutate({ id: l._id, notes: n }); }} className="px-1.5 text-xs text-neutral-500 hover:text-primary-600">Note</button>
                      {!l.email && <button type="button" onClick={() => { const e = prompt('Email trouvé à la main'); if (e) patch.mutate({ id: l._id, email: e }); }} className="px-1.5 text-xs text-neutral-500 hover:text-primary-600">Email</button>}
                      <button type="button" onClick={() => { if (confirm('Supprimer ce prospect ?')) remove.mutate(l._id); }} className="p-1.5 text-neutral-400 hover:text-red-600" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
