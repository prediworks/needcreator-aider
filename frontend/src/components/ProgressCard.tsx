'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import { LEVELS } from '@/lib/labels';
import { Trophy, GraduationCap } from 'lucide-react';

const PERKS: Record<string, string> = {
  Confirmé: 'badge visible par les marques, accès aux campagnes gifting, meilleur classement dans l\'annuaire',
  Expert: 'badge Expert, tête d\'annuaire, mis en avant sur les devis',
};

/**
 * Objectifs et progression du créateur : niveau suivant, barre, académie. Les missions recommandées sont dans « Vos opportunités ».
 */
export default function ProgressCard({ user }: { user: any }) {
  const stats = user.profile?.stats || {};
  const next = user.nextLevel;
  const level = user.level || 'new';
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
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary-500" /> Académie</h3>
          <div className="mt-1 text-sm text-neutral-700 flex items-center gap-2 flex-wrap">
            <span>{passed}/{required} guides réussis{passed >= required ? ' · badge Formé obtenu' : ' pour le badge « Formé » (+ de visibilité)'}</span>
            <Link href="/academie" className="text-primary-600 underline text-xs">Voir les guides</Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
