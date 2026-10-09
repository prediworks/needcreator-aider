'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ScanReportSignup from '@/components/ScanReportSignup';
import { formatDate } from '@/lib/utils';
import { Search, ExternalLink, Lock, ArrowRight, Clapperboard, Share2, BarChart3, ClipboardCheck } from 'lucide-react';

const PLATFORM: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads' };
const GENDER: Record<string, string> = { All: 'tous', Women: 'femmes', Men: 'hommes' };

/**
 * Scan concurrentiel : le nom d'une marque → ses publicités Meta actives (les plus anciennes d'abord : celles qui tournent sont celles qui
 * marchent), des constats factuels par l'IA, et « Commander l'équivalent » en vidéo créateur. Sans compte : un aperçu ; inscrit : tout.
 */
/**
 * Référence gardée pour la session, chaque action y est rattachée : fiche prospect (lien de l'email marques, ?ref=) ou devis de créateur
 * (outils offerts avec le devis, ?devis=, gardé sous la forme « devis:<id> »)
 */
const REF_KEY = 'nc_scan_ref';
function readRef(): string { try { return sessionStorage.getItem(REF_KEY) || ''; } catch { return ''; } }
function trackRef(action: 'visit' | 'scan' | 'audit' | 'brief', slug = '', isAdmin = false) {
  const stored = readRef();
  if (!stored || isAdmin) return; // l'équipe qui teste un lien d'email ne compte pas comme une visite de la marque
  const quote = stored.startsWith('devis:');
  api.post('/ad-scans/ref', { ref: quote ? stored.slice(6) : stored, action, slug, source: quote ? 'quote' : 'lead' }).catch(() => null);
}

const VIDEO_TYPE: Record<string, string> = { testimonial: 'Témoignage', unboxing: 'Unboxing', demo: 'Démonstration', tutorial: 'Tutoriel', review: 'Avis', comparison: 'Comparatif', lifestyle: 'Lifestyle', 'behind-the-scenes': 'Coulisses' };

