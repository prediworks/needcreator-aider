'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

const STATUS: Record<string, string> = { new: 'Nouveau', qualified: 'Qualifié', to_contact: 'À contacter', contacted: 'Contacté', replied: 'A répondu', registered: 'Inscrit', rejected: 'Hors cible', excluded: 'Exclu' };

/** Requête partagée avec le bouton à compteur de l'outil de prospection */
export function useAdScanStats() {
  return useQuery({ queryKey: ['acq-ad-scans'], queryFn: async () => (await api.get('/admin/acquisition/ad-scans')).data, refetchInterval: 120000 });
}

/**
 * Scan concurrentiel côté équipe : activité de l'outil et marques les plus scannées. Une marque scannée par plusieurs visiteurs intéresse le
 * marché : « Mettre en prospection » crée sa fiche (page Meta, site, annonces, résumé de la lecture IA), avec le contrôle de taille habituel.
 */
export default function AdScanAdmin() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdScanStats();
  const prospect = useMutation({
    mutationFn: async (slug: string) => (await api.post('/admin/acquisition/ad-scans/prospect', { slug })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); queryClient.invalidateQueries({ queryKey: ['acq-ad-scans'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 12000 }),
  });
  const d = data || {};
  const tiles = [
    { label: 'Lectures sur 24 h', value: d.reads24h, hint: `dont ${d.members24h || 0} par des inscrits` },
    { label: 'Marques scannées', value: d.pages, hint: `${d.newPages7d || 0} nouvelles sur 7 jours` },
    { label: 'Consultations', value: d.views },
    { label: 'Briefs « l\'équivalent »', value: d.briefs },
    { label: 'Audits', value: d.audits },
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            {tiles.map((t) => <div key={t.label} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><div className="text-xs text-neutral-600">{t.label}</div><div className="text-xl font-bold text-neutral-900">{t.value ?? 0}</div>{t.hint && <div className="text-[11px] text-neutral-500">{t.hint}</div>}</div>)}
          </div>
          {!(d.top?.length) ? <p className="text-sm text-neutral-500">Aucun scan pour l&apos;instant.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-neutral-500 border-b"><th className="py-2 pr-3">Marque</th><th className="pr-3" title="Lectures demandées (une par visiteur et par 24 h au plus) ; entre parenthèses, par des inscrits">Scans</th><th className="pr-3">Vues</th><th className="pr-3" title="Briefs « l'équivalent » et audits demandés">Briefs · audits</th><th className="pr-3">Publicités</th><th className="pr-3">Prospection</th></tr></thead>
                <tbody>
                  {d.top.map((s: any) => (
                    <tr key={s.slug} className="border-b border-neutral-100" data-testid="ad-scan-admin-row">
                      <td className="py-2 pr-3"><Link href={`/publicites/${s.slug}`} className="font-medium text-neutral-900 underline">{s.pageName}</Link>{s.website && <div className="text-xs text-neutral-500">{s.website.replace(/^https?:\/\/(www\.)?/, '')}</div>}<div className="text-[11px] text-neutral-400">lu le {formatDate(s.fetchedAt)}</div></td>
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
        </>
      )}
    </Card>
  );
}
