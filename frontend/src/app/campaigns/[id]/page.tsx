'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign, useApplyToCampaign } from '@/hooks/useCampaigns';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  Clock, 
  Users, 
  CheckCircle,
  Building2,
  Video
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const campaignId = params.id as string;
  
  const { data: campaign, isLoading } = useCampaign(campaignId);
  const applyMutation = useApplyToCampaign();
  
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [proposal, setProposal] = useState('');
  const [price, setPrice] = useState('');
  const [estimatedDeliveryDays, setEstimatedDeliveryDays] = useState('7');

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Campagne introuvable</h2>
          <p className="text-neutral-600 mb-4">Cette campagne n'existe pas ou a été supprimée</p>
          <Link href="/campaigns">
            <Button>Retour aux campagnes</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    
    await applyMutation.mutateAsync({
      campaignId,
      data: {
        proposal,
        price: parseInt(price),
        estimatedDeliveryDays: parseInt(estimatedDeliveryDays),
      },
    });
    
    setShowApplicationForm(false);
    router.refresh();
  };

  const isCreator = user?.role === 'creator';
  const isBrand = user?.role === 'brand';
  const isOwnCampaign = campaign.brandId._id === user?.id;

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Back Button */}
        <Link href="/campaigns">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour aux campagnes
          </Button>
        </Link>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <Card className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-8 h-8 text-primary-600" />
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                    {campaign.title}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-neutral-600">
                    <span className="font-medium">{campaign.brandId.profile.companyName}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(campaign.timeline.publishedAt)}</span>
                    <span>•</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                      campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-neutral-700 leading-relaxed">
                {campaign.description}
              </p>
            </Card>

            {/* Brief */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Brief de la campagne
              </h2>

              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-neutral-900 mb-2">Type de vidéo</h3>
                  <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                    {campaign.brief.videoType}
                  </span>
                </div>

                <div>
                  <h3 className="font-medium text-neutral-900 mb-2">Durée</h3>
                  <p className="text-neutral-600">{campaign.brief.duration} secondes</p>
                </div>

                <div>
                  <h3 className="font-medium text-neutral-900 mb-2">Nombre de livrables</h3>
                  <p className="text-neutral-600">{campaign.brief.deliverables} vidéos</p>
                </div>

                {campaign.brief.requirements?.length > 0 && (
                  <div>
                    <h3 className="font-medium text-neutral-900 mb-2">Exigences</h3>
                    <ul className="list-disc list-inside space-y-1 text-neutral-600">
                      {campaign.brief.requirements.map((req: string, i: number) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="font-medium text-neutral-900 mb-2">Niches</h3>
                  <div className="flex flex-wrap gap-2">
                    {campaign.matching.niches.map((niche: string) => (
                      <span key={niche} className="px-2 py-1 bg-neutral-100 text-neutral-700 rounded text-sm">
                        {niche}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Applications (for brand) */}
            {isBrand && isOwnCampaign && campaign.applications?.length > 0 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                  Candidatures ({campaign.applications.length})
                </h2>
                <div className="space-y-4">
                  {campaign.applications.map((app: any) => (
                    <div key={app._id} className="border border-neutral-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-600 font-semibold">
                              {app.creatorId.profile.name[0]}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{app.creatorId.profile.name}</div>
                            <div className="text-sm text-neutral-500">
                              Note: {app.creatorId.profile.stats.rating.toFixed(1)} ⭐
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-primary-600">
                            {formatCurrency(app.price)}
                          </div>
                          <div className="text-sm text-neutral-500">
                            Match: {app.matchScore}%
                          </div>
                        </div>
                      </div>
                      {app.proposal && (
                        <p className="text-sm text-neutral-600 mb-3">{app.proposal}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button size="sm">Voir le profil</Button>
                        {app.status === 'pending' && (
                          <Button size="sm" variant="outline">Accepter</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Budget */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Budget</h3>
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-primary-600 mb-2">
                  {formatCurrency(campaign.budget.perVideo)}
                </div>
                <div className="text-sm text-neutral-600">par vidéo</div>
                <div className="text-xs text-neutral-500 mt-2">
                  Total: {formatCurrency(campaign.budget.total)}
                </div>
              </div>
            </Card>

            {/* Timeline */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Timeline</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-neutral-400" />
                  <div>
                    <div className="text-neutral-600">Date limite candidature</div>
                    <div className="font-medium">
                      {formatDate(campaign.timeline.applicationDeadline)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-neutral-400" />
                  <div>
                    <div className="text-neutral-600">Temps restant</div>
                    <div className="font-medium">
                      {campaign.daysUntilDeadline > 0 
                        ? `${campaign.daysUntilDeadline} jours`
                        : 'Expiré'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Users className="w-4 h-4 text-neutral-400" />
                  <div>
                    <div className="text-neutral-600">Candidatures</div>
                    <div className="font-medium">{campaign.analytics?.applications || 0}</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* CTA */}
            {isCreator && !campaign.userHasApplied && campaign.canApply && (
              <Card className="p-6">
                {!showApplicationForm ? (
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => setShowApplicationForm(true)}
                  >
                    Candidater maintenant
                  </Button>
                ) : (
                  <form onSubmit={handleApply} className="space-y-4">
                    <h3 className="font-semibold text-neutral-900">Votre candidature</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Proposition (optionnel)
                      </label>
                      <textarea
                        value={proposal}
                        onChange={(e) => setProposal(e.target.value)}
                        placeholder="Expliquez pourquoi vous êtes le bon créateur..."
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        rows={4}
                      />
                    </div>

                    <Input
                      label="Votre prix (€)"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={user?.profile.pricing?.minPrice?.toString() || '100'}
                      required
                    />

                    <Input
                      label="Délai de livraison (jours)"
                      type="number"
                      value={estimatedDeliveryDays}
                      onChange={(e) => setEstimatedDeliveryDays(e.target.value)}
                      required
                    />

                    <div className="flex gap-2">
                      <Button 
                        type="submit" 
                        className="flex-1"
                        isLoading={applyMutation.isPending}
                      >
                        Envoyer
                      </Button>
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={() => setShowApplicationForm(false)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            )}

            {isCreator && campaign.userHasApplied && (
              <Card className="p-6 bg-green-50 border-green-200">
                <div className="flex items-center gap-3 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Vous avez déjà candidaté</span>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
