'use client';

import { useParams, useRouter } from 'next/navigation';
import { usePublicProfile } from '@/hooks/useProfile';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ArrowLeft, Star, Briefcase, Video, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const creatorId = params.id as string;

  const { data: creator, isLoading } = usePublicProfile(creatorId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Créateur introuvable</h2>
          <p className="text-neutral-600 mb-4">
            Ce créateur n'existe pas ou son profil n'est pas public
          </p>
          <Link href="/campaigns">
            <Button>Retour aux campagnes</Button>
          </Link>
        </Card>
      </div>
    );
  }

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
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  {creator.profile.avatar ? (
                    <img
                      src={creator.profile.avatar}
                      alt={creator.profile.name}
                      className="w-full h-full rounded-full object-cover"
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
                  <div className="flex items-center gap-4 text-sm text-neutral-600 mb-3">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium">
                        {creator.profile.stats?.rating?.toFixed(1) || '0.0'}
                      </span>
                      <span className="text-neutral-500">
                        ({creator.profile.stats?.totalReviews || 0} avis)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      <span>{creator.profile.stats?.completedJobs || 0} missions</span>
                    </div>
                  </div>
                  {creator.profile.bio && (
                    <p className="text-neutral-700">{creator.profile.bio}</p>
                  )}
                </div>
              </div>

              {/* Niches */}
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
                        {niche}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Portfolio */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-6">
                Portfolio ({creator.profile.portfolio?.length || 0} vidéos)
              </h2>

              {creator.profile.portfolio?.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {creator.profile.portfolio.map((video: any, index: number) => (
                    <div
                      key={index}
                      className="border border-neutral-200 rounded-lg overflow-hidden hover:border-primary-500 transition"
                    >
                      <div className="aspect-video bg-neutral-100 flex items-center justify-center">
                        <Video className="w-12 h-12 text-neutral-400" />
                      </div>
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
                            {video.videoType}
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
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats Card */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Statistiques</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-neutral-600">Note moyenne</span>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-semibold">
                        {creator.profile.stats?.rating?.toFixed(1) || '0.0'}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500"
                      style={{
                        width: `${((creator.profile.stats?.rating || 0) / 5) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-neutral-600">Missions complétées</span>
                    <span className="font-semibold">
                      {creator.profile.stats?.completedJobs || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-neutral-600">Avis reçus</span>
                    <span className="font-semibold">
                      {creator.profile.stats?.totalReviews || 0}
                    </span>
                  </div>
                  {creator.profile.stats?.onTimeDeliveryRate && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-600">Livraison à temps</span>
                      <span className="font-semibold text-green-600">
                        {creator.profile.stats.onTimeDeliveryRate}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Contact Card */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">
                Travailler ensemble
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                Intéressé par ce créateur ? Créez une campagne et invitez-le à candidater.
              </p>
              <Link href="/campaigns/new">
                <Button className="w-full">
                  Créer une campagne
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
