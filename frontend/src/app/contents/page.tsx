'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/useAuth';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { formatDate, formatCurrency } from '@/lib/utils';
import { RIGHTS_SUPPORTS } from '@/lib/labels';
import { FolderOpen, Plus, Upload, FileDown, Clock, AlertTriangle, CheckCircle, Infinity as InfinityIcon, ExternalLink, Trash2, Mail, RefreshCw } from 'lucide-react';

const CONTRACT_TYPES: Record<string, string> = { cession: 'Cession de droits', licence: 'Licence', gifting: 'Gifting (produit offert)', influence: 'Influence / sponsorisé', other: 'Autre' };
const USAGE_CHANNELS: Record<string, string> = { product_page: 'Fiche produit', paid_ads: 'Publicité payante', social: 'Réseaux sociaux', website: 'Site web', email: 'Emailing', marketplace: 'Marketplace', tv: 'TV / affichage', other: 'Autre' };
const KINDS: Record<string, string> = { video: 'Vidéo', image: 'Image', audio: 'Audio', other: 'Autre' };
const STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  active: { label: 'Actif', cls: 'bg-green-100 text-green-800', icon: CheckCircle },
  expiring: { label: 'Expire sous 30 j', cls: 'bg-orange-100 text-orange-800', icon: Clock },
  expired: { label: 'Expiré', cls: 'bg-red-100 text-red-800', icon: AlertTriangle },
  unlimited: { label: 'Illimité', cls: 'bg-neutral-100 text-neutral-700', icon: InfinityIcon },
};
const SUPPORT_KEYS = Object.keys(RIGHTS_SUPPORTS);
const toInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Formulaire d'un contenu extérieur (création ou édition) */
function ContentForm({ initial, onSubmit, onCancel, isLoading, locked }: { initial?: any; onSubmit: (data: any) => void; onCancel: () => void; isLoading?: boolean; locked?: boolean }) {
  const [f, setF] = useState<any>({
    title: initial?.title || '', kind: initial?.kind || 'video', url: initial?.url || '', product: initial?.product || '',
    creatorName: initial?.creator?.name || '', creatorHandle: initial?.creator?.handle || '', creatorEmail: initial?.creator?.email || '', creatorPlatform: initial?.creator?.platform || '',
    contractType: initial?.contractType || 'cession', startAt: toInput(initial?.rights?.startAt), endAt: toInput(initial?.rights?.endAt), unlimited: !!initial && !initial?.rights?.endAt,
    supports: initial?.rights?.supports || ['social_organic'], territories: initial?.rights?.territories || 'France', exclusivity: !!initial?.rights?.exclusivity,
    price: initial?.price ?? '', contractUrl: initial?.documents?.find((d: any) => /contrat|avenant/i.test(d.label))?.url || '', invoiceUrl: initial?.documents?.find((d: any) => /facture/i.test(d.label))?.url || '', notes: initial?.notes || '',
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const missing = [!f.title.trim() && 'un titre', !f.unlimited && !f.endAt && 'une date de fin des droits (ou « illimité »)'].filter(Boolean) as string[];
  const submit = () => onSubmit({
    title: f.title, kind: f.kind, url: f.url, product: f.product,
    creator: { name: f.creatorName, handle: f.creatorHandle, email: f.creatorEmail, platform: f.creatorPlatform },
    contractType: f.contractType,
    rights: { startAt: f.startAt || null, endAt: f.unlimited ? null : f.endAt || null, supports: f.supports, territories: f.territories, exclusivity: f.exclusivity },
    price: f.price === '' ? null : Number(f.price),
    documents: [f.contractUrl && { label: 'Contrat', url: f.contractUrl }, f.invoiceUrl && { label: 'Facture', url: f.invoiceUrl }].filter(Boolean),
    notes: f.notes,
  });
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Input label="Titre du contenu" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex : Vidéo unboxing sérum, créatrice Léa" disabled={locked} />
        <Input label="Produit, gamme ou campagne" value={f.product} onChange={(e) => set('product', e.target.value)} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type</label><select value={f.kind} onChange={(e) => set('kind', e.target.value)} disabled={locked} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="sm:col-span-2"><Input label="Lien du contenu (fichier, Drive, publication…)" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" disabled={locked} /></div>
      </div>
      {!locked && (
        <div className="grid sm:grid-cols-4 gap-3">
          <Input label="Créateur" value={f.creatorName} onChange={(e) => set('creatorName', e.target.value)} />
          <Input label="Pseudo" value={f.creatorHandle} onChange={(e) => set('creatorHandle', e.target.value)} placeholder="@…" />
          <Input label="Email (pour le relancer)" type="email" value={f.creatorEmail} onChange={(e) => set('creatorEmail', e.target.value)} />
          <Input label="Origine" value={f.creatorPlatform} onChange={(e) => set('creatorPlatform', e.target.value)} placeholder="Agence, plateforme, direct…" />
        </div>
      )}
      {!locked && (
        <div className="grid sm:grid-cols-4 gap-3">
          <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type de contrat</label><select value={f.contractType} onChange={(e) => set('contractType', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(CONTRACT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <Input label="Début des droits" type="date" value={f.startAt} onChange={(e) => set('startAt', e.target.value)} />
          <div>
            <Input label="Fin des droits" type="date" value={f.endAt} onChange={(e) => set('endAt', e.target.value)} disabled={f.unlimited} />
            <label className="flex items-center gap-2 text-xs text-neutral-600 mt-1"><input type="checkbox" checked={f.unlimited} onChange={(e) => set('unlimited', e.target.checked)} /> Droits illimités</label>
          </div>
          <Input label="Prix payé (€ HT)" type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} />
        </div>
      )}
      {!locked && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Supports autorisés</label>
          <div className="flex flex-wrap gap-2">
            {SUPPORT_KEYS.map((s) => (
              <button key={s} type="button" onClick={() => set('supports', f.supports.includes(s) ? f.supports.filter((x: string) => x !== s) : [...f.supports, s])} className={`px-3 py-1 rounded-full text-xs ${f.supports.includes(s) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{RIGHTS_SUPPORTS[s]}</button>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <Input label="Territoire" value={f.territories} onChange={(e) => set('territories', e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-neutral-700 mt-6"><input type="checkbox" checked={f.exclusivity} onChange={(e) => set('exclusivity', e.target.checked)} /> Exclusivité</label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <Input label="Contrat (lien)" value={f.contractUrl} onChange={(e) => set('contractUrl', e.target.value)} placeholder="https://…" />
            <Input label="Facture (lien)" value={f.invoiceUrl} onChange={(e) => set('invoiceUrl', e.target.value)} placeholder="https://…" />
          </div>
        </div>
      )}
      <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={2000} placeholder="Notes (optionnel)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
      {missing.length > 0 && <p className="text-xs text-neutral-500">Il manque : {missing.join(', ')}.</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} isLoading={isLoading} disabled={missing.length > 0}>Enregistrer</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

function ContentCard({ c, onChanged }: { c: any; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usage, setUsage] = useState({ channel: 'product_page', url: '', note: '' });
  const [renewMsg, setRenewMsg] = useState('');
  const [renewOpen, setRenewOpen] = useState(false);
  const st = STATUS[c.status] || STATUS.active;
  const Icon = st.icon;
  const update = useMutation({ mutationFn: async (data: any) => (await api.patch(`/contents/${c._id}`, data)).data, onSuccess: (d) => { toast.success(d.message); setEditing(false); onChanged(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/contents/${c._id}`)).data, onSuccess: (d) => { toast.success(d.message); onChanged(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const addUsage = useMutation({ mutationFn: async () => (await api.post(`/contents/${c._id}/usages`, usage)).data, onSuccess: () => { setUsage({ channel: 'product_page', url: '', note: '' }); setUsageOpen(false); onChanged(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const removeUsage = useMutation({ mutationFn: async (id: string) => (await api.delete(`/contents/${c._id}/usages/${id}`)).data, onSuccess: () => onChanged(), onError: (e: any) => toast.error(getErrorMessage(e)) });
  const renew = useMutation({ mutationFn: async () => (await api.post(`/contents/${c._id}/renew`, { message: renewMsg })).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); setRenewOpen(false); if (d.href) window.location.href = d.href; else onChanged(); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  return (
    <Card className={`p-5 ${c.status === 'expired' ? 'border-red-200' : c.status === 'expiring' ? 'border-orange-200' : ''}`} data-testid="content-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-neutral-900">{c.title}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${st.cls}`}><Icon className="w-3 h-3" /> {st.label}{c.daysLeft != null && c.status !== 'expired' ? ` · ${c.daysLeft} j` : ''}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700">{c.source === 'needcreator' ? 'NeedCreator' : c.creator?.platform || 'Extérieur'}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700">{KINDS[c.kind] || c.kind}</span>
          </div>
          <div className="text-sm text-neutral-600 mt-1">
            {c.creator?.name ? <>Créateur : <strong>{c.creator.name}</strong>{c.creator.handle ? ` (${c.creator.handle})` : ''} · </> : null}
            {CONTRACT_TYPES[c.contractType] || c.contractType}
            {c.price != null ? ` · ${formatCurrency(c.price)} HT` : ''}
            {c.product ? ` · ${c.product}` : ''}
          </div>
          <div className="text-sm text-neutral-600">
            Droits : {c.rights?.startAt ? `du ${formatDate(c.rights.startAt)} ` : ''}{c.rights?.endAt ? `jusqu'au ${formatDate(c.rights.endAt)}` : 'sans limite de durée'} · {(c.rights?.supports || []).map((s: string) => RIGHTS_SUPPORTS[s]?.split(' (')[0] || s).join(', ') || 'supports non précisés'} · {c.rights?.territories || 'France'}{c.rights?.exclusivity ? ' · exclusivité' : ''}
          </div>
          {(c.documents?.length > 0 || c.url) && (
            <div className="text-xs mt-1 flex gap-3 flex-wrap">
              {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Voir le contenu</a>}
              {c.documents?.map((d: any, i: number) => <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">{d.label}</a>)}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setUsageOpen(!usageOpen)}>Où c&apos;est utilisé</Button>
          {(c.status === 'expiring' || c.status === 'expired') && <Button size="sm" onClick={() => (c.source === 'needcreator' ? renew.mutate() : setRenewOpen(!renewOpen))} isLoading={renew.isPending}><RefreshCw className="w-4 h-4 mr-1" /> Renouveler</Button>}
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>Modifier</Button>
          {c.source === 'external' && <Button size="sm" variant="ghost" onClick={() => { if (confirm('Retirer ce contenu du registre ?')) remove.mutate(); }}><Trash2 className="w-4 h-4" /></Button>}
        </div>
      </div>
      {c.usages?.length > 0 && (
        <ul className="mt-3 text-sm text-neutral-700 space-y-1">
          {c.usages.map((u: any) => (
            <li key={u._id} className="flex items-center gap-2 flex-wrap"><span className="px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-xs">{USAGE_CHANNELS[u.channel] || u.channel}</span>{u.url && <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline truncate max-w-xs">{u.url}</a>}{u.note && <span className="text-neutral-500">{u.note}</span>}<button type="button" className="text-xs text-neutral-400 underline" onClick={() => removeUsage.mutate(u._id)}>retirer</button></li>
          ))}
        </ul>
      )}
      {usageOpen && (
        <div className="mt-3 border border-neutral-200 rounded-lg p-3 grid sm:grid-cols-[160px_1fr_1fr_auto] gap-2 items-end">
          <div><label className="block text-xs text-neutral-600 mb-1">Canal</label><select value={usage.channel} onChange={(e) => setUsage({ ...usage, channel: e.target.value })} className="w-full border border-neutral-300 rounded-lg px-2 py-2 text-sm">{Object.entries(USAGE_CHANNELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <Input label="Lien (optionnel)" value={usage.url} onChange={(e) => setUsage({ ...usage, url: e.target.value })} placeholder="https://…" />
          <Input label="Note" value={usage.note} onChange={(e) => setUsage({ ...usage, note: e.target.value })} />
          <Button size="sm" onClick={() => addUsage.mutate()} isLoading={addUsage.isPending}>Ajouter</Button>
        </div>
      )}
      {renewOpen && c.source === 'external' && (
        <div className="mt-3 border border-primary-200 bg-primary-50 rounded-lg p-3 space-y-2">
          <p className="text-sm text-neutral-700">Un email part au créateur{c.creator?.email ? ` (${c.creator.email})` : ''} avec votre demande de renouvellement ; il vous répond directement.</p>
          <textarea value={renewMsg} onChange={(e) => setRenewMsg(e.target.value)} rows={2} maxLength={1000} placeholder="Votre message (optionnel) : durée souhaitée, budget…" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
          <Button size="sm" onClick={() => renew.mutate()} isLoading={renew.isPending}><Mail className="w-4 h-4 mr-1" /> Envoyer la demande</Button>
          {c.renewal?.requestedAt && <p className="text-xs text-neutral-500">Dernière demande envoyée le {formatDate(c.renewal.requestedAt)}.</p>}
        </div>
      )}
      {editing && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {c.source === 'needcreator' && <p className="text-xs text-neutral-500 mb-2">Contenu issu d&apos;une mission NeedCreator : droits, prix et créateur viennent du contrat. Vous pouvez modifier le titre, le produit, les notes et les utilisations.</p>}
          <ContentForm initial={c} locked={c.source === 'needcreator'} isLoading={update.isPending} onSubmit={(d) => update.mutate(d)} onCancel={() => setEditing(false)} />
        </div>
      )}
    </Card>
  );
}

export default function ContentsPage() {
  const { user, ready } = useRequireAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['contents', status, q], queryFn: async () => (await api.get('/contents', { params: { status: status || undefined, q: q || undefined } })).data, enabled: ready && user?.role === 'brand' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['contents'] });
  const create = useMutation({ mutationFn: async (body: any) => (await api.post('/contents', body)).data, onSuccess: (d) => { toast.success(d.message); setAdding(false); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const importFile = useMutation({
    mutationFn: async (file: File) => { const fd = new FormData(); fd.append('file', file); return (await api.post('/contents/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data; },
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const exportCsv = async () => {
    const res = await api.get('/contents/export', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'contenus-et-droits.csv'; a.click();
  };
  const tiles = useMemo(() => data?.summary ? [
    ['Contenus suivis', data.summary.total, 'text-neutral-900', ''],
    ['Actifs', data.summary.active, 'text-green-700', 'active'],
    ['Expirent sous 30 jours', data.summary.expiring, 'text-orange-700', 'expiring'],
    ['Expirés', data.summary.expired, 'text-red-700', 'expired'],
    ['Illimités', data.summary.unlimited, 'text-neutral-700', 'unlimited'],
  ] : [], [data]);

  if (!ready) return <Spinner />;
  if (user?.role !== 'brand') return <div className="min-h-screen flex items-center justify-center"><Card className="p-8 text-center"><p className="text-neutral-600">Le registre « Contenus & droits » est réservé aux marques.</p><Link href="/dashboard" className="text-primary-600 underline text-sm">Retour</Link></Card></div>;

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 flex items-center gap-2"><FolderOpen className="w-7 h-7 text-primary-500" /> Contenus &amp; droits</h1>
            <p className="text-neutral-600 mt-1">Tous vos contenus créatifs et leurs droits au même endroit, missions NeedCreator et contenus achetés ailleurs : qui a créé quoi, pour combien, jusqu&apos;à quand, où c&apos;est utilisé, qui peut le renouveler.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => setAdding(!adding)}><Plus className="w-4 h-4 mr-1" /> Ajouter un contenu extérieur</Button>
            <label className="inline-flex items-center gap-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm cursor-pointer hover:bg-neutral-100"><Upload className="w-4 h-4" /> Importer Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile.mutate(f); e.currentTarget.value = ''; }} /></label>
            <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="w-4 h-4 mr-1" /> Exporter</Button>
          </div>
        </div>

        {adding && (
          <Card className="p-5 mb-6">
            <h2 className="font-semibold text-neutral-900 mb-3">Nouveau contenu extérieur (agence, autre plateforme, achat direct)</h2>
            <ContentForm isLoading={create.isPending} onSubmit={(d) => create.mutate(d)} onCancel={() => setAdding(false)} />
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {tiles.map(([label, n, cls, key]) => (
            <button key={String(label)} type="button" onClick={() => setStatus(String(key))} className={`text-left rounded-lg border p-3 bg-white ${status === key ? 'border-primary-400 ring-1 ring-primary-200' : 'border-neutral-200'}`}>
              <div className={`text-2xl font-bold ${cls}`}>{n as number}</div>
              <div className="text-xs text-neutral-600">{label as string}</div>
            </button>
          ))}
        </div>
        <div className="mb-4"><Input placeholder="Rechercher un titre, un créateur, un produit…" value={q} onChange={(e) => setQ(e.target.value)} /></div>

        {isLoading ? <Spinner /> : data?.contents?.length ? (
          <div className="space-y-3">{data.contents.map((c: any) => <ContentCard key={c._id} c={c} onChanged={refresh} />)}</div>
        ) : (
          <Card className="p-8 text-center text-neutral-600">
            {status || q ? 'Aucun contenu ne correspond.' : <>Aucun contenu pour l&apos;instant. Vos missions NeedCreator validées apparaîtront ici automatiquement. Ajoutez vos contenus achetés ailleurs, ou importez-les depuis un fichier Excel avec les colonnes : titre, créateur, email, type de contrat, début, fin, supports, territoire, prix, lien, produit.</>}
          </Card>
        )}
        <p className="text-xs text-neutral-500 mt-6">Rappels automatiques par email 30 jours puis 7 jours avant la fin des droits. Les contenus des missions NeedCreator se renouvellent par une prolongation payée depuis la mission ; pour les autres, un email part au créateur.</p>
      </div>
    </div>
  );
}