export default function AdScanTool({ initialSlug = '', mode = 'scan' }: { initialSlug?: string; mode?: 'scan' | 'audit' }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [q, setQ] = useState('');
  const [slug, setSlug] = useState(initialSlug);
  const [candidates, setCandidates] = useState<any[] | null>(null);
  const [optOut, setOptOut] = useState(false);
  const [optEmail, setOptEmail] = useState(''); const [optReason, setOptReason] = useState('');
  // Vue « audit créatif » : arrivée par /audit-publicites, ou « ?vue=audit » sur la page d'un scan
  const [auditView, setAuditView] = useState(mode === 'audit');
  const [auditAsked, setAuditAsked] = useState('');
  const [fromEmail, setFromEmail] = useState(false);
  const [leadRef, setLeadRef] = useState('');
  // « ?vue=audit » : vue audit ; « ?q=Nom » (bandeau de l'accueil ou de la page Marques) : le scan se lance d'office, une fois
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('vue') === 'audit') setAuditView(true);
      const ref = (sp.get('ref') || '').trim();
      const devis = (sp.get('devis') || '').trim();
      const saved = readRef();
      setLeadRef(/^[a-f0-9]{24}$/i.test(ref) ? ref : saved.startsWith('devis:') ? '' : saved);
      if (/^[a-f0-9]{24}$/i.test(ref)) { try { sessionStorage.setItem(REF_KEY, ref); } catch { /* stockage indisponible */ } setFromEmail(true); }
      else if (/^[a-f0-9]{24}$/i.test(devis)) { try { sessionStorage.setItem(REF_KEY, `devis:${devis}`); } catch { /* stockage indisponible */ } setFromEmail(true); }
      const q0 = (sp.get('q') || '').trim().slice(0, 120);
      // « &page=<identifiant Meta> » (lien d'audit de l'email) : la bonne page directement, sans liste de pages homonymes
      const page0 = (sp.get('page') || '').trim();
      if (/^\d{3,30}$/.test(page0) && !initialSlug) { setQ(q0); scan.mutate({ pageId: page0, pageName: q0 }); }
      else if (q0.length >= 2 && !initialSlug) { setQ(q0); scan.mutate({ q: q0 }); }
    } catch { /* adresse illisible */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrivée par un lien de l'email marques : la visite est enregistrée une fois la session connue (une visite de l'équipe ne compte pas)
  const [visitSent, setVisitSent] = useState(false);
  useEffect(() => {
    if (!fromEmail || authLoading || visitSent) return;
    setVisitSent(true);
    trackRef('visit', initialSlug, isAdmin);
  }, [fromEmail, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lecture en arrière-plan côté serveur : tant que le scan est « en cours », la page se met à jour toutes les trois secondes
  const { data, isFetching, error } = useQuery({ queryKey: ['ad-scan', slug, user?.id], queryFn: async () => (await api.get(`/ad-scans/${slug}`)).data, enabled: !!slug, staleTime: 60000, retry: false, refetchInterval: (query: any) => (query.state.data?.scan?.status === 'pending' || query.state.data?.scan?.insightsPending || query.state.data?.scan?.auditPending ? 3000 : false) });
  const { data: recent } = useQuery({ queryKey: ['ad-scans-recent'], queryFn: async () => (await api.get('/ad-scans/recent')).data.scans, enabled: !slug, staleTime: 300000 });
  // Consultation par un navigateur : compteur, et condition d'indexation de la page
  useEffect(() => { if (slug && data?.scan?.status === 'ready') api.post(`/ad-scans/${slug}/view`).catch(() => null); }, [slug, data?.scan?.slug, data?.scan?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const scan = useMutation({
    mutationFn: async (body: { q?: string; pageId?: string; pageName?: string }) => (await api.post('/ad-scans', body)).data,
    onSuccess: (d) => { if (d.candidates) { setCandidates(d.candidates); return; } setCandidates(null); setSlug(d.scan.slug); trackRef('scan', d.scan.slug, isAdmin); router.replace(`/publicites/${d.scan.slug}${auditView ? '?vue=audit' : ''}`); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  const brief = useMutation({
    // La rédaction par l'IA prend souvent 30 à 60 secondes : message d'attente visible, un seul brief à la fois
    mutationFn: async (opt?: { adId?: string; proposal?: number }) => (await api.post(`/ad-scans/${slug}/brief`, { adId: opt?.adId || '', ...(opt?.proposal !== undefined ? { proposal: opt.proposal } : {}) })).data,
    onMutate: () => { toast.loading('Préparation du brief : l\'IA rédige les consignes, comptez 30 secondes à une minute…', { id: 'scan-brief' }); },
    onSuccess: (d) => { trackRef('brief', slug, isAdmin); toast.success(d.message, { id: 'scan-brief', duration: 8000 }); router.push(`/brief-depuis-url?id=${d.briefId}`); },
    onError: (e: any) => toast.error(getErrorMessage(e), { id: 'scan-brief', duration: 10000 }),
  });
  const audit = useMutation({
    mutationFn: async () => (await api.post(`/ad-scans/${slug}/audit`)).data,
    onSuccess: () => { trackRef('audit', slug, isAdmin); queryClient.invalidateQueries({ queryKey: ['ad-scan', slug] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  const sendOptOut = useMutation({
    mutationFn: async () => (await api.post(`/ad-scans/${slug}/opt-out`, { email: optEmail, reason: optReason })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); setOptOut(false); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); toast.success('Lien copié'); } catch { toast.error('Presse-papiers indisponible'); } };

  const s = data?.scan;
  // Audit demandé à l'ouverture de la vue, une fois par page (lecture IA en arrière-plan, la page suit)
  useEffect(() => {
    if (!auditView || !s || s.status !== 'ready' || s.audit || s.auditPending || auditAsked === s.slug || audit.isPending) return;
    setAuditAsked(s.slug); audit.mutate();
  }, [auditView, s?.slug, s?.status, s?.audit, s?.auditPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const openAudit = () => { setAuditView(true); if (s) router.replace(`/publicites/${s.slug}?vue=audit`); };
  const back = s ? encodeURIComponent(`/publicites/${s.slug}${auditView ? '?vue=audit' : ''}`) : '';
  const signupHref = `/register?role=brand&next=${back}${leadRef ? `&lead=${leadRef}` : ''}`; // marque venue de l'email : son inscription est rattachée à sa fiche
  const loginHref = `/login?next=${back}`;
  const errStatus = (error as any)?.response?.status;
  const proposeHref = s ? (s.leadId ? `/vitrine?marque=${s.leadId}` : `/vitrine?suggerer=${encodeURIComponent(s.pageName || '')}${s.website ? `&site=${encodeURIComponent(s.website)}` : ''}`) : '/vitrine';

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) scan.mutate({ q: q.trim() }); }} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1"><Input label={auditView ? 'Nom de votre marque (tel que sur votre page Facebook)' : 'Nom d\'une marque (un concurrent, ou la vôtre)'} placeholder="Ex. : Respire, Cabaïa, Typology…" value={q} onChange={(e) => setQ(e.target.value)} required data-testid="ad-scan-q" /></div>
          <Button type="submit" isLoading={scan.isPending} data-testid="ad-scan-go"><Search className="w-4 h-4 mr-2" /> {auditView ? 'Auditer ces publicités' : 'Voir ses publicités'}</Button>
        </form>
        {scan.isPending && <p className="text-sm text-neutral-600 mt-3">Recherche de la page dans la bibliothèque publicitaire Meta…</p>}
        {candidates && (
          <div className="mt-4" data-testid="ad-scan-candidates">
            <div className="text-sm font-medium text-neutral-900 mb-2">Plusieurs pages portent ce nom. Laquelle ?</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {candidates.map((c) => (
                <button key={c.pageId} type="button" onClick={() => scan.mutate({ pageId: c.pageId, pageName: c.pageName })} className="text-left p-3 rounded-lg border border-neutral-200 hover:border-primary-400 bg-white">
                  <div className="font-medium text-neutral-900">{c.pageName}</div>
                  <div className="text-xs text-neutral-600">{c.ads} publicité{c.ads > 1 ? 's' : ''} active{c.ads > 1 ? 's' : ''}{c.website ? ` · ${c.website}` : ''}</div>
                  {c.sample && <div className="text-xs text-neutral-500 mt-1 line-clamp-2">{c.sample}</div>}
                </button>
              ))}
            </div>
          </div>
        )}
        {!slug && !candidates && !user && <p className="text-xs text-neutral-500 mt-3">Sans compte : 3 marques par jour, les 10 publicités les plus anciennes et les premiers constats. Avec un compte gratuit (marque ou créateur) : 10 marques par jour, toutes les publicités, la lecture complète.</p>}
      </Card>

      {slug && isFetching && !s && <Card className="p-6 text-sm text-neutral-600">Chargement du scan…</Card>}
      {slug && errStatus === 410 && <Card className="p-6 text-sm text-neutral-700">Cette marque a demandé à ne pas apparaître dans l&apos;outil.</Card>}
      {slug && errStatus === 404 && <Card className="p-6 text-sm text-neutral-700">Scan introuvable. <button type="button" className="underline text-primary-700" onClick={() => { setSlug(''); router.replace('/publicites-concurrents'); }}>Lancer un nouveau scan</button></Card>}

      {s && (
        <div className="space-y-6" data-testid="ad-scan-result">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-medium text-primary-600">Publicités Meta actives en France · lu le {formatDate(s.fetchedAt)}</div>
                <h2 className="text-2xl font-bold text-neutral-900" data-testid="ad-scan-name">{s.pageName}</h2>
                <div className="text-sm text-neutral-600 mt-1 flex gap-3 flex-wrap">
                  {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="underline">{s.website.replace(/^https?:\/\/(www\.)?/, '')}</a>}
                  <a href={s.libraryUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Voir dans la bibliothèque Meta <ExternalLink className="w-3 h-3" /></a>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={share} title="Copie le lien de cette page : elle est publique"><Share2 className="w-4 h-4 mr-1" /> Partager</Button>
                {user?.role !== 'creator' && !auditView && s.status === 'ready' && <Button variant="outline" size="sm" onClick={openAudit} title="C'est votre marque ? Ce qui tient dans la durée, les angles répétés, les angles libres, des accroches à tester et trois vidéos créateur à commander" data-testid="ad-scan-open-audit"><ClipboardCheck className="w-4 h-4 mr-1" /> Audit de ces publicités</Button>}
                {user?.role === 'creator' ? (
                  <Link href={proposeHref}><Button size="sm" title="Vous possédez un produit de cette marque ? Tournez votre version de sa publicité qui marche : elle la reçoit finie avec un devis et l'achète en un clic" data-testid="ad-scan-propose"><Clapperboard className="w-4 h-4 mr-1" /> Proposer une vidéo à cette marque</Button></Link>
                ) : (
                  <Button size="sm" onClick={() => brief.mutate({})} isLoading={brief.isPending} disabled={s.status !== 'ready'} title="Prépare un brief NeedCreator : l'équivalent de la publicité qui tourne depuis le plus longtemps, en vidéo créateur, avec un angle que ces publicités n'utilisent pas" data-testid="ad-scan-brief">Commander l&apos;équivalent <ArrowRight className="w-4 h-4 ml-1" /></Button>
                )}
              </div>
            </div>
            {s.status === 'pending' ? (
              <p className="text-sm text-neutral-700 mt-4 animate-pulse" data-testid="ad-scan-pending">Lecture en cours : les publicités chez Meta, puis leur lecture par l&apos;IA. Une minute environ ; la page se met à jour toute seule.</p>
            ) : s.status === 'failed' ? (
              <div className="text-sm text-neutral-700 mt-4" data-testid="ad-scan-failed">La lecture n&apos;a pas abouti{s.error ? ` : ${s.error}` : ''}. <button type="button" className="underline text-primary-700" onClick={() => scan.mutate({ pageId: s.pageId, pageName: s.pageName })}>Réessayer</button></div>
            ) : s.status === 'empty' ? (
              <p className="text-sm text-neutral-700 mt-4" data-testid="ad-scan-empty">Aucune publicité active en France pour cette page en ce moment. Essayez l&apos;orthographe exacte du nom de la page Facebook, ou une autre marque.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm" data-testid="ad-scan-stats">
                <Stat label="Publicités actives" value={String(s.totalActive)} />
                <Stat label="La plus ancienne" value={s.stats?.oldestDays != null ? `${s.stats.oldestDays} j` : '—'} hint="Une publicité maintenue longtemps est une publicité qui rapporte" />
                <Stat label="Depuis plus de 90 jours" value={String(s.stats?.over90Days ?? 0)} />
                <Stat label="Supports" value={Object.entries(s.stats?.platforms || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2).map(([k]) => PLATFORM[k] || k).join(', ') || '—'} />
                {(s.stats?.ages?.length > 0 || s.stats?.countries?.length > 0) && <div className="col-span-2 md:col-span-4 text-xs text-neutral-600">{s.stats.ages?.length ? `Âges visés : ${s.stats.ages.join(', ')} ans` : ''}{s.stats.ages?.length && s.stats.countries?.length ? ' · ' : ''}{s.stats.countries?.length ? `Pays : ${s.stats.countries.join(', ')}` : ''}{s.stats.reach ? ` · portée estimée cumulée en Europe : ${Number(s.stats.reach).toLocaleString('fr-FR')}` : ''}</div>}
              </div>
            )}
          </Card>
          {s.status === 'ready' && !isAdmin && <ScanReportSignup slug={s.slug} pageName={s.pageName} />}

          {auditView && s.status === 'ready' && (
            <Card className="p-6 border-primary-200" data-testid="ad-scan-audit">
              <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><ClipboardCheck className="w-5 h-5 text-primary-600" /> Audit créatif des publicités de {s.pageName}</h3>
              <p className="text-xs text-neutral-500 mb-3">Meta ne fournit que le texte et la durée de diffusion : l&apos;audit porte sur ce qui est écrit et sur ce qui dure. Une publicité maintenue longtemps est un indice de rentabilité.</p>
              {!s.audit ? (
                <p className="text-sm text-neutral-700 animate-pulse" data-testid="ad-scan-audit-pending">{s.auditPending || audit.isPending ? 'L\'IA lit les publicités : ce qui tient dans la durée, les angles répétés, les angles libres. Une à deux minutes, la page se met à jour toute seule.' : 'Préparation de l\'audit…'}</p>
              ) : (
                <div className="space-y-4 text-sm">
                  {s.audit.diagnosis && <p className="text-neutral-800">{s.audit.diagnosis}</p>}
                  {s.audit.lasting?.length > 0 && <div><div className="font-medium text-neutral-900 mb-1">Ce qui tient dans la durée</div><ul className="list-disc pl-5 space-y-1 text-neutral-700">{s.audit.lasting.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <div className="font-medium text-neutral-900 mb-1">Angles répétés</div>
                      {s.audit.overused?.length ? <ul className="space-y-1 text-neutral-700">{s.audit.overused.map((o: any, i: number) => <li key={i}><span className="font-medium">{o.angle}</span> · {o.count} pub{o.count > 1 ? 's' : ''}{o.note ? <span className="block text-xs text-neutral-500">{o.note}</span> : null}</li>)}</ul> : s.audit.locked?.includes('overused') ? <Locked text="les angles que vous répétez" href={signupHref} /> : <p className="text-neutral-500">—</p>}
                    </div>
                    <div>
                      <div className="font-medium text-neutral-900 mb-1">Angles libres</div>
                      {s.audit.missing?.length ? <ul className="space-y-1 text-neutral-700">{s.audit.missing.map((o: any, i: number) => <li key={i}><span className="font-medium">{o.angle}</span>{o.why ? <span className="block text-xs text-neutral-500">{o.why}</span> : null}</li>)}</ul> : s.audit.locked?.includes('missing') ? <Locked text="les angles que vous n'utilisez pas" href={signupHref} /> : <p className="text-neutral-500">—</p>}
                    </div>
                    <div>
                      <div className="font-medium text-neutral-900 mb-1">Accroches à tester</div>
                      {s.audit.hooks?.length ? <ul className="space-y-1 text-neutral-700">{s.audit.hooks.map((h: string, i: number) => <li key={i}>« {h} »</li>)}</ul> : s.audit.locked?.includes('hooks') ? <Locked text="cinq accroches pour les trois premières secondes" href={signupHref} /> : <p className="text-neutral-500">—</p>}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-neutral-900 mb-2">Trois vidéos créateur à commander</div>
                    <div className="grid md:grid-cols-3 gap-3">
                      {(s.audit.briefs || []).map((b: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg border border-neutral-200 bg-white flex flex-col" data-testid="ad-scan-audit-brief">
                          <div className="font-medium text-neutral-900">{b.title}</div>
                          <div className="text-xs text-neutral-600 mt-0.5">{b.angle} · {VIDEO_TYPE[b.videoType] || b.videoType} · {b.duration} s</div>
                          <p className="text-sm text-neutral-700 italic mt-2">« {b.hook} »</p>
                          {b.why && <p className="text-xs text-neutral-500 mt-1">{b.why}</p>}
                          <div className="mt-auto pt-3">{user?.role === 'creator' ? null : <Button size="sm" variant="outline" onClick={() => brief.mutate({ proposal: i })} isLoading={brief.isPending} title="Prépare le brief complet de cette vidéo (consignes, à faire, à éviter, budget estimé), prêt à publier">Créer ce brief <ArrowRight className="w-4 h-4 ml-1" /></Button>}</div>
                        </div>
                      ))}
                      {s.audit.locked?.includes('briefs') && <Link href={signupHref} className="p-3 rounded-lg border border-dashed border-primary-200 bg-primary-50 text-sm text-primary-800 flex items-center gap-2 md:col-span-2"><Lock className="w-4 h-4" /> Deux autres vidéos à commander, les angles et les accroches : créez votre compte gratuit.</Link>}
                    </div>
                  </div>
                  {s.audit.locked?.length > 0 && (
                    <div className="p-4 rounded-lg bg-primary-50 border border-primary-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid="ad-scan-audit-cta">
                      <div className="text-sm text-neutral-800"><span className="font-medium">Voir l&apos;audit complet</span> : angles répétés, angles libres, accroches à tester, trois vidéos à commander.</div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link href={signupHref}><Button size="sm">Créer mon compte gratuit</Button></Link>
                        <span className="text-xs text-neutral-600">Déjà inscrit ? <Link href={loginHref} className="underline text-primary-700">Me connecter</Link></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {!s.insights && s.insightsPending && <Card className="p-6 text-sm text-neutral-700 animate-pulse" data-testid="ad-scan-insights-pending"><BarChart3 className="w-5 h-5 text-primary-600 inline mr-2" />Les publicités sont là ; l&apos;IA les lit (angles, accroches, constats). Une à deux minutes, la page se met à jour toute seule.</Card>}
          {s.insights && (
            <Card className="p-6" data-testid="ad-scan-insights">
              <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-2"><BarChart3 className="w-5 h-5 text-primary-600" /> Ce que disent ces publicités</h3>
              {s.insights.summary && <p className="text-sm text-neutral-700">{s.insights.summary}</p>}
              {s.insights.facts?.length > 0 && <ul className="list-disc pl-5 mt-3 text-sm text-neutral-700 space-y-1">{s.insights.facts.map((f: string, i: number) => <li key={i}>{f}</li>)}</ul>}
              <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm">
                <div>
                  <div className="font-medium text-neutral-900 mb-1">Angles utilisés</div>
                  <ul className="space-y-1 text-neutral-700">{(s.insights.angles || []).map((a: any, i: number) => <li key={i}><span className="font-medium">{a.name}</span> · {a.count} pub{a.count > 1 ? 's' : ''}{a.example ? <span className="block text-xs text-neutral-500 italic">« {a.example} »</span> : null}</li>)}</ul>
                  {s.insights.locked?.includes('angles') && <Locked text="tous les angles avec un exemple cité" href={signupHref} />}
                </div>
                <div>
                  <div className="font-medium text-neutral-900 mb-1">Accroches qui reviennent</div>
                  {s.insights.hooks?.length ? <ul className="space-y-1 text-neutral-700">{s.insights.hooks.map((h: string, i: number) => <li key={i}>« {h} »</li>)}</ul> : s.insights.locked?.includes('hooks') ? <Locked text="les formules qui reviennent" href={signupHref} /> : <p className="text-neutral-500">Aucune formule récurrente relevée.</p>}
                </div>
                <div>
                  <div className="font-medium text-neutral-900 mb-1">Angles que personne n&apos;utilise</div>
                  {s.insights.missing?.length ? <ul className="space-y-1 text-neutral-700">{s.insights.missing.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul> : s.insights.locked?.includes('missing') ? <Locked text="les angles libres, ceux d'une vidéo créateur qui sort du lot" href={signupHref} /> : <p className="text-neutral-500">—</p>}
                </div>
              </div>
              {s.insights.locked?.length > 0 && (
                <div className="mt-5 p-4 rounded-lg bg-primary-50 border border-primary-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-testid="ad-scan-insights-cta">
                  <div className="text-sm text-neutral-800"><span className="font-medium">Voir la lecture complète</span> : tous les angles avec un exemple, les accroches qui reviennent, les angles que personne n&apos;utilise.</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link href={signupHref}><Button size="sm" data-testid="ad-scan-signup">Créer mon compte gratuit</Button></Link>
                    <span className="text-xs text-neutral-600">Déjà inscrit ? <Link href={loginHref} className="underline text-primary-700" data-testid="ad-scan-login">Me connecter</Link></span>
                  </div>
                </div>
              )}
            </Card>
          )}

          {s.ads?.length > 0 && (
            <Card className="p-6" data-testid="ad-scan-ads">
              <h3 className="font-semibold text-neutral-900 mb-1">Les publicités, de la plus ancienne à la plus récente</h3>
              <p className="text-xs text-neutral-500 mb-4">{s.shown} affichée{s.shown > 1 ? 's' : ''} sur {s.kept} gardée{s.kept > 1 ? 's' : ''}{s.totalActive > s.kept ? ` (${s.totalActive} actives chez Meta)` : ''}. Meta ne fournit que le texte : l&apos;aperçu (vidéo, image) s&apos;ouvre dans la bibliothèque.</p>
              <div className="space-y-3">
                {s.ads.map((a: any) => (
                  <div key={a.id} className="p-4 rounded-lg border border-neutral-200 bg-white" data-testid="ad-scan-ad">
                    <div className="flex items-start justify-between gap-3 flex-wrap text-xs text-neutral-600">
                      <div><span className="font-medium text-neutral-900">#{a.index}</span>{a.days != null && <> · tourne depuis <span className={a.days >= 90 ? 'font-semibold text-green-700' : ''}>{a.days} jour{a.days > 1 ? 's' : ''}</span></>}{a.variants > 1 ? ` · ${a.variants} variantes` : ''}{a.platforms?.length ? ` · ${a.platforms.map((p: string) => PLATFORM[p] || p).join(', ')}` : ''}{a.ages ? ` · ${a.ages} ans` : ''}{a.gender && a.gender !== 'All' ? ` · ${GENDER[a.gender] || a.gender}` : ''}{a.reach ? ` · portée ${Number(a.reach).toLocaleString('fr-FR')}` : ''}</div>
                      <div className="flex gap-2">
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">Aperçu Meta <ExternalLink className="w-3 h-3" /></a>
                        {user?.role !== 'creator' && <button type="button" className="underline text-primary-700" onClick={() => { if (!brief.isPending) brief.mutate({ adId: a.id }); }} disabled={brief.isPending} title="Prépare un brief NeedCreator : la version créateur de cette publicité">{brief.isPending && brief.variables?.adId === a.id ? 'Préparation du brief… (jusqu\'à une minute)' : 'l\'équivalent en vidéo créateur'}</button>}
                      </div>
                    </div>
                    {a.title && <div className="font-medium text-neutral-900 mt-2">{a.title}</div>}
                    {a.body && <p className="text-sm text-neutral-700 mt-1 whitespace-pre-line">{a.body}</p>}
                    {(a.description || a.caption) && <div className="text-xs text-neutral-500 mt-1">{[a.description, a.caption].filter(Boolean).join(' · ')}</div>}
                  </div>
                ))}
              </div>
              {s.hidden > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-primary-50 border border-primary-100 text-sm text-neutral-800 flex items-start gap-2" data-testid="ad-scan-locked">
                  <Lock className="w-4 h-4 mt-0.5 text-primary-600" />
                  <div>{s.hidden} autre{s.hidden > 1 ? 's' : ''} publicité{s.hidden > 1 ? 's' : ''}, la lecture complète de l&apos;IA et {s.limits?.memberPerDay} marques par jour avec un compte gratuit. <Link href={signupHref} className="underline text-primary-700 font-medium">Créer mon compte gratuit</Link> · <Link href={loginHref} className="underline">Me connecter</Link></div>
                </div>
              )}
            </Card>
          )}

          <div className="text-xs text-neutral-500 flex items-center justify-between gap-3 flex-wrap">
            <span>Données publiques de la bibliothèque publicitaire Meta (transparence européenne). Constats comptés, sans jugement. Les aperçus restent chez Meta.</span>
            {user?.role !== 'creator' && <button type="button" className="underline" onClick={() => setOptOut(v => !v)}>Vous êtes cette marque et ne voulez pas apparaître ?</button>}
          </div>
          {optOut && user?.role !== 'creator' && (
            <Card className="p-4">
              <form onSubmit={(e) => { e.preventDefault(); sendOptOut.mutate(); }} className="grid sm:grid-cols-3 gap-3 sm:items-end">
                <Input label="Votre email professionnel" type="email" value={optEmail} onChange={(e) => setOptEmail(e.target.value)} />
                <Input label="Motif (facultatif)" value={optReason} onChange={(e) => setOptReason(e.target.value)} />
                <Button type="submit" variant="outline" isLoading={sendOptOut.isPending}>Demander le retrait</Button>
              </form>
            </Card>
          )}
        </div>
      )}

      {!slug && recent?.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-neutral-900 mb-3">{auditView ? 'Voir un exemple avant de lancer le vôtre' : 'Scans déjà faits'}</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
            {recent.map((r: any) => (
              <Link key={r.slug} href={`/publicites/${r.slug}`} className="p-3 rounded-lg border border-neutral-200 hover:border-primary-400 bg-white">
                <div className="font-medium text-neutral-900">{r.pageName}{r.pinned ? <span className="ml-2 text-[10px] uppercase tracking-wide text-primary-600">exemple</span> : null}</div>
                <div className="text-xs text-neutral-600">{r.totalActive} publicité{r.totalActive > 1 ? 's' : ''} active{r.totalActive > 1 ? 's' : ''}{r.oldestDays != null ? ` · la plus ancienne : ${r.oldestDays} j` : ''}</div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100" title={hint}><div className="text-xs text-neutral-600">{label}</div><div className="text-xl font-bold text-neutral-900">{value}</div></div>;
}
function Locked({ text, href }: { text: string; href: string }) {
  return <Link href={href} className="text-xs text-primary-700 hover:underline mt-2 inline-flex items-center gap-1" title="Compte gratuit : la lecture complète de l'IA sur toutes les marques"><Lock className="w-3 h-3" /> Avec un compte gratuit : {text}.</Link>;
}
