'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/useAuth';
import api, { getErrorMessage } from '@/lib/api';
import { directUpload } from '@/lib/upload';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import MissingHint from '@/components/ui/MissingHint';
import BrandSuggestForm from '@/components/BrandSuggestForm';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { formatCurrency, formatDate } from '@/lib/utils';
import { RIGHTS_DURATION, RIGHTS_SUPPORTS } from '@/lib/labels';
import { Video, Upload, ExternalLink, Trash2 } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  ready: { label: 'Prête, à proposer', cls: 'bg-blue-100 text-blue-800' }, sent: { label: 'Proposée à la marque', cls: 'bg-yellow-100 text-yellow-800' },
  accepted: { label: 'Achetée', cls: 'bg-green-100 text-green-800' }, declined: { label: 'Non retenue', cls: 'bg-neutral-100 text-neutral-600' }, withdrawn: { label: 'Retirée', cls: 'bg-neutral-100 text-neutral-600' },
};

/**
 * Vidéo vitrine : le créateur tourne une vidéo pour un produit qu'il possède d'une marque que NeedCreator prospecte.
 * La marque la reçoit finie, en filigrane, avec un devis : si elle lui plaît, elle l'achète en un clic.
 */
export default function ShowcasePage() {
  const { user, ready } = useRequireAuth({ roles: ['creator'] });
  const cfg = usePublicConfig();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [f, setF] = useState<any>({ productName: '', note: '', price: '', rightsDuration: '1y', supports: ['social_organic', 'paid_ads'], territories: 'France' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const pick = (b: any) => { setPicked(b); if (b?.product && !/^https?:/.test(b.product)) setF((p: any) => (p.productName ? p : { ...p, productName: b.product })); };
  const toggle = (v: string) => set('supports', f.supports.includes(v) ? f.supports.filter((x: string) => x !== v) : [...f.supports, v]);
  const { data: brands } = useQuery({ queryKey: ['showcase-brands', q], queryFn: async () => (await api.get('/showcase/brands', { params: { q: q || undefined } })).data.brands, enabled: ready, staleTime: 60000 });
  const { data: mine, isLoading } = useQuery({ queryKey: ['showcases'], queryFn: async () => (await api.get('/showcase')).data.showcases, enabled: ready });
  // Lien reçu par email ou notification (« ?marque=… ») : la marque qui demande une vidéo est choisie d'office, son produit prérempli
  useEffect(() => {
    if (picked || !brands?.length) return;
    let id = '';
    try { id = new URLSearchParams(window.location.search).get('marque') || ''; } catch { /* adresse illisible */ }
    const b = id ? brands.find((x: any) => String(x.id) === id) : null;
    if (b) pick(b);
  }, [brands]); // eslint-disable-line react-hooks/exhaustive-deps
  const price = parseFloat(f.price) || 0;
  const missing = [!picked && 'une marque', !file && 'le fichier vidéo', !f.productName.trim() && 'le nom du produit', price < cfg.minQuotePrice && `un prix d'au moins ${cfg.minQuotePrice} € HT`].filter(Boolean) as string[];
  const create = useMutation({
    // Envoi direct vers le stockage (pas de limite de taille du proxy), puis création de la vidéo vitrine et de son devis
    mutationFn: async () => { setProgress(0); const { key } = await directUpload('/showcase/upload-url', file as File, (p: number) => setProgress(p)); return (await api.post('/showcase', { key, leadId: picked.id, productName: f.productName, note: f.note, price, rightsDuration: f.rightsDuration, supports: f.supports, territories: f.territories })).data; },
    onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); setPicked(null); setFile(null); setProgress(null); setF({ productName: '', note: '', price: '', rightsDuration: '1y', supports: ['social_organic', 'paid_ads'], territories: 'France' }); queryClient.invalidateQueries({ queryKey: ['showcases'] }); queryClient.invalidateQueries({ queryKey: ['showcase-brands'] }); },
    onError: (e: any) => { setProgress(null); toast.error(getErrorMessage(e), { duration: 10000 }); },
  });
  const withdraw = useMutation({ mutationFn: async (id: string) => (await api.post(`/showcase/${id}/withdraw`)).data, onSuccess: (d) => { toast.success(d.message); queryClient.invalidateQueries({ queryKey: ['showcases'] }); queryClient.invalidateQueries({ queryKey: ['showcase-brands'] }); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  if (!ready || !user) return <Spinner />;
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1 flex items-center gap-2"><Video className="w-6 h-6 text-primary-500" /> Candidature spontanée en vidéo</h1>
        <p className="text-neutral-600 text-sm mb-6">N&apos;attendez pas qu&apos;une marque vous choisisse. Vous avez chez vous un produit d&apos;une marque que nous démarchons ? Tournez une vidéo de 15 à 30 secondes, fixez votre prix : la marque la reçoit finie, en filigrane, avec un devis. Si elle lui plaît, elle l&apos;achète en un clic et vous êtes payé comme pour une mission ; sinon, la vidéo reste à vous. <Link href="/academie" className="text-primary-700 underline">Les accroches qui marchent</Link>.</p>

        <Card className="p-6 mb-6" data-testid="showcase-form">
          <h2 className="font-semibold text-neutral-900 mb-3">1. La marque</h2>
          <Input label="Chercher une marque" value={q} onChange={(e) => setQ(e.target.value)} placeholder="nom ou site" className="w-full sm:w-80" />
          <div className="mt-3 max-h-56 overflow-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
            {(brands || []).length === 0 && <div className="p-3 text-sm text-neutral-500" data-testid="showcase-no-brand">{q.trim() ? <>Aucune marque ne correspond à « {q.trim()} ». Vous avez ce produit chez vous ? <strong>Proposez la marque</strong> avec le bouton ci-dessous : nous la vérifions sous 48 heures et elle vous est réservée dix jours.</> : <>Aucune marque disponible pour l&apos;instant.</>}</div>}
            {(brands || []).map((b: any) => (
              <button key={b.id} type="button" onClick={() => pick(b)} className={`w-full text-left p-3 text-sm hover:bg-neutral-50 ${picked?.id === b.id ? 'bg-primary-50' : ''}`} data-testid="showcase-brand">
                <div className="font-medium text-neutral-900">{b.name} {b.niche && <span className="text-xs text-neutral-500 font-normal">· {b.niche}</span>}{b.requested && <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-green-100 text-green-800 font-normal">vidéo demandée par la marque</span>}</div>
                {b.summary && <div className="text-xs text-neutral-600">{b.summary}</div>}
                {b.suggestedByMe && <div className="text-xs text-primary-800 mt-0.5">Suggérée par vous : réservée jusqu&apos;au {formatDate(b.reservedUntil)}</div>}
                {b.requested && b.product && <div className="text-xs text-green-800 mt-0.5">Produit demandé : {/^https?:/.test(b.product) ? 'page indiquée par la marque (lien affiché une fois la marque choisie)' : b.product}</div>}
                {b.hooks?.length > 0 && <div className="text-xs text-neutral-500 mt-0.5">Accroche possible : « {b.hooks[0]} »</div>}
              </button>
            ))}
          </div>
          <BrandSuggestForm onPick={pick} />
          {picked && <p className="text-sm text-primary-800 mt-2">Marque choisie : <strong>{picked.name}</strong>{picked.website && <> · <a href={picked.website} target="_blank" rel="noopener noreferrer" className="underline">site</a></>}{picked.product && /^https?:/.test(picked.product) && <> · <a href={picked.product} target="_blank" rel="noopener noreferrer" className="underline">produit demandé</a></>}</p>}

          <h2 className="font-semibold text-neutral-900 mt-6 mb-3">2. La vidéo</h2>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block text-sm mb-3" data-testid="showcase-file" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Produit filmé" value={f.productName} onChange={(e) => set('productName', e.target.value)} placeholder="Ex : bougie Figuier 180 g" />
            <Input label={`Votre prix HT (€, minimum ${cfg.minQuotePrice})`} type="number" min={cfg.minQuotePrice} value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="Ex : 120" />
          </div>
          <textarea value={f.note} onChange={(e) => set('note', e.target.value)} rows={2} maxLength={400} placeholder="Ce que montre la vidéo, en une phrase pour la marque (optionnel)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm mt-3" />

          <h2 className="font-semibold text-neutral-900 mt-6 mb-3">3. Les droits que vous cédez</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-2">
            <div><label className="block text-sm font-medium text-neutral-700 mb-1">Durée</label><select value={f.rightsDuration} onChange={(e) => set('rightsDuration', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(RIGHTS_DURATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <Input label="Territoire" value={f.territories} onChange={(e) => set('territories', e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">{Object.keys(RIGHTS_SUPPORTS).map((s) => <button key={s} type="button" onClick={() => toggle(s)} className={`px-3 py-1 rounded-full text-xs ${f.supports.includes(s) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{RIGHTS_SUPPORTS[s]}</button>)}</div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button onClick={() => create.mutate()} isLoading={create.isPending} disabled={missing.length > 0} data-testid="showcase-submit"><Upload className="w-4 h-4 mr-1" /> Déposer la vidéo et créer le devis</Button>
            <MissingHint items={missing} />
            {create.isPending && progress !== null && <span className="text-sm text-neutral-600" data-testid="showcase-progress">Envoi de la vidéo : {Math.round(progress)} %</span>}
          </div>
          <p className="text-xs text-neutral-500 mt-3">Règles : une vidéo par marque à la fois, trois candidatures en cours au plus ; filmez un produit que vous possédez, sans logo ajouté ni contenu de la marque ; aucune promesse de résultat ou de santé ; pas de musique protégée. NeedCreator vérifie la vidéo puis la présente à la marque ; vous êtes prévenu à chaque étape : proposée, page ouverte, achetée.</p>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-neutral-900 mb-3">Mes candidatures spontanées</h2>
          {isLoading ? <Spinner fullScreen={false} /> : !mine?.length ? <p className="text-sm text-neutral-500">Aucune vidéo pour l&apos;instant.</p> : (
            <div className="space-y-3">
              {mine.map((s: any) => (
                <div key={s.id} className="border border-neutral-200 rounded-lg p-3 flex items-start justify-between gap-3 flex-wrap" data-testid="showcase-item">
                  <div className="text-sm">
                    <div className="font-medium text-neutral-900">{s.brandName} · {s.productName} <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${STATUS[s.status]?.cls}`}>{STATUS[s.status]?.label}</span></div>
                    <div className="text-neutral-600">{formatCurrency(s.price)} HT · déposée le {formatDate(s.createdAt)}{s.sentAt ? ` · proposée le ${formatDate(s.sentAt)}` : ''}{!s.ready && s.status !== 'accepted' ? ' · filigrane en cours' : ''}</div>
                    {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-700 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Page vue par la marque</a>}
                  </div>
                  {['ready', 'sent'].includes(s.status) && <Button size="sm" variant="ghost" onClick={() => { if (confirm('Retirer cette vidéo ? La marque ne pourra plus l\'acheter.')) withdraw.mutate(s.id); }} title="Retirer la vidéo tant qu'elle n'est pas achetée"><Trash2 className="w-4 h-4" /></Button>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
