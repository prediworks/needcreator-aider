'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { usePublicProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import { Stars } from '@/components/ReviewForm';
import LevelBadges from '@/components/LevelBadges';
import SocialIcons, { PlatformIcon, formatFollowers } from '@/components/SocialIcons';
import InviteCreatorButton from '@/components/InviteCreatorButton';
import ReportButton from '@/components/ReportButton';
import { ArrowLeft, Star, Briefcase, Video, Clock, Users, Link2 } from 'lucide-react';
import Link from 'next/link';
import { NICHES, VIDEO_TYPES, PLATFORMS } from '@/lib/labels';
import { formatDate, cn } from '@/lib/utils';

const PAGE_SIZE = 12;

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const creatorId = params.id as string;
  const [tab, setTab] = useState<'portfolio' | 'realisations' | 'reviews'>('portfolio');
  const [typeFilter, setTypeFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = usePublicProfile(creatorId);
  const creator = data?.creator;
  const reviews = data?.reviews || [];
  const realisations: any[] = useMemo(() => (data as any)?.realisations || [], [data]);
  const collaborated = !!(data as any)?.collaborated;

  const realPlatforms = useMemo(() => Array.from(new Set(realisations.map((r) => r.platform).filter(Boolean))), [realisations]);
  const filteredReal = platformFilter ? realisations.filter((r) => r.platform === platformFilter) : realisations;
  const pages = Math.max(1, Math.ceil(filteredReal.length / PAGE_SIZE));
  const pageItems = filteredReal.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) return <Spinner />;

  if (!creator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Créateur introuvable</h2>
          <p className="text-neutral-600 mb-4">Ce créateur n&apos;existe pas ou son profil n&apos;est pas encore validé</p>
          <Link href="/campaigns"><Button>Retour aux campagnes</Button></Link>
        </Card>
      </div>
    );
  }

  const portfolio: any[] = creator.profile.portfolio || [];
  const types = Array.from(new Set(portfolio.map((v) => v.videoType).filter(Boolean)));
  const shownPortfolio = typeFilter ? portfolio.filter((v) => v.videoType === typeFilter) : portfolio;
  const stats = creator.profile.stats || {};
  const socials: any[] = creator.profile.socials || [];
  const totalFollowers = socials.reduce((a, s) => a + (s.followers || 0), 0);

  const tabs = [
    { key: 'portfolio', label: `Portfolio (${portfolio.length})` },
    { key: 'realisations', label: `Réalisations (${realisations.length})` },
    { key: 'reviews', label: `Avis (${reviews.length})` },
  ] as const;

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour
        </Button>

        {/* En-tête */}
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {creator.profile.avatar ? (
                <img src={creator.profile.avatar} alt={creator.profile.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-primary-600">{creator.profile.name[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-neutral-900">{creator.profile.name}</h1>
                <LevelBadges badges={creator.badges} />
                {collaborated && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Vous avez déjà collaboré</span>}
              </div>
              <div className="flex items-center gap-4 text-sm text-neutral-600 mb-3 flex-wrap">
                <span className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /><strong>{stats.totalReviews ? stats.rating.toFixed(1) : 'Nouveau'}</strong> ({stats.totalReviews || 0} avis)</span>
                <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" />{stats.completedJobs || 0} mission(s)</span>
                {totalFollowers > 0 && <span className="flex items-center gap-1"><Users className="w-4 h-4" />{formatFollowers(totalFollowers)} abonnés cumulés</span>}
                {creator.profile.pricing?.minPrice && <span className="text-primary-700 font-medium">dès {creator.profile.pricing.minPrice}€ / vidéo</span>}
              </div>
              {creator.profile.bio && <p className="text-neutral-700 whitespace-pre-line mb-3">{creator.profile.bio}</p>}
              <div className="flex flex-wrap gap-2 mb-3">
                {(creator.profile.niches || []).map((niche: string) => (
                  <span key={niche} className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">{NICHES[niche] || niche}</span>
                ))}
              </div>
              <SocialIcons socials={socials} />
            </div>
            {user?.role === 'brand' && (
              <div className="flex flex-col gap-2 w-full sm:w-auto">
                <InviteCreatorButton creatorId={creator.id || creator._id} creatorName={creator.profile.name} />
                <Link href="/campaigns/new"><Button variant="outline" className="w-full">Créer une campagne</Button></Link>
                <ReportButton targetType="user" targetId={creator.id || creator._id} />
              </div>
            )}
          </div>
        </Card>

        {/* Réseaux détaillés */}
        {socials.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {socials.map((s: any, i: number) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="bg-white border border-neutral-200 rounded-lg p-3 hover:border-primary-400 transition">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-900"><PlatformIcon platform={s.network} /> {PLATFORMS[s.network] || s.network}</div>
                <div className="text-xs text-neutral-500 truncate">{s.handle || s.url}</div>
                <div className="mt-1 text-sm text-neutral-800">
                  {s.followers ? <><strong>{formatFollowers(s.followers)}</strong> abonnés</> : <span className="text-neutral-400">abonnés non renseignés</span>}
                  {s.avgViews ? <span className="text-neutral-500"> · {formatFollowers(s.avgViews)} vues moy.</span> : null}
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Onglets */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={cn('px-4 py-2 rounded-full text-sm font-medium transition', tab === t.key ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700 hover:border-primary-300')}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'portfolio' && (
              <Card className="p-6">
                {types.length > 1 && (
                  <div className="flex gap-2 flex-wrap mb-4">
                    <button onClick={() => setTypeFilter('')} className={cn('px-3 py-1 rounded-full text-xs', !typeFilter ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700')}>Tous</button>
                    {types.map((t) => (
                      <button key={t} onClick={() => setTypeFilter(t)} className={cn('px-3 py-1 rounded-full text-xs', typeFilter === t ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700')}>{VIDEO_TYPES[t] || t}</button>
                    ))}
                  </div>
                )}
                {shownPortfolio.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {shownPortfolio.map((video: any, index: number) => (
                      <div key={video._id || index} className="border border-neutral-200 rounded-lg overflow-hidden hover:border-primary-500 transition">
                        <VideoPlayer src={video.videoUrl} poster={video.thumbnail} title={video.title} className="rounded-none" />
                        <div className="p-4">
                          <h4 className="font-medium text-neutral-900 mb-1">{video.title}</h4>
                          {video.description && <p className="text-sm text-neutral-600 mb-2 line-clamp-2">{video.description}</p>}
                          <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">{VIDEO_TYPES[video.videoType] || video.videoType}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-neutral-500"><Video className="w-16 h-16 mx-auto mb-4 text-neutral-300" /><p>Aucune vidéo dans le portfolio</p></div>
                )}
              </Card>
            )}

            {tab === 'realisations' && (
              <Card className="p-6">
                <p className="text-sm text-neutral-500 mb-4">Vidéos publiées pour des marques, sur NeedCreator (avec l&apos;accord de la marque) et en dehors.</p>
                {realPlatforms.length > 1 && (
                  <div className="flex gap-2 flex-wrap mb-4">
                    <button onClick={() => { setPlatformFilter(''); setPage(1); }} className={cn('px-3 py-1 rounded-full text-xs', !platformFilter ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700')}>Tous</button>
                    {realPlatforms.map((p) => (
                      <button key={p} onClick={() => { setPlatformFilter(p); setPage(1); }} className={cn('px-3 py-1 rounded-full text-xs', platformFilter === p ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700')}>{PLATFORMS[p] || p}</button>
                    ))}
                  </div>
                )}
                {pageItems.length ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {pageItems.map((r: any, i: number) => (
                        <a key={r._id || i} href={r.url} target="_blank" rel="noopener noreferrer" className="border border-neutral-200 rounded-lg p-3 hover:border-primary-500 transition flex items-start gap-3">
                          <PlatformIcon platform={r.platform} className="text-xl" />
                          <div className="min-w-0">
                            <div className="font-medium text-neutral-900 truncate">{r.title || r.url}</div>
                            <div className="text-xs text-neutral-500">
                              {r.brandName ? `${r.brandName} · ` : ''}{PLATFORMS[r.platform] || r.platform}
                              {r.source === 'delivery' ? ' · via NeedCreator' : ''}{r.isPublic === false ? ' · privé' : ''}
                              {r.date ? ` · ${formatDate(r.date)}` : ''}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                    {pages > 1 && (
                      <div className="mt-6 flex justify-center gap-2 flex-wrap">
                        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                          <Button key={p} size="sm" variant={p === page ? 'primary' : 'outline'} onClick={() => setPage(p)}>{p}</Button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-neutral-500"><Link2 className="w-16 h-16 mx-auto mb-4 text-neutral-300" /><p>Aucune réalisation publiée</p></div>
                )}
              </Card>
            )}

            {tab === 'reviews' && (
              <Card className="p-6">
                {reviews.length ? (
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
                ) : (
                  <p className="text-center py-12 text-neutral-500">Aucun avis pour le moment</p>
                )}
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Statistiques</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-neutral-600">Note moyenne</span>
                    <span className="font-semibold flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />{stats.totalReviews ? stats.rating.toFixed(1) : '—'}</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden"><div className="h-full bg-yellow-500" style={{ width: `${((stats.rating || 0) / 5) * 100}%` }}></div></div>
                </div>
                <div className="pt-3 border-t border-neutral-200 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-neutral-600">Missions complétées</span><span className="font-semibold">{stats.completedJobs || 0}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-600">Avis reçus</span><span className="font-semibold">{stats.totalReviews || 0}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-600">Réalisations</span><span className="font-semibold">{realisations.length}</span></div>
                  {totalFollowers > 0 && <div className="flex justify-between"><span className="text-neutral-600">Abonnés cumulés</span><span className="font-semibold">{formatFollowers(totalFollowers)}</span></div>}
                  {stats.responseTimeHours != null && <div className="flex justify-between"><span className="text-neutral-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Temps de réponse</span><span className="font-semibold">{stats.responseTimeHours}h</span></div>}
                  <div className="flex justify-between"><span className="text-neutral-600">Membre depuis</span><span className="font-semibold">{creator.createdAt ? formatDate(creator.createdAt) : '—'}</span></div>
                </div>
              </div>
            </Card>

            {user?.role === 'brand' && (
              <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-2">Travailler ensemble</h3>
                <p className="text-sm text-neutral-600 mb-4">Invitez ce créateur sur une campagne ouverte : il reçoit un email et peut envoyer un devis immédiatement.</p>
                <InviteCreatorButton creatorId={creator.id || creator._id} creatorName={creator.profile.name} className="w-full" />
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
