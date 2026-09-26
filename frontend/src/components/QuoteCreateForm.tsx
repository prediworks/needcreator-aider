'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { VIDEO_TYPES, PLATFORMS, RIGHTS_DURATION, RIGHTS_SUPPORTS } from '@/lib/labels';
import { FileSignature } from 'lucide-react';

/** Brouillon de devis préparé sans compte (page publique /devis-ugc), repris dans « Mes devis clients » après l'inscription */
export const QUOTE_DRAFT_KEY = 'nc_quote_draft';
export function readQuoteDraft(): any | null { try { const raw = localStorage.getItem(QUOTE_DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
export function clearQuoteDraft() { try { localStorage.removeItem(QUOTE_DRAFT_KEY); } catch { /* stockage indisponible */ } }

/**
 * Formulaire de devis client. `guest` : sans compte, le devis est gardé en brouillon dans le navigateur et l'inscription est demandée pour le générer.
 * `draft` : brouillon à reprendre (après inscription). `initial` : devis existant à modifier.
 */
export default function QuoteCreateForm({ onDone = () => undefined, prefill, initial, guest = false, draft }: { onDone?: () => void; prefill?: { prospectId?: string; companyName?: string; contactName?: string; email?: string }; initial?: any; guest?: boolean; draft?: any }) {
  const router = useRouter();
  const cfg = usePublicConfig();
  const [f, setF] = useState<any>(draft ? { ...draft } : initial ? {
    companyName: initial.client?.companyName || '', contactName: initial.client?.contactName || '', email: initial.client?.email || '', siret: initial.client?.siret || '', address: initial.client?.address || '',
    title: initial.mission?.title || '', description: initial.mission?.description || '', videoType: initial.mission?.videoType || 'testimonial', deliverables: String(initial.mission?.deliverables || 1), duration: String(initial.mission?.duration || 30), platforms: initial.mission?.platforms || [],
    price: String(initial.quote?.price ?? ''), estimatedDeliveryDays: String(initial.quote?.estimatedDeliveryDays || 7), revisions: String(initial.quote?.revisions ?? 1), duration_rights: initial.quote?.rights?.duration || '1y', supports: initial.quote?.rights?.supports || ['social_organic'], territories: initial.quote?.rights?.territories || 'France', exclusivity: !!initial.quote?.rights?.exclusivity, exclusivityMonths: String(initial.quote?.rights?.exclusivityMonths || ''), terms: initial.quote?.terms || '',
  } : { companyName: prefill?.companyName || '', contactName: prefill?.contactName || '', email: prefill?.email || '', siret: '', address: '', title: '', description: '', videoType: 'testimonial', deliverables: '1', duration: '30', platforms: ['tiktok', 'instagram'], price: '', estimatedDeliveryDays: '7', revisions: '1', duration_rights: '1y', supports: ['social_organic'], territories: 'France', exclusivity: false, exclusivityMonths: '', terms: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggle = (k: string, v: string) => set(k, f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v]);
  const price = parseFloat(f.price) || 0;
  const missing = [!f.companyName.trim() && 'le nom du client', !f.title.trim() && 'un titre de mission', price < cfg.minQuotePrice && `un prix d'au moins ${cfg.minQuotePrice} € HT`].filter(Boolean) as string[];
  const create = useMutation({
    mutationFn: async () => (await (initial ? api.patch : api.post)(initial ? `/external-quotes/${initial._id}` : '/external-quotes', { prospectId: prefill?.prospectId || undefined, client: { companyName: f.companyName, contactName: f.contactName, email: f.email, siret: f.siret, address: f.address }, title: f.title, description: f.description, videoType: f.videoType, deliverables: Number(f.deliverables), duration: Number(f.duration), platforms: f.platforms, price, estimatedDeliveryDays: Number(f.estimatedDeliveryDays), revisions: Number(f.revisions), rights: { duration: f.duration_rights, supports: f.supports, territories: f.territories, exclusivity: f.exclusivity, exclusivityMonths: f.exclusivityMonths }, terms: f.terms })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 6000 }); clearQuoteDraft(); onDone(); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  return (
    <Card className="p-6 mb-6">
      <h2 className="font-semibold text-neutral-900 mb-1">{initial ? `Modifier le devis ${initial.pdf?.number || ''}` : guest ? 'Votre devis UGC' : 'Nouveau devis pour un client hors NeedCreator'}</h2>
      {initial && <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">Les PDF seront régénérés avec le même numéro et le même lien client{initial.status === 'sent' ? '. Le client a déjà reçu la version précédente : pensez à lui renvoyer le devis' : ''}.</p>}
      <p className="text-sm text-neutral-600 mb-4">{guest ? 'Remplissez le devis ici, sans compte. À la dernière étape, un compte gratuit sert à générer les PDF à votre nom et à suivre l\'acceptation du client. ' : ''}Le devis et un projet de contrat de cession de droits sont générés en PDF. Vous les envoyez au client avec un lien : il accepte et paie via NeedCreator, montant bloqué puis versé après validation, ou vous marquez le devis « payé en direct ».</p>
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
        {guest ? (
          <Button onClick={() => { try { localStorage.setItem(QUOTE_DRAFT_KEY, JSON.stringify(f)); } catch { /* stockage indisponible */ } toast.success('Devis gardé en brouillon : créez votre compte gratuit, il sera prêt à générer.', { duration: 6000 }); router.push('/register?role=creator&next=/quotes'); }} disabled={missing.length > 0} data-testid="guest-quote-continue"><FileSignature className="w-4 h-4 mr-1" /> Créer mon compte gratuit et générer le devis</Button>
        ) : (
          <><Button onClick={() => create.mutate()} isLoading={create.isPending} disabled={missing.length > 0}><FileSignature className="w-4 h-4 mr-1" /> {initial ? 'Enregistrer et régénérer les PDF' : 'Générer le devis et le contrat'}</Button>
          <Button variant="outline" onClick={onDone}>Annuler</Button></>
        )}
        <MissingHint items={missing} />
      </div>
    </Card>
  );
}


