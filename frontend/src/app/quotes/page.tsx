'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
import QuoteCreateForm, { readQuoteDraft, clearQuoteDraft } from '@/components/QuoteCreateForm';
import { RIGHTS_DURATION } from '@/lib/labels';
import { FileSignature, Plus, Send, Copy, ExternalLink, Trash2, CheckCircle, Link2, Pencil } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Brouillon', cls: 'bg-neutral-100 text-neutral-700' },
  sent: { label: 'Envoyé au client', cls: 'bg-blue-100 text-blue-800' },
  accepted_needcreator: { label: 'Accepté · payé via NeedCreator', cls: 'bg-green-100 text-green-800' },
  accepted_direct: { label: 'Accepté · payé en direct', cls: 'bg-green-50 text-green-700' },
  declined: { label: 'Décliné', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expiré', cls: 'bg-neutral-100 text-neutral-500' },
};

function QuotesPageInner() {
  const { user, ready } = useRequireAuth({ roles: ['creator'] });
  const cfg = usePublicConfig();
  const queryClient = useQueryClient();
  const sp = useSearchParams();
  const prefill = sp.get('prospect') ? { prospectId: sp.get('prospect') || undefined, companyName: sp.get('company') || '', contactName: sp.get('contact') || '', email: sp.get('email') || '' } : undefined;
  const [adding, setAdding] = useState(!!prefill);
  const [editing, setEditing] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  // Devis préparé sans compte sur /devis-ugc : repris ici après l'inscription
  useEffect(() => { if (!ready) return; const d = readQuoteDraft(); if (d) { setDraft(d); setAdding(true); toast.info('Votre devis préparé avant l\'inscription est repris ici : vérifiez et générez.', { duration: 8000 }); } }, [ready]);
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
            <p className="text-neutral-600">Pour vos clients hors NeedCreator : devis et contrat de cession en un clic, paiement sécurisé si le client le souhaite. Aucune commission quand il paie en direct. Besoin d&apos;un repère de prix ? <Link href="/calculateur-tarif-ugc" className="text-primary-600 underline">Calculateur de tarif</Link> · <Link href="/prospects" className="text-primary-600 underline">Suivi de prospection</Link>.</p>
          </div>
          <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" /> Nouveau devis</Button>
        </div>
        {!(user as any)?.hasLegalInfo && <Card className="p-4 mb-6 bg-orange-50 border-orange-200 text-sm text-orange-900">Renseignez d&apos;abord vos <Link href="/profile#legal" className="underline">informations administratives</Link> : elles figurent sur le devis et le contrat.</Card>}
        {adding && !editing && <QuoteCreateForm prefill={prefill} draft={draft} onDone={() => { setAdding(false); setDraft(null); clearQuoteDraft(); refresh(); }} />}
        {editing && <QuoteCreateForm key={editing._id} initial={editing} onDone={() => { setEditing(null); refresh(); }} />}
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
                          <Button size="sm" variant="outline" onClick={() => { setAdding(false); setEditing(q); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="w-4 h-4 mr-1" /> Modifier</Button>
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
        <p className="text-xs text-neutral-500 mt-6">Client qui paie via NeedCreator : montant bloqué avant de tourner, contrat, factures émises en votre nom, virement à la validation, commission de {cfg.externalQuoteFeePercent} % comme pour une mission classique. Client qui paie en direct : aucune commission, vous facturez vous-même.</p>
      </div>
    </div>
  );
}

export default function QuotesPage() {
  return <Suspense fallback={<Spinner />}><QuotesPageInner /></Suspense>;
}
