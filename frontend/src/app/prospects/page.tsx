'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/useAuth';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import MissingHint from '@/components/ui/MissingHint';
import { formatDate } from '@/lib/utils';
import { Target, Plus, Trash2, FileSignature, CalendarClock, MessageSquare, Pencil } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  to_contact: { label: 'À contacter', cls: 'bg-neutral-100 text-neutral-700' },
  contacted: { label: 'Contactée', cls: 'bg-blue-100 text-blue-800' },
  replied: { label: 'A répondu', cls: 'bg-indigo-100 text-indigo-800' },
  quote_sent: { label: 'Devis envoyé', cls: 'bg-orange-100 text-orange-800' },
  won: { label: 'Gagnée', cls: 'bg-green-100 text-green-800' },
  lost: { label: 'Perdue', cls: 'bg-red-50 text-red-700' },
};
const ORDER = ['to_contact', 'contacted', 'replied', 'quote_sent', 'won', 'lost'];
const toInputDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function ProspectForm({ initial, onDone }: { initial?: any; onDone: () => void }) {
  const [f, setF] = useState<any>({ company: initial?.company || '', contactName: initial?.contactName || '', email: initial?.email || '', phone: initial?.phone || '', website: initial?.website || '', source: initial?.source || '', status: initial?.status || 'to_contact', nextFollowUpAt: toInputDate(initial?.nextFollowUpAt), note: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const missing = [!f.company.trim() && 'le nom de la marque'].filter(Boolean) as string[];
  const save = useMutation({
    mutationFn: async () => initial ? (await api.patch(`/prospects/${initial._id}`, f)).data : (await api.post('/prospects', f)).data,
    onSuccess: (d) => { toast.success(d.message); onDone(); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
  return (
    <Card className="p-6 mb-6">
      <h2 className="font-semibold text-neutral-900 mb-3">{initial ? `Modifier : ${initial.company}` : 'Nouvelle marque à prospecter'}</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <Input label="Marque" value={f.company} onChange={(e) => set('company', e.target.value)} />
        <Input label="Contact" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Téléphone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="Site ou compte" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://… ou @compte" />
        <Input label="Source (Instagram, salon, bouche-à-oreille…)" value={f.source} onChange={(e) => set('source', e.target.value)} />
        <div><label className="block text-sm font-medium text-neutral-700 mb-1">Statut</label><select value={f.status} onChange={(e) => set('status', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select></div>
        <Input label="Prochaine relance" type="date" value={f.nextFollowUpAt} onChange={(e) => set('nextFollowUpAt', e.target.value)} />
        <div className="sm:col-span-2"><textarea value={f.note} onChange={(e) => set('note', e.target.value)} rows={2} maxLength={2000} placeholder={initial ? 'Ajouter une note (ce qui s\'est dit, prochaine étape…)' : 'Note (contexte, produit, ce qui a été dit…)'} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" /></div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={missing.length > 0}>{initial ? 'Enregistrer' : 'Ajouter'}</Button>
        <Button variant="outline" onClick={onDone}>Annuler</Button>
        <MissingHint items={missing} />
      </div>
    </Card>
  );
}

export default function ProspectsPage() {
  const { ready } = useRequireAuth({ roles: ['creator'] });
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['prospects'], queryFn: async () => (await api.get('/prospects')).data, enabled: ready });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['prospects'] });
  const patch = useMutation({ mutationFn: async ({ id, ...body }: any) => (await api.patch(`/prospects/${id}`, body)).data, onSuccess: () => refresh(), onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/prospects/${id}`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  if (!ready) return <Spinner />;
  const s = data?.summary || {};
  const now = Date.now();
  const list = (data?.prospects || []).filter((p: any) => !filter || p.status === filter || (filter === 'due' && p.nextFollowUpAt && new Date(p.nextFollowUpAt).getTime() <= now && !['won', 'lost'].includes(p.status)));
  const tiles: [string, number, string][] = [['À relancer aujourd\'hui', s.dueToday || 0, 'due'], ['En cours', (s.to_contact || 0) + (s.contacted || 0) + (s.replied || 0), 'to_contact'], ['Devis envoyés', s.quote_sent || 0, 'quote_sent'], ['Gagnées', s.won || 0, 'won']];
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-1 flex items-center gap-2"><Target className="w-7 h-7 text-primary-500" /> Suivi de prospection</h1>
            <p className="text-neutral-600">Les marques que vous démarchez vous-même : statut, notes, relance à date (vous êtes prévenu le jour même). Un devis et un contrat se génèrent en un clic depuis chaque fiche.</p>
          </div>
          <Button onClick={() => { setEditing(null); setAdding(true); }}><Plus className="w-4 h-4 mr-1" /> Ajouter une marque</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {tiles.map(([label, n, key]) => (
            <button key={key} type="button" onClick={() => setFilter(filter === key ? '' : key)} className={`text-left p-4 rounded-lg border ${filter === key ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white'}`}>
              <div className="text-2xl font-bold text-neutral-900">{n}</div>
              <div className="text-xs text-neutral-600">{label}</div>
            </button>
          ))}
        </div>
        {(adding || editing) && <ProspectForm initial={editing} onDone={() => { setAdding(false); setEditing(null); refresh(); }} />}
        {isLoading ? <Spinner /> : list.length ? (
          <div className="space-y-3">
            {list.map((p: any) => {
              const st = STATUS[p.status] || STATUS.to_contact;
              const due = p.nextFollowUpAt && new Date(p.nextFollowUpAt).getTime() <= now && !['won', 'lost'].includes(p.status);
              return (
                <Card key={p._id} className="p-5" data-testid="prospect">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-neutral-900">{p.company}</h3><span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>{due && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" /> À relancer</span>}</div>
                      <div className="text-sm text-neutral-600 mt-1">{[p.contactName, p.email, p.phone, p.website, p.source && `via ${p.source}`].filter(Boolean).join(' · ')}</div>
                      <div className="text-xs text-neutral-500 mt-1">{p.lastContactAt ? `Dernier contact le ${formatDate(p.lastContactAt)}` : 'Pas encore contactée'}{p.nextFollowUpAt ? ` · relance prévue le ${formatDate(p.nextFollowUpAt)}` : ''}</div>
                      {p.notes?.length ? <ul className="mt-2 space-y-1">{p.notes.slice(-3).reverse().map((n: any, i: number) => <li key={i} className="text-xs text-neutral-600 flex gap-1"><MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-neutral-400" /><span><span className="text-neutral-400">{formatDate(n.at)} :</span> {n.text}</span></li>)}</ul> : null}
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <select value={p.status} onChange={(e) => patch.mutate({ id: p._id, status: e.target.value })} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" aria-label="Changer le statut">{ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select>
                      {p.externalQuoteId ? <Link href="/quotes"><Button size="sm" variant="outline"><FileSignature className="w-4 h-4 mr-1" /> Voir le devis</Button></Link> : <Link href={`/quotes?prospect=${p._id}&company=${encodeURIComponent(p.company)}&contact=${encodeURIComponent(p.contactName || '')}&email=${encodeURIComponent(p.email || '')}`}><Button size="sm"><FileSignature className="w-4 h-4 mr-1" /> Faire un devis</Button></Link>}
                      <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditing(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Retirer ${p.company} du suivi ?`)) remove.mutate(p._id); }}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : !adding && (
          <Card className="p-8 text-center text-neutral-600">{filter ? 'Aucune marque dans cette catégorie.' : 'Aucune marque suivie pour l\'instant. Ajoutez celles que vous contactez vous-même : vous saurez qui relancer et quand, et le devis part en un clic.'}</Card>
        )}
      </div>
    </div>
  );
}
