'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { NICHES, NICHE_OPTIONS, LEVELS } from '@/lib/labels';
import { Star, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Créateurs inscrits et vérifiés ayant accepté d'apparaître sur le site public (première vidéo de portfolio)
 */
export default function PublicCreatorsList({ featuredOnly = false, limit = 24 }: { featuredOnly?: boolean; limit?: number }) {
  const [niche, setNiche] = useState('');
  const [page, setPage] = useState(1);
  const params = { niche: niche || undefined, featured: featuredOnly ? '1' : undefined, page, limit };
  const { data, isLoading } = useQuery({ queryKey: ['public-creators', params], queryFn: async () => (await api.get('/creators/public', { params })).data });

  return (
    <div>
      {!featuredOnly && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button type="button" onClick={() => { setNiche(''); setPage(1); }} className={cn('px-3 py-1 rounded-full text-sm', !niche ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700')}>Toutes les niches</button>
          {NICHE_OPTIONS.map((n) => (
            <button key={n} type="button" onClick={() => { setNiche(n); setPage(1); }} className={cn('px-3 py-1 rounded-full text-sm', niche === n ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700')}>{NICHES[n]}</button>
          ))}
        </div>
      )}
      {isLoading ? <Spinner fullScreen={false} /> : !data?.creators?.length ? (
        <Card className="p-10 text-center"><Users className="w-10 h-10 text-neutral-300 mx-auto mb-2" /><p className="text-neutral-600">{featuredOnly ? 'Nos premiers Ambassadeurs arrivent.' : 'Aucun créateur pour cette niche pour le moment.'}</p></Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.creators.map((c: any) => (
              <Card key={c.id} className="overflow-hidden flex flex-col">
                {c.video?.url ? (
                  <video src={c.video.url} controls preload="metadata" playsInline className="w-full aspect-[9/16] max-h-80 object-cover bg-black" />
                ) : (
                  <div className="w-full h-40 bg-neutral-100" />
                )}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/profile/${c.id}`} className="font-semibold text-neutral-900 hover:text-primary-600">{c.name}</Link>
                    {c.isAmbassador && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">🌟 Ambassadeur</span>}
                  </div>
                  <div className="text-xs text-neutral-500">{LEVELS?.[c.level]?.label || c.level}{c.completedJobs ? ` · ${c.completedJobs} mission(s)` : ''}{c.rating ? <span className="inline-flex items-center gap-1 ml-1"><Star className="w-3 h-3 text-yellow-500" />{c.rating.toFixed(1)}</span> : null}</div>
                  <div className="flex flex-wrap gap-1">{(c.niches || []).map((n: string) => <span key={n} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 text-xs">{NICHES[n] || n}</span>)}</div>
                  {c.bio && <p className="text-sm text-neutral-600 line-clamp-3">{c.bio}</p>}
                  <Link href="/register?role=brand" className="mt-auto"><Button size="sm" variant="outline" className="w-full">Collaborer avec {c.name.split(' ')[0]}</Button></Link>
                </div>
              </Card>
            ))}
          </div>
          {!featuredOnly && data.pagination.pages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: data.pagination.pages }, (_, i) => i + 1).map((p) => <Button key={p} size="sm" variant={p === page ? 'primary' : 'outline'} onClick={() => setPage(p)}>{p}</Button>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
