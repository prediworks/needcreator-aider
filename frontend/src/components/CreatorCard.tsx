'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LevelBadges from '@/components/LevelBadges';
import SocialIcons, { formatFollowers } from '@/components/SocialIcons';
import InviteCreatorButton from '@/components/InviteCreatorButton';
import { NICHES } from '@/lib/labels';
import { Star, Briefcase, Video, Users } from 'lucide-react';

export default function CreatorCard({ creator }: { creator: any }) {
  const stats = creator.stats || {};
  return (
    <Card className="p-5 flex flex-col hover:shadow-lg transition">
      <div className="flex items-start gap-3 mb-3">
        <Link href={`/profile/${creator.id}`} className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
          {creator.avatar ? <img src={creator.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-xl font-bold text-primary-600">{creator.name?.[0]}</span>}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/profile/${creator.id}`} className="font-semibold text-neutral-900 hover:text-primary-600 block truncate">{creator.name}</Link>
          <LevelBadges badges={creator.badges} size="xs" className="mt-1" />
          {creator.collaborated && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Déjà collaboré</span>}
        </div>
        {creator.minPrice && (
          <div className="text-right">
            <div className="text-primary-600 font-bold">{creator.minPrice}€</div>
            <div className="text-[10px] text-neutral-500">min / vidéo</div>
          </div>
        )}
      </div>

      {creator.bio && <p className="text-sm text-neutral-600 line-clamp-2 mb-3">{creator.bio}</p>}

      <div className="flex flex-wrap gap-1 mb-3">
        {(creator.niches || []).slice(0, 4).map((n: string) => (
          <span key={n} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full text-xs">{NICHES[n] || n}</span>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs text-neutral-600 mb-3 flex-wrap">
        <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />{stats.totalReviews ? `${stats.rating.toFixed(1)} (${stats.totalReviews})` : 'Nouveau'}</span>
        <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{stats.completedJobs || 0} mission(s)</span>
        <span className="flex items-center gap-1"><Video className="w-3.5 h-3.5" />{creator.portfolioCount} vidéo(s)</span>
        {stats.totalFollowers ? <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{formatFollowers(stats.totalFollowers)} abonnés</span> : null}
      </div>

      <div className="mb-4"><SocialIcons socials={creator.socials} size="sm" /></div>

      <div className="mt-auto flex gap-2">
        <Link href={`/profile/${creator.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">Voir le profil</Button>
        </Link>
        <InviteCreatorButton creatorId={creator.id} creatorName={creator.name} size="sm" />
      </div>
    </Card>
  );
}
