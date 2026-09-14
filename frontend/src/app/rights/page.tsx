'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/useAuth';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import MissingHint from '@/components/ui/MissingHint';
import { formatCurrency, formatDate } from '@/lib/utils';
import { RIGHTS_SUPPORTS, RIGHTS_DURATION } from '@/lib/labels';
import { ShieldCheck, Plus, Trash2, ExternalLink, RefreshCw, Pencil, Lock } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Droits en cours', cls: 'bg-green-100 text-green-800' },
  expiring: { label: 'Expire bientôt', cls: 'bg-orange-100 text-orange-800' },
  expired: { label: 'Droits expirés', cls: 'bg-red-100 text-red-700' },
  unlimited: { label: 'Droits illimités', cls: 'bg-neutral-100 text-neutral-700' },
};
const CONTRACT: Record<string, string> = { cession: 'Cession de droits', licence: 'Licence', gifting: 'Gifting', influence: 'Influence', other: 'Autre' };
const SOURCE: Record<string, string> = { needcreator: 'Mission NeedCreator', quote: 'Devis NeedCreator, payé en direct', external: 'Hors NeedCreator' };

function toInputDate(d?: string | null) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }

function ContentForm({ initial, onDone }: { initial?: any; onDone: () => void }) {
  const [f, setF] = useState<any>({
    title: initial?.title || '', kind: initial?.kind || 'video', url: initial?.url || '',
    clientName: initial?.client?.name || '', clientEmail: initial?.client?.email || '', clientPlatform: initial?.client?.platform || '',
    contractType: initial?.contractType || 'cession', price: initial?.price ?? '',
    startAt: toInputDate(initial?.rights?.startAt) || new Date().toISOString().slice(0, 10), endAt: toInputDate(initial?.rights?.endAt), unlimited: initial ? !initial?.rights?.endAt : false,
    supports: initial?.rights?.supports || ['social_organic'], territories: initial?.rights?.territories || 'France',
    exclusivity: !!initial?.rights?.exclusivity, exclusivityMonths: initial?.rights?.exclusivityMonths || '', exclusivityScope: initial?.rights?.exclusivityScope || '',
    docLabel: initial?.documents?.[0]?.label || '', docUrl: initial?.documents?.[0]?.url || '', notes: initial?.notes || '',
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggle = (v: string) => set('supports', f.supports.includes(v) ? f.supports.filter((x: string) => x !== v) : [...f.supports, v]);
  const missing = [!f.title.trim() && 'un titre', !f.clientName.trim() && 'le nom du client', !f.unlimited && !f.endAt && 'la date de fin des droits (ou cochez « illimités »)'].filter(Boolean) as string[];
  const body = () => ({ title: f.title, kind: f.kind, url: f.url, client: { name: f.clientName, email: f.clientEmail, platform: f.clientPlatform }, contractType: f.contractType, price: f.price, rights: { startAt: f.startAt || null, endAt: f.unlimited ? null : f.endAt || null, supports: f.supports, territories: f.territories, exclusivity: f.exclusivity, exclusivityMonths: f.exclusivity ? Number(f.exclusivityMonths) || null : null, exclusivityScope: f.exclusivityScope }, documents: f.docUrl ? [{ label: f.docLabel || 'Contrat', url: f.docUrl }] : [], notes: f.notes });
  const save = useMutation({
    mutationFn: async () => initial ? (await api.patch(`/creator-contents/${initial._id}`, body())).data : (await api.post('/creator-contents', body())).data,
    onSuccess: (d) => { toast.success(d.message); onDone(); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
  const locked = initial && initial.source !== 'external';
  return (
    <Card className="p-6 mb-6">
      <h2 className="font-semibold text-neutral-900 mb-1">{initial ? 'Modifier le contenu' : 'Ajouter un contenu vendu hors NeedCreator'}</h2>
      <p className="text-sm text-neutral-600 mb-4">{locked ? 'Ce contenu vient d\'une mission NeedCreator : les droits sont ceux du contrat. Vous pouvez seulement compléter les notes et le titre.' : 'Client direct, agence, autre plateforme : notez ce que vous avez cédé, jusqu\'à quand, et NeedCreator vous rappelle avant l\'échéance.'}</p>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2"><Input label="Titre du contenu" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex : Vidéo unboxing crème solaire" /></div>
        {!locked && (
          <>
            <Input label="Client (marque, agence)" value={f.clientName} onChange={(e) => set('clientName', e.target.value)} />
            <Input label="Email du client (pour le renouvellement)" type="email" value={f.clientEmail} onChange={(e) => set('clientEmail', e.target.value)} />
            <Input label="Via (direct, agence, autre plateforme…)" value={f.clientPlatform} onChange={(e) => set('clientPlatform', e.target.value)} />
            <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type de contrat</label><select value={f.contractType} onChange={(e) => set('contractType', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(CONTRACT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <Input label="Prix HT (€)" type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} />
            <Input label="Lien vers le contenu (optionnel)" value={f.url} onChange={(e) => set('url', e.target.value)} />
            <Input label="Début des droits" type="date" value={f.startAt} onChange={(e) => set('startAt', e.target.value)} />
            <div>
              <Input label="Fin des droits" type="date" value={f.endAt} onChange={(e) => set('endAt', e.target.value)} disabled={f.unlimited} />
              <label className="flex items-center gap-2 text-xs text-neutral-600 mt-1"><input type="checkbox" checked={f.unlimited} onChange={(e) => set('unlimited', e.target.checked)} /> Droits illimités dans le temps</label>
            </div>
            <Input label="Territoire" value={f.territories} onChange={(e) => set('territories', e.target.value)} />
            <div className="flex items-end gap-2"><label className="flex items-center gap-2 text-sm text-neutral-700 pb-2"><input type="checkbox" checked={f.exclusivity} onChange={(e) => set('exclusivity', e.target.checked)} /> Exclusivité</label>{f.exclusivity && <Input label="Mois" type="number" min={1} max={36} value={f.exclusivityMonths} onChange={(e) => set('exclusivityMonths', e.target.value)} />}</div>
            {f.exclusivity && <div className="sm:col-span-2"><Input label="Périmètre de l'exclusivité (secteur, concurrents)" value={f.exclusivityScope} onChange={(e) => set('exclusivityScope', e.target.value)} placeholder="Ex : cosmétiques solaires" /></div>}
            <div className="sm:col-span-2 flex flex-wrap gap-2">{Object.keys(RIGHTS_SUPPORTS).map((s) => <button key={s} type="button" onClick={() => toggle(s)} className={`px-3 py-1 rounded-full text-xs ${f.supports.includes(s) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{RIGHTS_SUPPORTS[s]}</button>)}</div>
            <Input label="Contrat : libellé" value={f.docLabel} onChange={(e) => set('docLabel', e.target.value)} placeholder="Contrat signé" />
            <Input label="Contrat : lien (Drive, Dropbox…)" value={f.docUrl} onChange={(e) => set('docUrl', e.target.value)} />
          </>
        )}
        <div className="sm:col-span-2"><textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={2000} placeholder="Notes (conditions particulières, contact…)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" /></div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={!locked && missing.length > 0}>{initial ? 'Enregistrer' : 'Ajouter au registre'}</Button>
        <Button variant="outline" onClick={onDone}>Annuler</Button>
        {!locked && <MissingHint items={missing} />}
      </div>
    </Card>
  );
}

export default function RightsPage() {
  const { ready } = useRequireAuth({ roles: ['creator'] });
  const router = useRouter();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['creator-contents'], queryFn: async () => (await api.get('/creator-contents')).data, enabled: ready });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['creator-contents'] });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/creator-contents/${id}`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const renew = useMutation({
    mutationFn: async ({ id, duration, price }: any) => (await api.post(`/creator-contents/${id}/renew`, { duration, price })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); refresh(); if (d.href) router.push(d.href); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  if (!ready) return <Spinner />;
  const s = data?.summary || {};
  const list = (data?.contents || []).filter((c: any) => !filter || c.status === filter || (filter === 'exclusivity' && c.exclusivityStatus === 'active'));
  const tiles: [string, number, string][] = [['Droits en cours', (s.active || 0) + (s.unlimited || 0), 'active'], ['Expirent sous 30 j', s.expiring || 0, 'expiring'], ['Expirés', s.expired || 0, 'expired'], ['Exclusivités actives', s.exclusivityActive || 0, 'exclusivity']];
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-1 flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-primary-500" /> Mes droits &amp; exclusivités</h1>
            <p className="text-neutral-600">Tout ce que vous avez cédé, sur NeedCreator ou ailleurs : durée, supports, exclusivité. Vous êtes prévenu 30 jours avant chaque échéance pour proposer un renouvellement, et le jour où une exclusivité se termine.</p>
          </div>
          <Button onClick={() => { setEditing(null); setAdding(true); }}><Plus className="w-4 h-4 mr-1" /> Ajouter un contenu externe</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {tiles.map(([label, n, key]) => (
            <button key={key} type="button" onClick={() => setFilter(filter === key ? '' : key)} className={`text-left p-4 rounded-lg border ${filter === key ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white'}`}>
              <div className="text-2xl font-bold text-neutral-900">{n}</div>
              <div className="text-xs text-neutral-600">{label}</div>
            </button>
          ))}
        </div>
        {(adding || editing) && <ContentForm initial={editing} onDone={() => { setAdding(false); setEditing(null); refresh(); }} />}
        {isLoading ? <Spinner /> : list.length ? (
          <div className="space-y-3">
            {list.map((c: any) => {
              const st = STATUS[c.status] || STATUS.active;
              return (
                <Card key={c._id} className="p-5" data-testid="creator-content">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-neutral-900">{c.title}</h3><span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}{c.daysLeft !== null && c.daysLeft >= 0 && c.status !== 'unlimited' ? ` · ${c.daysLeft} j` : ''}</span>{c.exclusivityStatus === 'active' && <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Exclusivité jusqu&apos;au {formatDate(c.rights.exclusivityEndAt)}</span>}{c.exclusivityStatus === 'ended' && <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-600">Exclusivité terminée</span>}</div>
                      <div className="text-sm text-neutral-600 mt-1">{c.client?.name || 'Client'}{c.client?.platform ? ` · ${c.client.platform}` : ''} · {SOURCE[c.source]} · {CONTRACT[c.contractType] || c.contractType}{c.price != null ? ` · ${formatCurrency(c.price)} HT` : ''}</div>
                      <div className="text-sm text-neutral-600">{c.rights?.startAt ? `Du ${formatDate(c.rights.startAt)} ` : ''}{c.rights?.endAt ? `au ${formatDate(c.rights.endAt)}` : 'sans limite de durée'} · {c.rights?.territories || 'France'}{c.rights?.supports?.length ? ` · ${c.rights.supports.map((x: string) => RIGHTS_SUPPORTS[x] || x).join(', ')}` : ''}{c.rights?.exclusivityScope ? ` · exclusivité : ${c.rights.exclusivityScope}` : ''}</div>
                      {c.notes && <div className="text-xs text-neutral-500 mt-1">{c.notes}</div>}
                      <div className="text-xs mt-1 flex gap-3 flex-wrap">
                        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Voir le contenu</a>}
                        {(c.documents || []).map((d: any, i: number) => <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> {d.label}</a>)}
                        {c.deliveryId && <Link href={`/deliveries/${c.deliveryId}`} className="text-primary-600 underline">Voir la mission</Link>}
                        {c.externalQuoteId && <Link href="/quotes" className="text-primary-600 underline">Voir le devis</Link>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {c.status !== 'unlimited' && (
                        c.source === 'needcreator' && c.deliveryId
                          ? <Link href={`/deliveries/${c.deliveryId}#contrat`}><Button size="sm"><RefreshCw className="w-4 h-4 mr-1" /> Proposer une prolongation</Button></Link>
                          : <Button size="sm" onClick={() => { const dur = prompt('Durée du renouvellement : 6m, 1y, 2y, 3y ou unlimited', '1y'); if (!dur) return; const price = prompt('Prix HT du renouvellement (€)', String(Math.round((c.price || 100) * 0.5))); if (!price) return; renew.mutate({ id: c._id, duration: dur, price: Number(price) }); }} isLoading={renew.isPending} title={`Crée un devis NeedCreator pré-rempli (${Object.values(RIGHTS_DURATION).join(' / ')}) à envoyer au client`}><RefreshCw className="w-4 h-4 mr-1" /> Proposer un renouvellement</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditing(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-4 h-4" /></Button>
                      {c.source === 'external' && <Button size="sm" variant="ghost" onClick={() => { if (confirm('Retirer ce contenu du registre ?')) remove.mutate(c._id); }}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : !adding && (
          <Card className="p-8 text-center text-neutral-600">{filter ? 'Aucun contenu dans cette catégorie.' : 'Votre registre est vide. Vos missions NeedCreator validées y apparaissent automatiquement ; ajoutez vos contenus vendus ailleurs pour être rappelé avant la fin des droits.'}</Card>
        )}
      </div>
    </div>
  );
}
