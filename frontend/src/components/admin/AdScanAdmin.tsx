'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

const ACTION: Record<string, string> = { visit: 'visite', scan: 'scan', audit: 'audit', brief: 'brief', rights: 'registre des droits' };
const STATUS: Record<string, string> = { new: 'Nouveau', qualified: 'Qualifié', to_contact: 'À contacter', contacted: 'Contacté', replied: 'A répondu', registered: 'Inscrit', rejected: 'Hors cible', excluded: 'Exclu' };

// Origine d'un scan (journal de 90 jours) : vrais visiteurs, équipe, automatique
const ORIGIN: Record<string, { label: string; cls: string }> = {
  visitor: { label: 'Visiteur', cls: 'bg-green-100 text-green-800' },
  lead: { label: 'Prospect (email)', cls: 'bg-blue-100 text-blue-800' },
  quote: { label: 'Client de devis', cls: 'bg-blue-100 text-blue-800' },
  brand: { label: 'Marque inscrite', cls: 'bg-indigo-100 text-indigo-800' },
  creator: { label: 'Créateur', cls: 'bg-purple-100 text-purple-800' },
  team: { label: 'Équipe', cls: 'bg-neutral-100 text-neutral-600' },
  auto_competitor: { label: 'Auto · concurrent', cls: 'bg-orange-50 text-orange-700' },
  auto_alert: { label: 'Auto · alerte abonnés', cls: 'bg-orange-50 text-orange-700' },
};
const REAL = ['visitor', 'lead', 'quote', 'brand', 'creator'];
const OriginChip = ({ o, n }: { o: string; n?: number }) => <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${ORIGIN[o]?.cls || 'bg-neutral-100 text-neutral-600'}`}>{ORIGIN[o]?.label || o}{n != null ? ` ${n}` : ''}</span>;

/** Requête partagée avec le bouton à compteur de l'outil de prospection */
export function useAdScanStats() {
  return useQuery({ queryKey: ['acq-ad-scans'], queryFn: async () => (await api.get('/admin/acquisition/ad-scans')).data, refetchInterval: 120000 });
}

/**
 * Scan concurrentiel côté équipe : activité de l'outil et marques les plus scannées. Une marque scannée par plusieurs visiteurs intéresse le
 * marché : « Mettre en prospection » crée sa fiche (page Meta, site, annonces, résumé de la lecture IA), avec le contrôle de taille habituel.
 */
/** Abonnés regroupés par marque suivie : une marque suivie par une autre marque est souvent son concurrent */
function followedBrands(rows: any[]) {
  const m = new Map<string, any[]>();
  for (const r of rows) m.set(r.pageName, [...(m.get(r.pageName) || []), r]);
  return [...m.entries()].map(([pageName, list]) => ({ pageName, rows: list })).sort((a, b) => b.rows.length - a.rows.length || a.pageName.localeCompare(b.pageName));
}

export default function AdScanAdmin() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdScanStats();
  const prospect = useMutation({
    mutationFn: async (slug: string) => (await api.post('/admin/acquisition/ad-scans/prospect', { slug })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); queryClient.invalidateQueries({ queryKey: ['acq-ad-scans'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 12000 }),
  });
  const d = data || {};
  const [realOnly, setRealOnly] = useState(true);
  const [byBrand, setByBrand] = useState(false);
  const [journalFilter, setJournalFilter] = useState<'all' | 'real' | 'team' | 'auto'>('all');
  const o24 = d.origins24h || {};
  const top = (d.top || []).filter((s: any) => !realOnly || REAL.some(k => s.origins?.[k]));
  const journal = (d.journal || []).filter((l: any) => journalFilter === 'all' || (journalFilter === 'real' ? REAL.includes(l.origin) : journalFilter === 'team' ? l.origin === 'team' : l.origin.startsWith('auto_')));
  const tiles = [
    { label: 'Scans de visiteurs sur 24 h', value: d.reads24h, hint: `${o24.visitor || 0} visiteurs, ${o24.lead || 0} prospects, ${o24.members || 0} inscrits · hors équipe (${o24.team || 0}) et automatiques (${o24.auto || 0})` },
    { label: 'Marques scannées', value: d.pages, hint: `${d.newPages7d || 0} nouvelles sur 7 jours` },
    { label: 'Consultations', value: d.views },
    { label: 'Briefs « l\'équivalent »', value: d.briefs },
    { label: 'Audits', value: d.audits },
    { label: 'Marques venues de l\'email', value: d.fromEmail?.length, hint: 'liens de l\'email marques' },
    { label: 'Clients de devis', value: d.fromQuotes?.length, hint: 'outils offerts avec un devis' },
    { label: 'Abonnés au rapport', value: d.subscribers?.active, hint: 'rapport par email + alertes' },
  ];
  return (
    <Card className="p-6" data-testid="ad-scan-admin">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Scan concurrentiel</h2>
          <p className="text-sm text-neutral-600">Ce que les visiteurs scannent sur <Link href="/publicites-concurrents" className="underline">/publicites-concurrents</Link> et <Link href="/audit-publicites" className="underline">/audit-publicites</Link>. Une marque scannée par plusieurs visiteurs intéresse le marché : c&apos;est une marque à démarcher. Réglages (paliers, plafonds, exemples épinglés, pages retirées) : Admin → Réglages → Scan concurrentiel.</p>
        </div>
      </div>
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-8 gap-2 mb-4">
            {tiles.map((t) => <div key={t.label} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><div className="text-xs text-neutral-600">{t.label}</div><div className="text-xl font-bold text-neutral-900">{t.value ?? 0}</div>{t.hint && <div className="text-[11px] text-neutral-500">{t.hint}</div>}</div>)}
          </div>
          {d.fromEmail?.length > 0 && (
            <div className="mb-5" data-testid="ad-scan-from-email">
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">Marques venues de l&apos;email</h3>
              <p className="text-xs text-neutral-600 mb-2">Marques prospectées qui ont cliqué sur un lien de l&apos;email (scan d&apos;un concurrent, audit de leurs publicités). Elles s&apos;intéressent au sujet : relancez-les en premier, en citant ce qu&apos;elles ont regardé.</p>
              <ul className="space-y-1 text-sm">
                {d.fromEmail.map((l: any) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1" data-testid="ad-scan-from-email-row">
                    <span className="font-medium text-neutral-900">{l.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">{STATUS[l.status] || l.status}</span>
                    {l.replied && <span className="text-xs text-green-700">a répondu</span>}
                    <span className="text-xs text-neutral-600">{l.visits} action{l.visits > 1 ? 's' : ''} ({l.actions.map((a: string) => ACTION[a] || a).join(', ')}){l.pages.length ? ` · ${l.pages.join(', ')}` : ''} · dernière le {formatDate(l.last)}</span>
                    {l.email && <span className="text-xs text-neutral-500">{l.email}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.subscribers?.rows?.length > 0 && (
            <div className="mb-5" data-testid="ad-scan-subscribers">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <h3 className="text-sm font-semibold text-neutral-900">Abonnés au rapport par email</h3>
                <label className="text-xs text-neutral-600 flex items-center gap-1"><input type="checkbox" checked={byBrand} onChange={(e) => setByBrand(e.target.checked)} data-testid="ad-scan-subscribers-by-brand" /> Regrouper par marque suivie</label>
              </div>
              <p className="text-xs text-neutral-600 mb-2">Ils ont laissé leur adresse sous un scan : rapport envoyé, puis une alerte par semaine au plus quand la marque lance de nouvelles publicités. Les marques sans compte ont une fiche « Nouveau » dans la prospection (à relire avant d&apos;écrire) ; les créateurs et les inscrits n&apos;en ont pas.</p>
              {byBrand ? (
                <ul className="space-y-1 text-sm" data-testid="ad-scan-followed-brands">
                  {followedBrands(d.subscribers.rows).map((b) => (
                    <li key={b.pageName} className="border-b border-neutral-100 py-1">
                      <span className="font-medium text-neutral-900">{b.pageName}</span>
                      <span className="text-xs text-neutral-600"> · suivie par {b.rows.length} : {b.rows.map((r: any) => `${r.lead?.name || r.email} (${r.role === 'brand' ? 'marque' : r.role === 'creator' ? 'créateur' : 'inconnu'}${r.active ? '' : ', désinscrit'})`).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
              <ul className="space-y-1 text-sm">
                {d.subscribers.rows.map((r: any) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1" data-testid="ad-scan-subscriber-row">
                    <span className="font-medium text-neutral-900">{r.email}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.role === 'brand' ? 'bg-blue-100 text-blue-800' : r.role === 'creator' ? 'bg-purple-100 text-purple-800' : 'bg-neutral-100 text-neutral-700'}`}>{r.role === 'brand' ? 'marque' : r.role === 'creator' ? 'créateur' : 'inconnu'}{r.member ? ' · inscrit' : ''}</span>
                    <span className="text-xs text-neutral-600">suit {r.pageName} · {r.sentCount} email{r.sentCount > 1 ? 's' : ''}{r.lastSentAt ? `, le dernier le ${formatDate(r.lastSentAt)}` : ''}{r.active ? '' : ' · désinscrit'}</span>
                    {r.lead && <span className="text-xs text-neutral-500">fiche : {r.lead.name} ({STATUS[r.lead.status] || r.lead.status})</span>}
                  </li>
                ))}
              </ul>
              )}
            </div>
          )}
          {d.fromQuotes?.length > 0 && (
            <div className="mb-5" data-testid="ad-scan-from-quotes">
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">Clients de devis venus des outils</h3>
              <p className="text-xs text-neutral-600 mb-2">Clients d&apos;un devis de créateur qui ont utilisé les outils offerts avec le devis (email ou page du devis). Ce sont des marques qui achètent déjà de la vidéo : à suivre, sans démarcher le client du créateur à sa place.</p>
              <ul className="space-y-1 text-sm">
                {d.fromQuotes.map((q: any) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1" data-testid="ad-scan-from-quotes-row">
                    <span className="font-medium text-neutral-900">{q.company}</span>
                    <span className="text-xs text-neutral-600">devis de {q.creator} · {q.visits} action{q.visits > 1 ? 's' : ''} ({q.actions.map((a: string) => ACTION[a] || a).join(', ')}){q.pages.length ? ` · ${q.pages.join(', ')}` : ''} · dernière le {formatDate(q.last)}</span>
                    {q.email && <span className="text-xs text-neutral-500">{q.email}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-700 mb-2"><input type="checkbox" checked={realOnly} onChange={(e) => setRealOnly(e.target.checked)} data-testid="ad-scan-real-only" /> Vrais visiteurs seulement (sans l&apos;équipe ni les scans automatiques)</label>
          {!top.length ? <p className="text-sm text-neutral-500">{realOnly && d.top?.length ? 'Aucune marque scannée par un vrai visiteur parmi les plus récentes.' : 'Aucun scan pour l\'instant.'}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-neutral-500 border-b"><th className="py-2 pr-3">Marque</th><th className="pr-3" title="Lectures demandées (une par visiteur et par 24 h au plus) ; entre parenthèses, par des inscrits">Scans</th><th className="pr-3">Vues</th><th className="pr-3" title="Briefs « l'équivalent » et audits demandés">Briefs · audits</th><th className="pr-3">Publicités</th><th className="pr-3">Prospection</th></tr></thead>
                <tbody>
                  {top.map((s: any) => (
                    <tr key={s.slug} className="border-b border-neutral-100" data-testid="ad-scan-admin-row">
                      <td className="py-2 pr-3"><Link href={`/publicites/${s.slug}`} className="font-medium text-neutral-900 underline">{s.pageName}</Link>{Object.keys(s.origins || {}).length > 0 && <div className="flex flex-wrap gap-1 mt-1" data-testid="ad-scan-origins">{Object.entries(s.origins).map(([o, n]: any) => <OriginChip key={o} o={o} n={n} />)}</div>}{s.website && <div className="text-xs text-neutral-500">{s.website.replace(/^https?:\/\/(www\.)?/, '')}</div>}<div className="text-[11px] text-neutral-400">lu le {formatDate(s.fetchedAt)}</div></td>
                      <td className="pr-3">{s.scans} <span className="text-xs text-neutral-500">({s.memberScans})</span></td>
                      <td className="pr-3">{s.views}</td>
                      <td className="pr-3">{s.briefs} · {s.audits}</td>
                      <td className="pr-3">{s.status === 'empty' ? <span className="text-neutral-400">aucune</span> : <>{s.totalActive}{s.oldestDays != null ? <span className="text-xs text-neutral-500"> · {s.oldestDays} j</span> : null}</>}</td>
                      <td className="pr-3">{s.lead ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800" title={`Fiche « ${s.lead.name} »`}>{STATUS[s.lead.status] || s.lead.status}</span> : s.status === 'ready' ? <Button size="sm" variant="outline" onClick={() => prospect.mutate(s.slug)} isLoading={prospect.isPending && prospect.variables === s.slug} title="Crée la fiche prospect de cette marque (page Meta, site, annonces, résumé), qualifiée en arrière-plan. Une très grande marque est refusée." data-testid="ad-scan-prospect">Mettre en prospection</Button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.journal?.length > 0 && (
            <div className="mt-6" data-testid="ad-scan-journal">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h3 className="text-sm font-semibold text-neutral-900">Journal des scans (90 jours, 60 derniers)</h3>
                <select value={journalFilter} onChange={(e) => setJournalFilter(e.target.value as any)} className="border border-neutral-300 rounded-lg px-2 py-1 text-xs" data-testid="ad-scan-journal-filter">
                  <option value="all">Tous</option><option value="real">Vrais visiteurs</option><option value="team">Équipe</option><option value="auto">Automatiques</option>
                </select>
              </div>
              <p className="text-xs text-neutral-600 mb-2">« Auto · concurrent » : concurrent préparé pour un email de prospection. « Auto · alerte abonnés » : relecture hebdomadaire pour un abonné au rapport. « relu » : scan de moins de 24 h réaffiché, sans nouvelle lecture chez Meta.</p>
              {!journal.length ? <p className="text-xs text-neutral-500">Rien pour ce filtre.</p> : (
                <ul className="space-y-1 text-sm">
                  {journal.map((l: any, i: number) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1" data-testid="ad-scan-journal-row">
                      <span className="text-xs text-neutral-500 w-28">{new Date(l.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      <OriginChip o={l.origin} />
                      {l.slug ? <Link href={`/publicites/${l.slug}`} className="underline text-neutral-900">{l.pageName || l.slug}</Link> : <span>{l.pageName}</span>}
                      {!l.fresh && <span className="text-xs text-neutral-400">relu</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
