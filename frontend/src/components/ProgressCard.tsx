'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { LEVELS } from '@/lib/labels';
import { Trophy, GraduationCap, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const PERKS: Record<string, string> = {
  Confirmé: 'badge visible par les marques, accès aux campagnes gifting, meilleur classement dans l\'annuaire',
  Expert: 'badge Expert, tête d\'annuaire, mis en avant sur les devis',
};

/**
 * Objectifs et progression du créateur : niveau suivant, barre, missions recommandées, académie.
 */
export default function ProgressCard({ user }: { user: any }) {
  const stats = user.profile?.stats || {};
  const next = user.nextLevel;
  const level = user.level || 'new';
  const { data: reco } = useQuery({ queryKey: ['campaigns', 'recommended'], queryFn: async () => (await api.get('/campaigns', { params: { filter: 'recommended', limit: 3 } })).data, staleTime: 120000 });
  const { data: academy } = useQuery({ queryKey: ['academy'], queryFn: async () => (await api.get('/academy')).data, staleTime: 3600000 });
  const passed = (user.profile?.academy || []).filter((a: any) => a.passed).length;
  const required = academy?.required ?? 3;
  const targetJobs = next ? (stats.completedJobs || 0) + next.missingJobs : stats.completedJobs || 0;
  const pctJobs = next ? Math.min(100, Math.round(((stats.completedJobs || 0) / Math.max(1, targetJobs)) * 100)) : 100;
  const ratingOk = !next || !stats.totalReviews || (stats.rating || 0) >= next.minRating;
  return (
    <Card className="p-5 mb-6">
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> Votre progression</h3>
          <div className="text-sm text-neutral-600 mt-1">Niveau actuel : <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVELS[level]?.className || ''}`}>{LEVELS[level]?.label || level}</span></div>
          {next ? (
            <>
              <div className="mt-3 text-sm text-neutral-800">Prochain niveau : <strong>{next.level}</strong> · {PERKS[next.level] || ''}</div>
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden mt-2"><div className="h-full bg-primary-500" style={{ width: `${pctJobs}%` }} /></div>
              <div className="text-xs text-neutral-600 mt-1">
                {stats.completedJobs || 0}/{targetJobs} missions validées{next.missingJobs > 0 ? ` (encore ${next.missingJobs})` : ''} · note ≥ {next.minRating}{stats.totalReviews ? ` (la vôtre : ${(stats.rating || 0).toFixed(1)}${ratingOk ? ' ✓' : ''})` : ' (pas encore d\'avis)'}
              </div>
            </>
          ) : <p className="text-sm text-neutral-700 mt-2">Vous êtes au niveau maximum. Continuez comme ça !</p>}
          <div className="mt-3 text-sm flex items-center gap-2 flex-wrap">
            <GraduationCap className="w-4 h-4 text-primary-500" />
            <span>Académie : {passed}/{required} guides réussis{passed >= required ? ' · badge Formé obtenu' : ' pour le badge « Formé » (+ de visibilité)'}</span>
            <Link href="/academie" className="text-primary-600 underline text-xs">Voir les guides</Link>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900">Missions recommandées pour vous</h3>
          {reco?.campaigns?.length ? (
            <ul className="mt-2 space-y-2">
              {reco.campaigns.slice(0, 3).map((c: any) => (
                <li key={c._id}>
                  <Link href={`/campaigns/${c._id}`} className="flex items-center justify-between gap-2 text-sm border border-neutral-200 rounded-lg px-3 py-2 hover:border-primary-300">
                    <span className="truncate">{c.title}</span>
                    <span className="text-neutral-500 whitespace-nowrap">{c.budget?.total ? formatCurrency(c.budget.total) : 'budget libre'} <ArrowRight className="w-3.5 h-3.5 inline" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-500 mt-2">Aucune campagne ouverte dans vos niches pour l&apos;instant. Élargissez vos niches dans votre profil pour en voir davantage.</p>}
          <Link href="/campaigns" className="inline-block mt-3"><Button size="sm" variant="outline">Toutes les campagnes</Button></Link>
        </div>
      </div>
    </Card>
  );
}
