'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRequireAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import CreatorCard from '@/components/CreatorCard';
import { NICHES, NICHE_OPTIONS, PLATFORMS, LEVELS } from '@/lib/labels';
import { Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CreatorsPage() {
  const { ready } = useRequireAuth({ roles: ['brand', 'admin'] });
  const [tab, setTab] = useState<'all' | 'collaborated'>('all');
  const [q, setQ] = useState('');
  const [niches, setNiches] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('');
  const [level, setLevel] = useState('');
  const [network, setNetwork] = useState('');
  const [minFollowers, setMinFollowers] = useState('');
  const [sort, setSort] = useState('rating');
  const [page, setPage] = useState(1);

  const params = {
    q: q || undefined,
    niches: niches.length ? niches.join(',') : undefined,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    minRating: minRating || undefined,
    level: level || undefined,
    network: network || undefined,
    minFollowers: minFollowers || undefined,
    collaborated: tab === 'collaborated' ? 'true' : undefined,
    sort,
    page,
    limit: 12,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['creators', params],
    queryFn: async () => (await api.get('/creators', { params })).data,
    enabled: ready,
  });

  if (!ready) return <Spinner />;

  const toggleNiche = (n: string) => { setPage(1); setNiches(niches.includes(n) ? niches.filter(x => x !== n) : [...niches, n]); };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Créateurs</h1>
          <p className="text-neutral-600">Trouvez des créateurs vérifiés, regardez leur portfolio et invitez-les sur vos campagnes.</p>
        </div>

        <div className="flex gap-2 mb-6">
          {[
            { key: 'all', label: 'Tous les créateurs' },
            { key: 'collaborated', label: `Mes collaborateurs${data?.collaboratorsCount ? ` (${data.collaboratorsCount})` : ''}` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key as any); setPage(1); }}
              className={cn('px-4 py-2 rounded-full text-sm font-medium transition', tab === t.key ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700 hover:border-primary-300')}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card className="p-4 mb-6 space-y-3">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <Input placeholder="Nom, bio, pseudo…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-10" />
            </div>
            <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} className="px-3 py-2 border border-neutral-300 rounded-lg">
              <option value="">Tous les niveaux</option>
              {Object.entries(LEVELS).map(([v, l]) => <option key={v} value={v}>{l.label}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2 border border-neutral-300 rounded-lg">
              <option value="rating">Mieux notés</option>
              <option value="price">Prix croissant</option>
              <option value="followers">Plus d&apos;abonnés</option>
              <option value="recent">Plus récents</option>
            </select>
          </div>
          <div className="grid md:grid-cols-5 gap-3">
            <Input type="number" placeholder="Prix min €" value={minPrice} onChange={(e) => { setMinPrice(e.target.value); setPage(1); }} />
            <Input type="number" placeholder="Prix max €" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPage(1); }} />
            <select value={minRating} onChange={(e) => { setMinRating(e.target.value); setPage(1); }} className="px-3 py-2 border border-neutral-300 rounded-lg">
              <option value="">Toute note</option>
              <option value="4">≥ 4 ★</option>
              <option value="4.5">≥ 4,5 ★</option>
            </select>
            <select value={network} onChange={(e) => { setNetwork(e.target.value); setPage(1); }} className="px-3 py-2 border border-neutral-300 rounded-lg">
              <option value="">Tout réseau</option>
              {['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x'].map((p) => <option key={p} value={p}>{PLATFORMS[p]}</option>)}
            </select>
            <Input type="number" placeholder="Abonnés min" value={minFollowers} onChange={(e) => { setMinFollowers(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-wrap gap-2">
            {NICHE_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => toggleNiche(n)} className={cn('px-3 py-1 rounded-full text-xs transition', niches.includes(n) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}>
                {NICHES[n]}
              </button>
            ))}
          </div>
        </Card>

        {isLoading ? (
          <Spinner fullScreen={false} />
        ) : data?.creators?.length ? (
          <>
            <p className="text-sm text-neutral-500 mb-3">{data.pagination.total} créateur(s)</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.creators.map((c: any) => <CreatorCard key={c.id} creator={c} />)}
            </div>
            {data.pagination.pages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: data.pagination.pages }, (_, i) => i + 1).map((p) => (
                  <Button key={p} size="sm" variant={p === page ? 'primary' : 'outline'} onClick={() => setPage(p)}>{p}</Button>
                ))}
              </div>
            )}
          </>
        ) : (
          <Card className="p-12 text-center">
            <Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-600">{tab === 'collaborated' ? 'Vous n\'avez pas encore collaboré avec un créateur.' : 'Aucun créateur ne correspond à ces critères.'}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
