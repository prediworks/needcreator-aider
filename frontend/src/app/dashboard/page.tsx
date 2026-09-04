'use client';

import { useAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Briefcase, TrendingUp, Star, Clock, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export default function DashboardPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();
  const { data: campaignsData, isLoading: campaignsLoading } = useCampaigns();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Redirect based on role
  if (user.role === 'brand') {
    return <BrandDashboard user={user} campaignsData={campaignsData} campaignsLoading={campaignsLoading} />;
  }

  return <CreatorDashboard user={user} campaignsData={campaignsData} campaignsLoading={campaignsLoading} />;
}

function CreatorDashboard({ user, campaignsData, campaignsLoading }: any) {
  const router = useRouter();

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

        {/* Profile Completion Alert */}
        {user.profileCompletion < 100 && (
          <Card className="p-4 mb-6 bg-yellow-50 border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-yellow-900 mb-1">
                  Complétez votre profil ({user.profileCompletion}%)
                </h3>
                <p className="text-sm text-yellow-700">
                  Un profil complet augmente vos chances d'être sélectionné
                </p>
              </div>
              <Link href="/profile">
                <Button variant="outline" size="sm">
                  Compléter
                </Button>
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
              {user.profile.stats?.rating?.toFixed(1) || '0.0'}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Taux de réponse</span>
              <Clock className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {user.profile.stats?.responseTimeHours ? `${user.profile.stats.responseTimeHours}h` : 'N/A'}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Revenu total</span>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {formatCurrency(0)}
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Campaigns Feed */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Campagnes disponibles
                </h2>
                <Link href="/campaigns">
                  <Button variant="ghost" size="sm">
                    Voir tout
                  </Button>
                </Link>
              </div>

              {campaignsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                </div>
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
                        <span className="text-primary-600 font-semibold">
                          {formatCurrency(campaign.budget.perVideo)}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {campaign.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span className="px-2 py-1 bg-neutral-100 rounded">
                          {campaign.brief.videoType}
                        </span>
                        <span>•</span>
                        <span>{campaign.brief.duration}s</span>
                        <span>•</span>
                        <span>{campaign.analytics?.applications || 0} candidatures</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-neutral-600 mb-4">Aucune campagne disponible pour le moment</p>
                  <Link href="/campaigns">
                    <Button>Explorer les campagnes</Button>
                  </Link>
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Actions rapides</h3>
              <div className="space-y-3">
                <Link href="/campaigns">
                  <Button variant="outline" className="w-full justify-start">
                    <Briefcase className="w-4 h-4 mr-2" />
                    Voir les campagnes
                  </Button>
                </Link>
                <Link href="/portfolio">
                  <Button variant="outline" className="w-full justify-start">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter une vidéo
                  </Button>
                </Link>
              </div>
            </Card>

            {/* Portfolio Preview */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900">Portfolio</h3>
                <Link href="/portfolio" className="text-sm text-primary-500 hover:text-primary-600">
                  Gérer
                </Link>
              </div>
              <div className="text-center py-4">
                <div className="text-3xl font-bold text-neutral-900 mb-1">
                  {user.profile.portfolio?.length || 0}
                </div>
                <p className="text-sm text-neutral-600">vidéos</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrandDashboard({ user, campaignsData, campaignsLoading }: any) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
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

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Campagnes actives</span>
              <Briefcase className="w-5 h-5 text-primary-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {campaignsData?.campaigns?.filter((c: any) => c.status === 'active').length || 0}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Total campagnes</span>
              <TrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {campaignsData?.campaigns?.length || 0}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Candidatures</span>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {campaignsData?.campaigns?.reduce((acc: number, c: any) => acc + (c.analytics?.applications || 0), 0) || 0}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-600 text-sm">Budget total</span>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {formatCurrency(campaignsData?.campaigns?.reduce((acc: number, c: any) => acc + c.budget.total, 0) || 0)}
            </div>
          </Card>
        </div>

        {/* Campaigns List */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">
            Mes campagnes
          </h2>

          {campaignsLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
            </div>
          ) : campaignsData?.campaigns?.length > 0 ? (
            <div className="space-y-4">
              {campaignsData.campaigns.map((campaign: any) => (
                <div
                  key={campaign._id}
                  className="border border-neutral-200 rounded-lg p-4 hover:border-primary-500 transition cursor-pointer"
                  onClick={() => router.push(`/campaigns/${campaign._id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-neutral-900">{campaign.title}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                          campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                          campaign.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                          'bg-neutral-100 text-neutral-700'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                        {campaign.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <span>{campaign.analytics?.applications || 0} candidatures</span>
                        <span>•</span>
                        <span>{formatCurrency(campaign.budget.total)}</span>
                        <span>•</span>
                        <span>{campaign.brief.deliverables} livrables</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-neutral-600 mb-4">Vous n'avez pas encore de campagne</p>
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
