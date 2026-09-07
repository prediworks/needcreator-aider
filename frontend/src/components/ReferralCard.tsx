'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Gift, Copy, Users } from 'lucide-react';
import { formatDate } from '@/lib/utils';

/**
 * Programme de parrainage : code, lien à partager, filleuls et récompenses
 */
export default function ReferralCard({ role }: { role: 'brand' | 'creator' }) {
  const { data, isLoading } = useQuery({
    queryKey: ['referral'],
    queryFn: async () => (await api.get('/auth/referral')).data,
  });

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copié !'); } catch { toast.info(text); }
  };

  if (isLoading || !data) return null;
  const t = data.terms || {};

  return (
    <Card className="p-6" id="parrainage">
      <div className="flex items-center gap-2 mb-2">
        <Gift className="w-5 h-5 text-purple-500" />
        <h2 className="text-xl font-semibold text-neutral-900">Parrainage</h2>
      </div>
      <p className="text-sm text-neutral-600 mb-4">
        {role === 'brand'
          ? `Parrainez une marque : elle paie ${t.brandFeePercent}% de commission (au lieu de ${t.standardFeePercent}%) sur sa première campagne, et vous ${t.referrerBrandFeePercent}% sur votre prochaine campagne.`
          : `Parrainez un créateur : vous recevez ${t.creatorBonus} € dès qu'il livre sa première mission.`}
      </p>

      <div className="flex gap-2 flex-wrap items-center mb-4">
        <code className="px-3 py-2 bg-neutral-100 rounded-lg font-mono text-sm">{data.code}</code>
        <Button size="sm" variant="outline" onClick={() => copy(data.code)}><Copy className="w-4 h-4 mr-1" /> Copier le code</Button>
        <Button size="sm" onClick={() => copy(data.link)}><Copy className="w-4 h-4 mr-1" /> Copier mon lien d&apos;invitation</Button>
      </div>

      {role === 'brand' && data.discountedCampaignsLeft > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 mb-4">
          🎁 Votre prochaine campagne bénéficie d&apos;une commission réduite ({data.discountedCampaignsLeft} restante{data.discountedCampaignsLeft > 1 ? 's' : ''}).
        </div>
      )}

      <div className="text-sm">
        <div className="font-medium text-neutral-800 flex items-center gap-1 mb-1"><Users className="w-4 h-4" /> Mes filleuls ({data.referred?.length || 0})</div>
        {data.referred?.length ? (
          <ul className="space-y-1">
            {data.referred.map((r: any) => (
              <li key={r.id} className="flex justify-between border-b border-neutral-100 py-1">
                <span>{r.name} <span className="text-neutral-400">· {r.role === 'brand' ? 'marque' : 'créateur'}</span></span>
                <span className="text-neutral-500">{r.role === 'creator' ? `${r.completedJobs} mission(s)` : formatDate(r.since)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-neutral-500">Personne pour l&apos;instant. Partagez votre lien !</p>}
      </div>
    </Card>
  );
}
