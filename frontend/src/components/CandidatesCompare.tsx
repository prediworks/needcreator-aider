'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import LevelBadges from '@/components/LevelBadges';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { formatCurrency } from '@/lib/utils';
import { RIGHTS_DURATION, RIGHTS_SUPPORTS, PLATFORMS } from '@/lib/labels';
import { X } from 'lucide-react';

/**
 * Comparateur de candidats (marque) : jusqu'à 4 devis côte à côte, meilleure valeur surlignée par ligne.
 */
export default function CandidatesCompare({ applications, deliverables, onRemove, onSelect, canSelect, isGifting }: {
  applications: any[]; deliverables: number; onRemove: (id: string) => void; onSelect: (creatorId: string, name: string, price: number) => void; canSelect: boolean; isGifting: boolean;
}) {
  const cfg = usePublicConfig();
  if (!applications.length) return null;
  const idOf = (a: any) => a.creatorId?._id || a.creatorId;
  const ttc = (a: any) => a.price * (1 + (a.quote?.vatRate || 0) / 100);
  const rev = (a: any) => a.quote?.revisions ?? cfg.maxRevisions;
  const rating = (a: any) => (a.creatorId?.profile?.stats?.totalReviews ? a.creatorId.profile.stats.rating : null);
  const durationRank: Record<string, number> = { '6m': 1, '1y': 2, '2y': 3, '3y': 4, unlimited: 5 };
  const available = (a: any) => { const u = a.creatorId?.profile?.availability?.unavailableUntil; return !(u && new Date(u) > new Date()); };

  // Meilleure valeur par ligne (min pour prix/délai, max pour le reste) ; ex æquo : tous surlignés
  const best = (values: (number | null)[], mode: 'min' | 'max') => {
    const nums = values.filter((v): v is number => v != null);
    if (nums.length < 2) return values.map(() => false);
    const target = mode === 'min' ? Math.min(...nums) : Math.max(...nums);
    return values.map((v) => v != null && v === target && nums.some((n) => n !== target));
  };
  const rows: { label: string; cells: (string | JSX.Element)[]; hl: boolean[] }[] = [];
  const add = (label: string, render: (a: any) => string | JSX.Element, metric?: { get: (a: any) => number | null; mode: 'min' | 'max' }) => {
    rows.push({ label, cells: applications.map(render), hl: metric ? best(applications.map(metric.get), metric.mode) : applications.map(() => false) });
  };
  add('Score de matching', (a) => `${a.matchScore ?? 0} %`, { get: (a) => a.matchScore ?? 0, mode: 'max' });
  if (!isGifting) {
    add('Prix HT', (a) => formatCurrency(a.price), { get: (a) => a.price, mode: 'min' });
    add('Prix TTC (payé)', (a) => `${formatCurrency(ttc(a))}${a.quote?.vatRate ? '' : ' (pas de TVA)'}`, { get: (a) => ttc(a), mode: 'min' });
    add('Par vidéo (HT)', (a) => formatCurrency(a.price / (deliverables || 1)), { get: (a) => a.price / (deliverables || 1), mode: 'min' });
  }
  add('Délai de livraison', (a) => `${a.estimatedDeliveryDays} j`, { get: (a) => a.estimatedDeliveryDays, mode: 'min' });
  add('Révisions incluses', (a) => String(rev(a)), { get: (a) => rev(a), mode: 'max' });
  add('Durée des droits', (a) => RIGHTS_DURATION[a.quote?.rights?.duration] || '1 an', { get: (a) => durationRank[a.quote?.rights?.duration || '1y'], mode: 'max' });
  add('Supports cédés', (a) => (a.quote?.rights?.supports || []).map((s: string) => RIGHTS_SUPPORTS[s]?.split(' (')[0] || s).join(', ') || 'Réseaux sociaux', { get: (a) => (a.quote?.rights?.supports || ['social_organic']).length, mode: 'max' });
  add('Territoire · exclusivité', (a) => `${a.quote?.rights?.territories || 'France'}${a.quote?.rights?.exclusivity ? ` · exclusivité ${a.quote.rights.exclusivityMonths || ''} mois` : ''}`);
  add('Note', (a) => (rating(a) != null ? `${rating(a)!.toFixed(1)} / 5 (${a.creatorId.profile.stats.totalReviews} avis)` : 'Nouveau créateur'), { get: (a) => rating(a), mode: 'max' });
  add('Missions terminées', (a) => String(a.creatorId?.profile?.stats?.completedJobs || 0), { get: (a) => a.creatorId?.profile?.stats?.completedJobs || 0, mode: 'max' });
  add('Niveau et badges', (a) => <LevelBadges badges={a.creatorId?.badges} size="xs" />);
  add('Disponibilité', (a) => (available(a) ? 'Disponible' : `Indisponible jusqu'au ${new Date(a.creatorId.profile.availability.unavailableUntil).toLocaleDateString('fr-FR')}`), { get: (a) => (available(a) ? 1 : 0), mode: 'max' });
  add('Livraison', (a) => `${(a.quote?.deliveryTypes || []).map((t: string) => (t === 'file' ? 'fichier' : 'lien')).join(' ou ') || 'fichier'}${a.quote?.platforms?.length ? ` · ${a.quote.platforms.map((p: string) => PLATFORMS[p]).join(', ')}` : ''}`);
  add('Conditions', (a) => a.quote?.terms || '—');

  return (
    <div className="mb-6 border border-primary-200 rounded-lg overflow-hidden" data-testid="candidates-compare">
      <div className="bg-primary-50 px-4 py-2 text-sm text-neutral-700">Comparatif : la meilleure valeur de chaque ligne est surlignée. Le score de matching reste le meilleur résumé, le prix n&apos;est qu&apos;un critère.</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50">
              <th className="text-left p-3 w-40 text-neutral-500 font-medium">Critère</th>
              {applications.map((a) => (
                <th key={idOf(a)} className="text-left p-3 min-w-[180px] align-top">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-neutral-900">{a.creatorId?.profile?.name || 'Créateur'}</div>
                      <Link href={`/profile/${idOf(a)}`} className="text-xs text-primary-600 underline">Portfolio</Link>
                    </div>
                    <button type="button" onClick={() => onRemove(idOf(a))} className="text-neutral-400 hover:text-neutral-700" aria-label="Retirer du comparatif"><X className="w-4 h-4" /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-neutral-100">
                <td className="p-3 text-neutral-500 align-top">{r.label}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className={`p-3 align-top ${r.hl[i] ? 'bg-green-50 text-green-900 font-medium' : 'text-neutral-800'}`}>{c}</td>
                ))}
              </tr>
            ))}
            {canSelect && (
              <tr className="border-t border-neutral-200 bg-neutral-50">
                <td className="p-3" />
                {applications.map((a) => (
                  <td key={idOf(a)} className="p-3">
                    {a.status === 'pending' ? (
                      <Button size="sm" onClick={() => onSelect(idOf(a), a.creatorId?.profile?.name || 'ce créateur', a.price)}>{isGifting ? 'Sélectionner' : 'Accepter ce devis'}</Button>
                    ) : null}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
