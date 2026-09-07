'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { usePublicProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import { Stars } from '@/components/ReviewForm';
import { ArrowLeft, Star, Briefcase, Video, Clock } from 'lucide-react';
import Link from 'next/link';
import { NICHES, VIDEO_TYPES, PLATFORMS } from '@/lib/labels';
import { Link2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const creatorId = params.id as string;
  const [typeFilter, setTypeFilter] = useState('');

  const { data, isLoading } = usePublicProfile(creatorId);
  const creator = data?.creator;
  const reviews = data?.reviews || [];
  const realisations: any[] = (data as any)?.realisations || [];

  if (isLoading) return <Spinner />;

  if (!creator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Créateur introuvable</h2>
          <p className="text-neutral-600 mb-4">
            Ce créateur n&apos;existe pas ou son profil n&apos;est pas encore validé
          </p>
          <Link href="/campaigns">
            <Button>Retour aux campagnes</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const portfolio: any[] = creator.profile.portfolio || [];
  const types = Array.from(new Set(portfolio.map((v) => v.videoType).filter(Boolean)));
  const shown = typeFilter ? portfolio.filter((v) => v.videoType === typeFilter) : portfolio;
  const stats = creator.profile.stats || {};

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <Card className="p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {creator.profile.avatar ? (
                    <img
                      src={creator.profile.avatar}
                      alt={creator.profile.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-primary-600">
                      {creator.profile.name[0]}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-neutral-900 mb-2">
                    {creator.profile.name}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-neutral-600 mb-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">
                        {stats.totalReviews ? stats.rating.toFixed(1) : 'Nouveau'}
                      </span>
                      <span className="text-neutral-500">
                        ({stats.totalReviews || 0} avis)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      <span>{stats.completedJobs || 0} mission(s)</span>
                    </div>
                    {creator.profile.pricing?.minPrice && (
                      <div className="text-primary-700 font-medium">
                        dès {creator.profile.pricing.minPrice}€ / vidéo
                      </div>
                    )}
                  </div>
                  {creator.profile.bio && (
                    <p className="text-neutral-700 whitespace-pre-line">{creator.profile.bio}</p>
                  )}
                </div>
              </div>

              {creator.profile.niches?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-neutral-700 mb-2">
                    Spécialités
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {creator.profile.niches.map((niche: string) => (
                      <span
                        key={niche}
                        className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm"
                      >
                        {NICHES[niche] || niche}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Portfolio */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Portfolio ({portfolio.length} vidéo{portfolio.length > 1 ? 's' : ''})
                </h2>
                {types.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setTypeFilter('')}
                      className={cn('px-3 py-1 rounded-full text-xs', !typeFilter ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700')}
                    >
                      Tous
                    </button>
                    {types.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className={cn('px-3 py-1 rounded-full text-xs', typeFilter === t ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700')}
                      >
                        {VIDEO_TYPES[t] || t}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {shown.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {shown.map((video: any, index: number) => (
                    <div
                      key={video._id || index}
                      className="border border-neutral-200 rounded-lg overflow-hidden hover:border-primary-500 transition"
                    >
                      <VideoPlayer src={video.videoUrl} poster={video.thumbnail} title={video.title} className="rounded-none" />
                      <div className="p-4">
                        <h4 className="font-medium text-neutral-900 mb-1">
                          {video.title}
                        </h4>
                        {video.description && (
                          <p className="text-sm text-neutral-600 mb-2 line-clamp-2">
                            {video.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">
                            {VIDEO_TYPES[video.videoType] || video.videoType}
                          </span>
                          {video.stats?.views && (
                            <span className="text-xs text-neutral-500">
                              {video.stats.views.toLocaleString()} vues
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500">
                  <Video className="w-16 h-16 mx-auto mb-4 text-neutral-300" />
                  <p>Aucune vidéo dans le portfolio</p>
                </div>
              )}
            </Card>

            {/* Réalisations (liens de livraisons publiques) */}
            {realisations.length > 0 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-1">Réalisations pour des marques ({realisations.length})</h2>
                <p className="text-sm text-neutral-500 mb-4">Vidéos livrées via NeedCreator et publiées avec l&apos;accord de la marque.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {realisations.map((r: any) => (
                    <a key={r._id} href={r.url} target="_blank" rel="noopener noreferrer" className="border border-neutral-200 rounded-lg p-3 hover:border-primary-500 transition flex items-start gap-3">
                      <Link2 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-neutral-900 truncate">{r.title}</div>
                        <div className="text-xs text-neutral-500">{r.brandName} · {PLATFORMS[r.platform] || r.platform}{r.videoType ? ` · ${VIDEO_TYPES[r.videoType] || r.videoType}` : ''}{!r.isPublic ? ' · privé (visible par vous)' : ''}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {/* Avis */}
            {reviews.length > 0 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">Avis des marques</h2>
                <div className="space-y-4">
                  {reviews.map((r: any) => (
                    <div key={r._id} className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-neutral-900">{r.reviewerId?.profile?.companyName || r.reviewerId?.profile?.name || 'Marque'}</span>
                        <Stars value={r.rating} size="w-4 h-4" />
                      </div>
                      <p className="text-xs text-neutral-500 mb-1">{r.campaignId?.title} · {formatDate(r.createdAt)}</p>
                      {r.comment && <p className="text-neutral-700">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Statistiques</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-neutral-600">Note moyenne</span>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-semibold">
                        {stats.totalReviews ? stats.rating.toFixed(1) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500"
                      style={{ width: `${((stats.rating || 0) / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Missions complétées</span>
                    <span className="font-semibold">{stats.completedJobs || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Avis reçus</span>
                    <span className="font-semibold">{stats.totalReviews || 0}</span>
                  </div>
                  {stats.onTimeDeliveryRate != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Livraison à temps</span>
                      <span className="font-semibold text-green-600">{stats.onTimeDeliveryRate}%</span>
                    </div>
                  )}
                  {stats.responseTimeHours != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Temps de réponse</span>
                      <span className="font-semibold">{stats.responseTimeHours}h</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-600">Membre depuis</span>
                    <span className="font-semibold">{creator.createdAt ? formatDate(creator.createdAt) : '—'}</span>
                  </div>
                </div>
              </div>
            </Card>

            {user?.role !== 'creator' && (
              <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-4">
                  Travailler ensemble
                </h3>
                <p className="text-sm text-neutral-600 mb-4">
                  Créez une campagne dans ses niches : ce créateur sera notifié et pourra candidater.
                </p>
                <Link href="/campaigns/new">
                  <Button className="w-full">
                    Créer une campagne
                  </Button>
                </Link>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
