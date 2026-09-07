'use client';

import { useState, Suspense } from 'react';
import { useRequireAuth } from '@/hooks/useAuth';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useRouter, useSearchParams } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import { Search, Plus } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { NICHES, NICHE_OPTIONS, VIDEO_TYPES, CAMPAIGN_STATUS, APPLICATION_STATUS } from '@/lib/labels';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function CampaignsContent() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedNiche, setSelectedNiche] = useState('');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [status, setStatus] = useState('');
  const filter = searchParams.get('filter') || 'available';

  const isBrand = user?.role === 'brand';

  const { data, isLoading } = useCampaigns(
    {
      search: search || undefined,
      niche: selectedNiche || undefined,
      minBudget: minBudget || undefined,
      maxBudget: maxBudget || undefined,
      status: isBrand && status ? status : undefined,
      filter: !isBrand ? filter : undefined,
    },
    ready
  );

  if (!ready) return <Spinner />;

  const creatorTabs = [
    { key: 'available', label: 'Disponibles' },
    { key: 'applied', label: 'Mes candidatures' },
    { key: 'selected', label: 'Mes missions' },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-2">
              {isBrand ? 'Mes campagnes' : 'Campagnes'}
            </h1>
            <p className="text-neutral-600">
              {isBrand
                ? 'Gérez vos campagnes UGC'
                : 'Toutes les campagnes ouvertes, celles de vos niches en premier'}
            </p>
          </div>
          {isBrand && (
            <Link href="/campaigns/new">
              <Button size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Nouvelle campagne
              </Button>
            </Link>
          )}
        </div>

        {/* Onglets créateur */}
        {!isBrand && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {creatorTabs.map((t) => (
              <Link
                key={t.key}
                href={`/campaigns?filter=${t.key}`}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition',
                  filter === t.key ? 'bg-primary-500 text-white' : 'bg-white border border-neutral-200 text-neutral-700 hover:border-primary-300'
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
        )}

        {/* Filters */}
        <Card className="p-4 mb-6">
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

            {isBrand ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Tous les statuts</option>
                {Object.entries(CAMPAIGN_STATUS).map(([value, s]) => (
                  <option key={value} value={value}>{s.label}</option>
                ))}
              </select>
            ) : (
              <select
                value={selectedNiche}
                onChange={(e) => setSelectedNiche(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Toutes les niches</option>
                {NICHE_OPTIONS.map(niche => (
                  <option key={niche} value={niche}>{NICHES[niche]}</option>
                ))}
              </select>
            )}

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
          <Spinner fullScreen={false} />
        ) : data?.campaigns?.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.campaigns.map((campaign: any) => (
              <Card
                key={campaign._id}
                className="p-6 hover:shadow-lg transition cursor-pointer flex flex-col"
                onClick={() => router.push(`/campaigns/${campaign._id}`)}
              >
                {/* Brand Info */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-600 font-semibold">
                      {campaign.brandId?.profile?.companyName?.[0] || 'M'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 truncate">
                      {campaign.brandId?.profile?.companyName || 'Marque'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {campaign.timeline?.publishedAt
                        ? `Publiée ${formatRelativeTime(campaign.timeline.publishedAt)}`
                        : `Créée ${formatRelativeTime(campaign.createdAt)}`}
                      {!isBrand && campaign.brandId?.profile?.stats?.avgValidationDays != null && (
                        <span title="Délai moyen de validation des livraisons par cette marque"> · valide en {campaign.brandId.profile.stats.avgValidationDays} j</span>
                      )}
                    </div>
                  </div>
                  {!isBrand && campaign.invited ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-secondary-100 text-secondary-800 whitespace-nowrap">✉️ Invitation</span>
                  ) : !isBrand && campaign.earlyAccess ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap">🌟 Avant-première</span>
                  ) : !isBrand && campaign.matchesMyNiches ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-800 whitespace-nowrap">Pour vous</span>
                  ) : (
                    <Badge map={CAMPAIGN_STATUS} value={campaign.status} />
                  )}
                </div>

                {/* Campaign Info */}
                <h3 className="font-semibold text-lg text-neutral-900 mb-2">
                  {campaign.title}
                </h3>
                <p className="text-sm text-neutral-600 mb-4 line-clamp-3 flex-1">
                  {campaign.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded">
                    {VIDEO_TYPES[campaign.brief.videoType] || campaign.brief.videoType}
                  </span>
                  <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">
                    {campaign.brief.duration}s
                  </span>
                  <span className="px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">
                    {campaign.brief.deliverables} vidéo(s)
                  </span>
                  {campaign.matching?.niches?.slice(0, 2).map((n: string) => (
                    <span key={n} className="px-2 py-1 bg-neutral-100 text-neutral-600 text-xs rounded">{NICHES[n] || n}</span>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
                  <div>
                    <div className="text-2xl font-bold text-primary-600">
                      {campaign.budget?.perVideo ? formatCurrency(campaign.budget.perVideo) : 'Devis libre'}
                    </div>
                    <div className="text-xs text-neutral-500">{campaign.budget?.perVideo ? 'par vidéo' : 'proposez votre prix'}</div>
                  </div>
                  <div className="text-right">
                    {campaign.myApplication ? (
                      <Badge map={APPLICATION_STATUS} value={campaign.myApplication.status} />
                    ) : (
                      <div className="text-sm font-medium text-neutral-900">
                        {campaign.analytics?.applications || 0} candidature(s)
                      </div>
                    )}
                    <div className="text-xs text-neutral-500 mt-1">
                      {campaign.status === 'active'
                        ? (campaign.daysUntilDeadline > 0 ? `${campaign.daysUntilDeadline}j restants` : 'Candidatures closes')
                        : ''}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-neutral-600 mb-4">
              {!isBrand && filter === 'applied' ? 'Vous n\'avez pas encore candidaté' :
               !isBrand && filter === 'selected' ? 'Aucune mission en cours' :
               'Aucune campagne trouvée'}
            </p>
            {isBrand && (
              <Link href="/campaigns/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Créer une campagne
                </Button>
              </Link>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CampaignsContent />
    </Suspense>
  );
}
