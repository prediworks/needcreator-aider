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
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { formatCurrency, formatDate } from '@/lib/utils';
import { VIDEO_TYPES, PLATFORMS, RIGHTS_DURATION, RIGHTS_SUPPORTS } from '@/lib/labels';
import { FileSignature, Plus, Send, Copy, ExternalLink, Trash2, CheckCircle, Link2 } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-neutral-100 text-neutral-700' },
  sent: { label: 'Envoyé au client', cls: 'bg-blue-100 text-blue-800' },
  accepted_needcreator: { label: 'Accepté · payé via NeedCreator', cls: 'bg-green-100 text-green-800' },
  accepted_direct: { label: 'Accepté · payé en direct', cls: 'bg-green-50 text-green-700' },
  declined: { label: 'Décliné', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expiré', cls: 'bg-neutral-100 text-neutral-500' },
};

function QuoteCreateForm({ onDone }: { onDone: () => void }) {
  const cfg = usePublicConfig();
  const [f, setF] = useState<any>({ companyName: '', contactName: '', email: '', siret: '', address: '', title: '', description: '', videoType: 'testimonial', deliverables: '1', duration: '30', platforms: ['tiktok', 'instagram'], price: '', estimatedDeliveryDays: '7', revisions: '1', duration_rights: '1y', supports: ['social_organic'], territories: 'France', exclusivity: false, exclusivityMonths: '', terms: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggle = (k: string, v: string) => set(k, f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v]);
  const price = parseFloat(f.price) || 0;
  const missing = [!f.companyName.trim() && 'le nom du client', !f.title.trim() && 'un titre de mission', price < cfg.minQuotePrice && `un prix d'au moins ${cfg.minQuotePrice} € HT`].filter(Boolean) as string[];
  const create = useMutation({
    mutationFn: async () => (await api.post('/external-quotes', { client: { companyName: f.companyName, contactName: f.contactName, email: f.email, siret: f.siret, address: f.address }, title: f.title, description: f.description, videoType: f.videoType, deliverables: Number(f.deliverables), duration: Number(f.duration), platforms: f.platforms, price, estimatedDeliveryDays: Number(f.estimatedDeliveryDays), revisions: Number(f.revisions), rights: { duration: f.duration_rights, supports: f.supports, territories: f.territories, exclusivity: f.exclusivity, exclusivityMonths: f.exclusivityMonths }, terms: f.terms })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 6000 }); onDone(); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  return (
    <Card className="p-6 mb-6">
      <h2 className="font-semibold text-neutral-900 mb-1">Nouveau devis pour un client hors NeedCreator</h2>
      <p className="text-sm text-neutral-600 mb-4">Le devis et un projet de contrat de cession de droits sont générés en PDF. Vous les envoyez au client avec un lien : il accepte et paie via NeedCreator, montant bloqué puis versé après validation, ou vous marquez le devis « payé en direct ».</p>
      <h3 className="text-sm font-semibold text-neutral-800 mb-2">1. Le client</h3>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <Input label="Entreprise" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
        <Input label="Contact (prénom, nom)" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
        <Input label="Email du contact" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="Pour envoyer le devis" />
        <Input label="SIRET (optionnel)" value={f.siret} onChange={(e) => set('siret', e.target.value)} />
        <div className="sm:col-span-2"><Input label="Adresse (optionnel, figure sur le devis)" value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
      </div>
      <h3 className="text-sm font-semibold text-neutral-800 mb-2">2. La mission</h3>
      <div className="grid sm:grid-cols-2 gap-3 mb-2">
        <div className="sm:col-span-2"><Input label="Titre" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex : 2 vidéos témoignage pour le lancement du sérum" /></div>
        <div className="sm:col-span-2"><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={3000} placeholder="Ce qui a été convenu avec le client : produit, angle, contraintes…" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" /></div>
        <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type de vidéo</label><select value={f.videoType} onChange={(e) => set('videoType', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(VIDEO_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><Input label="Nombre de vidéos" type="number" min={1} max={20} value={f.deliverables} onChange={(e) => set('deliverables', e.target.value)} /><Input label="Durée (s)" type="number" min={5} value={f.duration} onChange={(e) => set('duration', e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">{Object.keys(PLATFORMS).map((p) => <button key={p} type="button" onClick={() => toggle('platforms', p)} className={`px-3 py-1 rounded-full text-xs ${f.platforms.includes(p) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{PLATFORMS[p]}</button>)}</div>
      <h3 className="text-sm font-semibold text-neutral-800 mb-2">3. Le devis</h3>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <Input label="Prix HT (€)" type="number" min={cfg.minQuotePrice} value={f.price} onChange={(e) => set('price', e.target.value)} />
        <Input label="Délai (jours)" type="number" min={1} value={f.estimatedDeliveryDays} onChange={(e) => set('estimatedDeliveryDays', e.target.value)} />
        <Input label="Révisions incluses" type="number" min={0} max={10} value={f.revisions} onChange={(e) => set('revisions', e.target.value)} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mb-2">
        <div><label className="block text-sm font-medium text-neutral-700 mb-1">Durée des droits</label><select value={f.duration_rights} onChange={(e) => set('duration_rights', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(RIGHTS_DURATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <Input label="Territoire" value={f.territories} onChange={(e) => set('territories', e.target.value)} />
        <div className="flex items-end gap-2"><label className="flex items-center gap-2 text-sm text-neutral-700 pb-2"><input type="checkbox" checked={f.exclusivity} onChange={(e) => set('exclusivity', e.target.checked)} /> Exclusivité</label>{f.exclusivity && <Input label="Mois" type="number" min={1} max={36} value={f.exclusivityMonths} onChange={(e) => set('exclusivityMonths', e.target.value)} />}</div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">{Object.keys(RIGHTS_SUPPORTS).map((s) => <button key={s} type="button" onClick={() => toggle('supports', s)} className={`px-3 py-1 rounded-full text-xs ${f.supports.includes(s) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{RIGHTS_SUPPORTS[s]}</button>)}</div>
      <textarea value={f.terms} onChange={(e) => set('terms', e.target.value)} rows={2} maxLength={2000} placeholder="Conditions particulières (produit à fournir, acompte, crédits…)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm mb-3" />
      <div className="flex gap-2 items-center flex-wrap">
        <Button onClick={() => create.mutate()} isLoading={create.isPending} disabled={missing.length > 0}><FileSignature className="w-4 h-4 mr-1" /> Générer le devis et le contrat</Button>
        <Button variant="outline" onClick={onDone}>Annuler</Button>
        <MissingHint items={missing} />
      </div>
    </Card>
  );
}

export default function QuotesPage() {
  const { user, ready } = useRequireAuth({ roles: ['creator'] });
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['external-quotes'], queryFn: async () => (await api.get('/external-quotes')).data, enabled: ready });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['external-quotes'] });
  const send = useMutation({ mutationFn: async ({ id, email, message }: any) => (await api.post(`/external-quotes/${id}/send`, { email, message })).data, onSuccess: (d) => { toast.success(d.message, { duration: 6000 }); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const direct = useMutation({ mutationFn: async (id: string) => (await api.post(`/external-quotes/${id}/direct`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/external-quotes/${id}`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Lien copié'); } catch { toast.error('Copie impossible'); } };
  if (!ready) return <Spinner />;
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-1 flex items-center gap-2"><FileSignature className="w-7 h-7 text-primary-500" /> Mes devis clients</h1>
            <p className="text-neutral-600">Pour vos clients hors NeedCreator : devis et contrat de cession en un clic, paiement sécurisé si le client le souhaite. Aucune commission quand il paie en direct.</p>
          </div>
          <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" /> Nouveau devis</Button>
        </div>
        {!(user as any)?.hasLegalInfo && <Card className="p-4 mb-6 bg-orange-50 border-orange-200 text-sm text-orange-900">Renseignez d&apos;abord vos <Link href="/profile#legal" className="underline">informations administratives</Link> : elles figurent sur le devis et le contrat.</Card>}
        {adding && <QuoteCreateForm onDone={() => { setAdding(false); refresh(); }} />}
        {isLoading ? <Spinner /> : data?.quotes?.length ? (
          <div className="space-y-3">
            {data.quotes.map((q: any) => {
              const st = STATUS[q.status] || STATUS.draft;
              return (
                <Card key={q._id} className="p-5" data-testid="external-quote">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-neutral-900">{q.mission.title}</h3><span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span></div>
                      <div className="text-sm text-neutral-600 mt-1">{q.client.companyName}{q.client.contactName ? ` · ${q.client.contactName}` : ''}{q.client.email ? ` · ${q.client.email}` : ''} · devis {q.pdf?.number}</div>
                      <div className="text-sm text-neutral-600">{formatCurrency(q.quote.price)} HT{q.quote.vatRate ? ` (+ TVA ${q.quote.vatRate} %)` : ''} · {q.mission.deliverables} vidéo{q.mission.deliverables > 1 ? 's' : ''} · {q.quote.estimatedDeliveryDays} j · {q.quote.revisions} révision(s) · droits {RIGHTS_DURATION[q.quote.rights?.duration] || '1 an'}{q.quote.rights?.exclusivity ? ` · exclusivité ${q.quote.rights.exclusivityMonths || ''} mois` : ''} · valable jusqu&apos;au {formatDate(q.quote.validUntil)}</div>
                      <div className="text-xs mt-1 flex gap-3 flex-wrap">
                        {q.pdf?.quoteUrl && <a href={q.pdf.quoteUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Devis PDF</a>}
                        {q.pdf?.contractUrl && <a href={q.pdf.contractUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Projet de contrat PDF</a>}
                        <button type="button" onClick={() => copy(q.link)} className="text-primary-600 underline inline-flex items-center gap-1"><Link2 className="w-3 h-3" /> Copier le lien client</button>
                        {q.deliveryId && <Link href={`/deliveries/${q.deliveryId}`} className="text-primary-600 underline inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Voir la mission</Link>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {['draft', 'sent'].includes(q.status) && (
                        <>
                          <Button size="sm" onClick={() => { const email = prompt('Envoyer le devis à quelle adresse ?', q.client.email || ''); if (!email) return; const message = prompt('Un mot pour le client (optionnel) :') || ''; send.mutate({ id: q._id, email, message }); }} isLoading={send.isPending}><Send className="w-4 h-4 mr-1" /> {q.status === 'sent' ? 'Renvoyer' : 'Envoyer au client'}</Button>
                          <Button size="sm" variant="outline" onClick={() => { if (confirm('Le client a accepté et vous paie en direct, hors NeedCreator ? Aucune commission, pas de facture par mandat : vous facturez vous-même.')) direct.mutate(q._id); }} isLoading={direct.isPending}>Payé en direct</Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm('Supprimer ce devis ?')) remove.mutate(q._id); }}><Trash2 className="w-4 h-4" /></Button>
                        </>
                      )}
                      {['declined', 'expired', 'accepted_direct'].includes(q.status) && <Button size="sm" variant="ghost" onClick={() => { if (confirm('Supprimer ce devis ?')) remove.mutate(q._id); }}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : !adding && (
          <Card className="p-8 text-center text-neutral-600">Aucun devis pour l&apos;instant. Un client vous contacte en dehors de NeedCreator ? Faites-lui un devis ici : contrat de cession inclus, paiement sécurisé s&apos;il le souhaite, et la mission entre dans votre suivi.</Card>
        )}
        <p className="text-xs text-neutral-500 mt-6">Client qui paie via NeedCreator : mission classique (montant bloqué, contrat, factures par mandat, virement à la validation), commission selon le réglage « missions extérieures ». Client qui paie en direct : outils gratuits, vous facturez vous-même.</p>
      </div>
    </div>
  );
}
