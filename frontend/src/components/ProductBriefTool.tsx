'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import { VIDEO_TYPES, NICHES, PLATFORMS } from '@/lib/labels';
import { Link2, Sparkles, Target, Users, Clapperboard, Wallet, ArrowRight, Copy } from 'lucide-react';

const STEPS = ['Lecture de la fiche produit', 'Positionnement et angles', 'Rédaction du brief', 'Estimation du budget'];

/** Brief depuis une URL produit : page publique, sans compte. Le brief est repris à l'inscription ou par une marque connectée. */
export default function ProductBriefTool() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [id, setId] = useState<string | null>(searchParams.get('id'));
  const [stepIdx, setStepIdx] = useState(0);
  const [manual, setManual] = useState(false); // repli : description saisie à la main quand la page ne peut pas être lue
  const [m, setM] = useState({ name: '', brand: '', description: '', price: '' });

  const { data, isFetching } = useQuery({ queryKey: ['product-brief', id], queryFn: async () => (await api.get(`/product-briefs/${id}`)).data.brief, enabled: !!id, staleTime: 60000 });

  const generate = useMutation({
    mutationFn: async (withManual: boolean) => (await api.post('/product-briefs', withManual ? { url: url.trim(), name: m.name, brand: m.brand, description: m.description, price: m.price === '' ? null : Number(m.price) } : { url: url.trim() })).data.brief,
    onSuccess: (b) => { setId(b.id); setManual(false); router.replace(`/brief-depuis-url?id=${b.id}`); },
    onError: (e: any) => { toast.error(getErrorMessage(e)); if (e?.response?.data?.code === 'UNREADABLE') setManual(true); },
  });
  const claim = useMutation({
    mutationFn: async () => (await api.post(`/product-briefs/${id}/claim`)).data,
    onSuccess: (r) => { toast.success('Campagne brouillon créée : relisez et publiez.'); router.push(`/campaigns/${r.campaignId}`); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  useEffect(() => {
    if (!generate.isPending) { setStepIdx(0); return; }
    const t = setInterval(() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1)), 7000);
    return () => clearInterval(t);
  }, [generate.isPending]);

  const b = data;
  const copyBrief = () => {
    if (!b) return;
    const text = [`${b.brief.title}`, '', b.brief.description, '', 'Consignes :', ...b.brief.requirements.map((r: string) => `- ${r}`), '', 'À faire :', ...b.brief.dos.map((r: string) => `- ${r}`), '', 'À éviter :', ...b.brief.donts.map((r: string) => `- ${r}`)].join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success('Brief copié'));
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) generate.mutate(false); }} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1"><Input label="Adresse de la fiche produit" placeholder="https://www.votreboutique.fr/products/mon-produit" value={url} onChange={(e) => setUrl(e.target.value)} type="url" required data-testid="product-url" /></div>
          <Button type="submit" isLoading={generate.isPending} disabled={!url.trim()} data-testid="product-brief-submit"><Sparkles className="w-4 h-4 mr-2" /> Générer le brief</Button>
        </form>
        <p className="text-xs text-neutral-500 mt-2">Shopify, WooCommerce, Prestashop ou toute page produit publique. Gratuit, sans compte, 5 briefs par heure. Rien n&apos;est publié sans vous.{!manual && <> Site protégé contre les robots ? <button type="button" className="underline" onClick={() => setManual(true)}>Décrivez le produit à la main</button>.</>}</p>
        {manual && (
          <form onSubmit={(e) => { e.preventDefault(); if (url.trim() && m.description.trim().length >= 40) generate.mutate(true); }} className="mt-4 border-t border-neutral-200 pt-4 space-y-3" data-testid="product-manual-form">
            <p className="text-sm text-neutral-700">La page ne peut pas être lue automatiquement : copiez ici la fiche produit, le brief est généré pareil. L&apos;adresse ci-dessus sert de lien vers le produit.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Input label="Nom du produit" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Savon surgras karité 250 g" />
              <Input label="Marque" value={m.brand} onChange={(e) => setM({ ...m, brand: e.target.value })} placeholder="Nom de la marque" />
              <Input label="Prix (€)" type="number" min={0} step="0.01" value={m.price} onChange={(e) => setM({ ...m, price: e.target.value })} placeholder="9,90" />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Description du produit (copiée depuis la fiche)</label>
              <textarea value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} rows={5} maxLength={3000} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="Composition, bénéfices, usage, pour qui, ce qui le distingue…" data-testid="product-manual-description" />
              <p className="text-xs text-neutral-500 mt-1">{m.description.trim().length < 40 ? `Encore ${40 - m.description.trim().length} caractères minimum` : `${m.description.length} / 3000`}</p>
            </div>
            <Button type="submit" isLoading={generate.isPending} disabled={!url.trim() || m.description.trim().length < 40} data-testid="product-manual-submit"><Sparkles className="w-4 h-4 mr-2" /> Générer depuis ma description</Button>
          </form>
        )}
        {generate.isPending && (
          <ol className="mt-4 grid sm:grid-cols-4 gap-2 text-sm" data-testid="product-brief-progress">
            {STEPS.map((s, i) => <li key={s} className={`rounded-lg px-3 py-2 ${i < stepIdx ? 'bg-primary-50 text-primary-700' : i === stepIdx ? 'bg-primary-500 text-white animate-pulse' : 'bg-neutral-100 text-neutral-500'}`}>{i + 1}. {s}</li>)}
          </ol>
        )}
      </Card>

      {id && isFetching && !b && <p className="text-sm text-neutral-500">Chargement du brief…</p>}

      {b && (
        <div className="space-y-6" data-testid="product-brief-result">
          <Card className="p-6">
            <div className="flex flex-col md:flex-row gap-5">
              {b.product?.image && <img src={b.product.image} alt={b.product.name || ''} className="w-full md:w-40 h-40 object-cover rounded-lg bg-neutral-100" />}
              <div className="flex-1">
                <div className="text-xs text-neutral-500 flex items-center gap-1"><Link2 className="w-3 h-3" /> {b.domain}</div>
                <h2 className="text-2xl font-bold text-neutral-900" data-testid="product-name">{b.product?.name || 'Produit'}</h2>
                {b.product?.brand && <div className="text-sm text-neutral-600">{b.product.brand}{b.product.price != null ? ` · ${formatCurrency(b.product.price)}` : ''}</div>}
                <p className="text-sm text-neutral-700 mt-2"><Target className="w-4 h-4 inline mr-1 text-primary-600" />{b.analysis.positioning}</p>
                <p className="text-sm text-neutral-700 mt-1"><Users className="w-4 h-4 inline mr-1 text-primary-600" />{b.analysis.audience}</p>
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-3 gap-4">
            {b.analysis.angles.map((a: any, i: number) => (
              <Card key={i} className="p-5">
                <div className="text-xs font-medium text-primary-600 mb-1">Angle {i + 1}</div>
                <h3 className="font-semibold text-neutral-900">{a.title}</h3>
                <p className="text-sm text-neutral-800 italic mt-2">« {a.hook} »</p>
                <p className="text-xs text-neutral-600 mt-2">{a.why}</p>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-2"><Clapperboard className="w-5 h-5 text-primary-600" /> Format recommandé</h3>
              <ul className="text-sm text-neutral-700 space-y-1">
                <li>Type : {VIDEO_TYPES[b.analysis.videoType] || b.analysis.videoType}</li>
                <li>Durée : {b.analysis.duration} secondes · {b.analysis.deliverables} vidéo{b.analysis.deliverables > 1 ? 's' : ''} pour un premier test</li>
                <li>Réseaux : {(b.analysis.platforms || []).map((p: string) => PLATFORMS[p] || p).join(', ')}</li>
                <li>Niche créateur : {NICHES[b.analysis.niche] || b.analysis.niche}</li>
              </ul>
            </Card>
            <Card className="p-5 bg-primary-50 border-primary-100">
              <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-2"><Wallet className="w-5 h-5 text-primary-600" /> Budget estimé</h3>
              <div className="text-3xl font-bold text-neutral-900" data-testid="product-budget">{formatCurrency(b.budget.mid)} <span className="text-base font-normal text-neutral-600">HT</span></div>
              <p className="text-sm text-neutral-700">entre {formatCurrency(b.budget.low)} et {formatCurrency(b.budget.high)} pour {b.analysis.deliverables} vidéo{b.analysis.deliverables > 1 ? 's' : ''}, droits 1 an, réseaux et publicité en ligne. Soit {formatCurrency(b.budget.perVideoMid)} par vidéo.</p>
              <p className="text-xs text-neutral-600 mt-2">Sur NeedCreator, le créateur propose son prix dans son devis ; vous ne payez qu&apos;à la validation des vidéos, ou en produit offert.</p>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-medium text-primary-600">Brief prêt à publier</div>
                <h3 className="text-xl font-bold text-neutral-900" data-testid="product-brief-title">{b.brief.title}</h3>
              </div>
              <Button variant="outline" size="sm" onClick={copyBrief}><Copy className="w-4 h-4 mr-1" /> Copier</Button>
            </div>
            <p className="text-sm text-neutral-700 mt-3 whitespace-pre-line">{b.brief.description}</p>
            <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm">
              <div><div className="font-medium text-neutral-900 mb-1">Consignes</div><ul className="list-disc pl-4 space-y-1 text-neutral-700">{b.brief.requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
              <div><div className="font-medium text-neutral-900 mb-1">À faire</div><ul className="list-disc pl-4 space-y-1 text-neutral-700">{b.brief.dos.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
              <div><div className="font-medium text-neutral-900 mb-1">À éviter</div><ul className="list-disc pl-4 space-y-1 text-neutral-700">{b.brief.donts.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
            </div>
            {b.brief.hashtags?.length > 0 && <div className="mt-3 text-xs text-neutral-500">{b.brief.hashtags.map((h: string) => `#${h}`).join(' ')}</div>}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
              {b.claimed ? (
                <p className="text-sm text-neutral-600">Ce brief a déjà été transformé en campagne{user?.role === 'brand' && b.campaignId ? <> : <Link href={`/campaigns/${b.campaignId}`} className="text-primary-600 underline">l&apos;ouvrir</Link></> : ''}.</p>
              ) : user?.role === 'brand' ? (
                <Button onClick={() => claim.mutate()} isLoading={claim.isPending} data-testid="product-brief-claim">Créer la campagne à partir de ce brief <ArrowRight className="w-4 h-4 ml-2" /></Button>
              ) : user ? (
                <p className="text-sm text-neutral-600">Connectez-vous avec un compte marque pour publier ce brief.</p>
              ) : (
                <Link href={`/register?role=brand&brief=${b.id}`}><Button data-testid="product-brief-register">Publier ce brief : créer mon compte marque <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
              )}
              <span className="text-xs text-neutral-500">La campagne est créée en brouillon : vous relisez, ajustez le budget, puis publiez. Lien de ce brief valable 30 jours.</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
