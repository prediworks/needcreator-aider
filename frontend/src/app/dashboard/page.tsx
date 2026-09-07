'use client';

import { useRequireAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useDeliveries } from '@/hooks/useDeliveries';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { Briefcase, TrendingUp, Star, Clock, Plus, Package, AlertTriangle, Video } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { CAMPAIGN_STATUS, DELIVERY_STATUS, VIDEO_TYPES } from '@/lib/labels';

export default function DashboardPage() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns(undefined, ready);
  const { data: deliveriesData } = useDeliveries(undefined, ready);

  if (!ready || !user) return <Spinner />;

  if (user.role === 'admin') {
    router.replace('/admin');
    return <Spinner />;
  }

  if (user.role === 'brand') {
    return <BrandDashboard user={user} campaignsData={campaignsData} campaignsLoading={campaignsLoading} deliveriesData={deliveriesData} />;
  }

  return <CreatorDashboard user={user} campaignsData={campaignsData} campaignsLoading={campaignsLoading} deliveriesData={deliveriesData} />;
}

function CreatorDashboard({ user, campaignsData, campaignsLoading, deliveriesData }: any) {
  const router = useRouter();
  const blockers: string[] = user.applyBlockers || [];
  const earnings = (deliveriesData?.deliveries || [])
    .filter((d: any) => ['approved', 'auto_approved'].includes(d.status))
    .reduce((acc: number, d: any) => acc + (d.payment?.creatorAmount || 0), 0);
  const activeDeliveries = (deliveriesData?.deliveries || []).filter((d: any) => !['approved', 'auto_approved', 'rejected'].includes(d.status));

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Bonjour {user.profile.name} 👋
          </h1>
          <p className="text-neutral-600">
            Voici un aperçu de votre activité
          </p>
        </div>

        {/* Blocages / statut */}
        {blockers.length > 0 && (
          <Card className="p-4 mb-6 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 mb-1">
                  Avant de pouvoir candidater
                </h3>
                <ul className="text-sm text-yellow-800 list-disc list-inside space-y-0.5">
                  {blockers.map((b: string) => <li key={b}>{b}</li>)}
                </ul>
              </div>
              <Link href="/profile">
                <Button variant="outline" size="sm">Compléter mon profil</Button>
              </Link>
            </div>
          </Card>
        )}

        {blockers.length === 0 && user.profileCompletion < 100 && (
          <Card className="p-4 mb-6 bg-primary-50 border-primary-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">
                  Profil complété à {user.profileCompletion}%
                </h3>
                <p className="text-sm text-neutral-700">
                  Un profil complet (photo, bio, compte Stripe) augmente vos chances d&apos;être sélectionné
                </p>
              </div>
              <Link href="/profile">
                <Button variant="outline" size="sm">Compléter</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Missions complétées</span>
              <Briefcase className="w-5 h-5 text-primary-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {user.profile.stats?.completedJobs || 0}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Note moyenne</span>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {user.profile.stats?.totalReviews ? user.profile.stats.rating.toFixed(1) : '—'}
              <span className="text-sm font-normal text-neutral-500 ml-2">
                ({user.profile.stats?.totalReviews || 0} avis)
              </span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Missions en cours</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {activeDeliveries.length}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Gains (net)</span>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {formatCurrency(earnings)}
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Missions en cours */}
            {activeDeliveries.length > 0 && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-neutral-900">Mes missions en cours</h2>
                  <Link href="/deliveries"><Button variant="ghost" size="sm">Voir tout</Button></Link>
                </div>
                <div className="space-y-3">
                  {activeDeliveries.slice(0, 3).map((d: any) => (
                    <div
                      key={d._id}
                      className="border border-neutral-200 rounded-lg p-4 hover:border-primary-500 transition cursor-pointer flex items-center justify-between"
                      onClick={() => router.push(`/deliveries/${d._id}`)}
                    >
                      <div>
                        <div className="font-medium text-neutral-900">{d.campaignId?.title}</div>
                        <div className="text-sm text-neutral-500">{d.brandId?.profile?.companyName}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge map={DELIVERY_STATUS} value={d.status} />
                        <span className="font-semibold text-primary-600">{formatCurrency(d.payment?.creatorAmount || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Campaigns Feed */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Campagnes pour vous
                </h2>
                <Link href="/campaigns">
                  <Button variant="ghost" size="sm">
                    Voir tout
                  </Button>
                </Link>
              </div>

              {campaignsLoading ? (
                <Spinner fullScreen={false} />
              ) : campaignsData?.campaigns?.length > 0 ? (
                <div className="space-y-4">
                  {campaignsData.campaigns.slice(0, 5).map((campaign: any) => (
                    <div
                      key={campaign._id}
                      className="border border-neutral-200 rounded-lg p-4 hover:border-primary-500 transition cursor-pointer"
                      onClick={() => router.push(`/campaigns/${campaign._id}`)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-neutral-900">{campaign.title}</h3>
                        <span className="text-primary-600 font-semibold whitespace-nowrap ml-3">
                          {formatCurrency(campaign.budget.perVideo)} / vidéo
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {campaign.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-neutral-500 flex-wrap">
                        <span className="px-2 py-1 bg-neutral-100 rounded">
                          {VIDEO_TYPES[campaign.brief.videoType] || campaign.brief.videoType}
                        </span>
                        <span>•</span>
                        <span>{campaign.brief.duration}s</span>
                        <span>•</span>
                        <span>{campaign.brief.deliverables} vidéo(s)</span>
                        <span>•</span>
                        <span>{campaign.analytics?.applications || 0} candidature(s)</span>
                        {campaign.myApplication && (
                          <>
                            <span>•</span>
                            <span className="text-green-700 font-medium">Vous avez candidaté</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-neutral-600 mb-4">Aucune campagne ne correspond à vos niches pour le moment</p>
                  <Link href="/campaigns">
                    <Button>Explorer toutes les campagnes</Button>
                  </Link>
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Actions rapides</h3>
              <div className="space-y-3">
                <Link href="/campaigns" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Voir les campagnes
                  </Button>
                </Link>
                <Link href="/campaigns?filter=applied" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Star className="w-4 h-4 mr-2" />
                    Mes candidatures
                  </Button>
                </Link>
                <Link href="/deliveries" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Package className="w-4 h-4 mr-2" />
                    Mes livraisons
                  </Button>
                </Link>
                <Link href="/profile" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une vidéo
                  </Button>
                </Link>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900">Portfolio</h3>
                <Link href="/profile" className="text-sm text-primary-500 hover:text-primary-600">
                  Gérer
                </Link>
              </div>
              <div className="text-center py-4">
                <Video className="w-8 h-8 text-primary-400 mx-auto mb-2" />
                <div className="text-3xl font-bold text-neutral-900 mb-1">
                  {user.profile.portfolio?.length || 0}
                </div>
                <p className="text-sm text-neutral-600">vidéo(s) (minimum 3)</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandDashboard({ user, campaignsData, campaignsLoading, deliveriesData }: any) {
  const router = useRouter();
  const campaigns = campaignsData?.campaigns || [];
  const toValidate = (deliveriesData?.deliveries || []).filter((d: any) => d.status === 'submitted');

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">
              Bonjour {user.profile.companyName || user.profile.name} 👋
            </h1>
            <p className="text-neutral-600">
              Gérez vos campagnes UGC
            </p>
          </div>
          <Link href="/campaigns/new">
            <Button size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Nouvelle campagne
            </Button>
          </Link>
        </div>

        {toValidate.length > 0 && (
          <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-blue-900">
                    {toValidate.length} livraison(s) à valider
                  </h3>
                  <p className="text-sm text-blue-700">
                    Sans action de votre part, elles seront approuvées automatiquement après 7 jours.
                  </p>
                </div>
              </div>
              <Link href="/deliveries?status=submitted">
                <Button size="sm">Valider</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Campagnes ouvertes</span>
              <Briefcase className="w-5 h-5 text-primary-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {campaigns.filter((c: any) => c.status === 'active').length}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">En production</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {campaigns.filter((c: any) => c.status === 'in_progress').length}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Candidatures reçues</span>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {campaigns.reduce((acc: number, c: any) => acc + (c.analytics?.applications || 0), 0)}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Budget engagé</span>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {formatCurrency(campaigns.filter((c: any) => c.status !== 'cancelled').reduce((acc: number, c: any) => acc + c.budget.total, 0))}
            </div>
          </Card>
        </div>

        {/* Campaigns List */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">
            Mes campagnes
          </h2>

          {campaignsLoading ? (
            <Spinner fullScreen={false} />
          ) : campaigns.length > 0 ? (
            <div className="space-y-4">
              {campaigns.map((campaign: any) => (
                <div
                  key={campaign._id}
                  className="border border-neutral-200 rounded-lg p-4 hover:border-primary-500 transition cursor-pointer"
                  onClick={() => router.push(`/campaigns/${campaign._id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-semibold text-neutral-900">{campaign.title}</h3>
                        <Badge map={CAMPAIGN_STATUS} value={campaign.status} />
                      </div>
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {campaign.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <span>{campaign.analytics?.applications || 0} candidature(s)</span>
                        <span>•</span>
                        <span>{formatCurrency(campaign.budget.total)}</span>
                        <span>•</span>
                        <span>{campaign.brief.deliverables} vidéo(s)</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-neutral-600 mb-4">Vous n&apos;avez pas encore de campagne</p>
              <Link href="/campaigns/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer ma première campagne
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
