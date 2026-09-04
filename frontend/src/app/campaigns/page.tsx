'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Search, Filter, Plus } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

export default function CampaignsPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedNiche, setSelectedNiche] = useState('');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');

  const { data, isLoading } = useCampaigns({
    search,
    niche: selectedNiche,
    minBudget,
    maxBudget,
  });

  const niches = [
    'beauty', 'fashion', 'tech', 'food', 'travel',
    'fitness', 'gaming', 'lifestyle', 'parenting', 'pets',
    'home', 'business', 'education', 'health'
  ];

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">
              {user?.role === 'brand' ? 'Mes campagnes' : 'Campagnes disponibles'}
            </h1>
            <p className="text-neutral-600">
              {user?.role === 'brand' 
                ? 'Gérez vos campagnes UGC' 
                : 'Trouvez des campagnes qui correspondent à votre profil'}
            </p>
          </div>
          {user?.role === 'brand' && (
            <Link href="/campaigns/new">
              <Button size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Nouvelle campagne
              </Button>
            </Link>
          )}
        </div>

        {/* Filters */}
        <Card className="p-6 mb-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <Input
                  placeholder="Rechercher une campagne..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <select
                value={selectedNiche}
                onChange={(e) => setSelectedNiche(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Toutes les niches</option>
                {niches.map(niche => (
                  <option key={niche} value={niche}>{niche}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Budget min"
                value={minBudget}
                onChange={(e) => setMinBudget(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Budget max"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Campaigns Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          </div>
        ) : data?.campaigns?.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.campaigns.map((campaign: any) => (
              <Card
                key={campaign._id}
                className="p-6 hover:shadow-lg transition cursor-pointer"
                onClick={() => router.push(`/campaigns/${campaign._id}`)}
              >
                {/* Brand Info */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-600 font-semibold">
                      {campaign.brandId?.profile?.companyName?.[0] || 'B'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-neutral-900">
                      {campaign.brandId?.profile?.companyName || 'Marque'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {formatRelativeTime(campaign.timeline.publishedAt)}
                    </div>
                  </div>
                </div>

                {/* Campaign Info */}
                <h3 className="font-semibold text-lg text-neutral-900 mb-2">
                  {campaign.title}
                </h3>
                <p className="text-sm text-neutral-600 mb-4 line-clamp-3">
                  {campaign.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded">
                    {campaign.brief.videoType}
                  </span>
                  <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">
                    {campaign.brief.duration}s
                  </span>
                  <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">
                    {campaign.brief.deliverables} vidéos
                  </span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                  <div>
                    <div className="text-2xl font-bold text-primary-600">
                      {formatCurrency(campaign.budget.perVideo)}
                    </div>
                    <div className="text-xs text-neutral-500">par vidéo</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-neutral-900">
                      {campaign.analytics?.applications || 0} candidatures
                    </div>
                    <div className="text-xs text-neutral-500">
                      {campaign.daysUntilDeadline > 0 
                        ? `${campaign.daysUntilDeadline}j restants`
                        : 'Expiré'}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-neutral-600 mb-4">Aucune campagne trouvée</p>
            {user?.role === 'brand' && (
              <Link href="/campaigns/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer une campagne
                </Button>
              </Link>
            )}
          </Card>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            {Array.from({ length: data.pagination.pages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                variant={page === data.pagination.page ? 'primary' : 'outline'}
                size="sm"
              >
                {page}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
