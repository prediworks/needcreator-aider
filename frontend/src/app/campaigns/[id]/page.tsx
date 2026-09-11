'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useRequireAuth } from '@/hooks/useAuth';
import { useCampaign, useApplyToCampaign, usePublishCampaign, useCancelCampaign, useSelectCreator, useUpdateQuote } from '@/hooks/useCampaigns';
import QuoteForm, { QuoteSummary } from '@/components/QuoteForm';
import LevelBadges from '@/components/LevelBadges';
import GroupPaymentCard from '@/components/GroupPaymentCard';
import Conversation from '@/components/Conversation';
import ReportButton from '@/components/ReportButton';
import { CAMPAIGN_TYPES } from '@/lib/labels';
import { MessageCircle } from 'lucide-react';
import Badge2 from '@/components/ui/Badge';
import { DELIVERY_STATUS } from '@/lib/labels';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  CheckCircle,
  Building2,
  Send,
  XCircle,
  Package,
  Star,
  AlertTriangle,
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { NICHES, VIDEO_TYPES, CAMPAIGN_STATUS, APPLICATION_STATUS, PLATFORMS, DELIVERY_TYPES } from '@/lib/labels';
import Link from 'next/link';
import { blockerHref } from '@/lib/profileAnchors';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, ready } = useRequireAuth();
  const campaignId = params.id as string;

  const { data: campaign, isLoading, error } = useCampaign(campaignId, ready);
  const applyMutation = useApplyToCampaign();
  const publishMutation = usePublishCampaign();
  const cancelMutation = useCancelCampaign();
  const selectMutation = useSelectCreator();
  const updateQuoteMutation = useUpdateQuote();

  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [editingQuote, setEditingQuote] = useState(false);
  const [openChat, setOpenChat] = useState<string | null>(null);

  if (!ready || isLoading) return <Spinner />;

  if (!campaign || error) {
    const apiMessage = (error as any)?.response?.data?.error;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center max-w-lg">
          <h2 className="text-xl font-semibold mb-2">{apiMessage ? 'Campagne non accessible' : 'Campagne introuvable'}</h2>
          <p className="text-neutral-600 mb-4">{apiMessage || 'Cette campagne n\'existe pas ou n\'est plus accessible'}</p>
          <Link href="/campaigns">
            <Button>Retour aux campagnes</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isCreator = user?.role === 'creator';
  const isBrand = user?.role === 'brand';
  const userId = user?.id || user?._id;
  const isOwnCampaign = isBrand && (campaign.brandId?._id || campaign.brandId) === userId;

  const handleApply = async (values: any) => {
    await applyMutation.mutateAsync({ campaignId, data: values });
    setShowApplicationForm(false);
  };

  const handleUpdateQuote = async (values: any) => {
    await updateQuoteMutation.mutateAsync({ campaignId, data: values });
    setEditingQuote(false);
  };

  const handleSelect = async (creatorId: string, name: string, amount: number) => {
    if (!confirm(`Sélectionner ${name} pour ${formatCurrency(amount)} ?\n\nVous saisirez ensuite votre carte : le montant est bloqué (pas débité) et versé au créateur uniquement après votre validation de la livraison.`)) return;
    const result = await selectMutation.mutateAsync({ campaignId, creatorId });
    // Un seul créateur recherché : on va directement payer sur la livraison ; sinon on reste ici (paiement groupé)
    if (result.delivery?._id && (campaign.matching?.creatorsWanted || 1) === 1) {
      router.push(`/deliveries/${result.delivery._id}`);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Annuler définitivement cette campagne ?')) return;
    await cancelMutation.mutateAsync(campaignId);
  };


  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
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
                  <div className="flex items-center gap-3 text-sm text-neutral-600 flex-wrap">
                    <span className="font-medium">{campaign.brandId?.profile?.companyName}</span>
                    <span>•</span>
                    <span>
                      {campaign.timeline?.publishedAt
                        ? `Publiée ${formatRelativeTime(campaign.timeline.publishedAt)}`
                        : `Créée ${formatRelativeTime(campaign.createdAt)}`}
                    </span>
                    <Badge map={CAMPAIGN_STATUS} value={campaign.status} />
                    {campaign.type === 'gifting' && <Badge map={CAMPAIGN_TYPES} value="gifting" />}
                  </div>
                </div>
                {isCreator && <ReportButton targetType="campaign" targetId={campaignId} />}
              </div>

              {campaign.type === 'gifting' && (
                <div className="mb-3 bg-pink-50 border border-pink-100 rounded-lg p-3 text-sm text-pink-900">
                  🎁 Campagne gifting : pas de rémunération, vous recevez <strong>{campaign.gifting?.productName || 'le produit'}</strong> (valeur {formatCurrency(campaign.gifting?.productValue || 0)}) en échange de {campaign.brief.deliverables} vidéo(s).
                </div>
              )}

              <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
                {campaign.description}
              </p>

              {isCreator && campaign.invited && (
                <div className="mt-4 bg-secondary-50 border border-secondary-200 rounded-lg p-3 text-sm text-secondary-800">
                  ✉️ Cette marque vous a invité personnellement à candidater.
                </div>
              )}

              {isCreator && campaign.brandId?.profile?.stats && (campaign.brandId.profile.stats.avgValidationDays != null || campaign.brandId.profile.stats.avgResponseDays != null) && (
                <div className="mt-4 flex gap-4 text-xs text-neutral-600 flex-wrap">
                  <span className="font-medium text-neutral-800">Réactivité de la marque :</span>
                  {campaign.brandId.profile.stats.avgResponseDays != null && <span>répond aux devis en {campaign.brandId.profile.stats.avgResponseDays} j</span>}
                  {campaign.brandId.profile.stats.avgValidationDays != null && <span>valide les livraisons en {campaign.brandId.profile.stats.avgValidationDays} j</span>}
                  {campaign.brandId.profile.stats.campaignsCompleted ? <span>{campaign.brandId.profile.stats.campaignsCompleted} campagne(s) terminée(s)</span> : null}
                </div>
              )}
            </Card>

            {/* Actions marque sur brouillon */}
            {isOwnCampaign && campaign.status === 'draft' && (
              <Card className="p-6 bg-primary-50 border-primary-200">
                <h3 className="font-semibold text-neutral-900 mb-2">Cette campagne est en brouillon</h3>
                <p className="text-sm text-neutral-700 mb-4">
                  Publiez-la pour la rendre visible aux créateurs de vos niches. Ils seront notifiés par email.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Button onClick={() => publishMutation.mutate(campaignId)} isLoading={publishMutation.isPending}>
                    <Send className="w-4 h-4 mr-2" />
                    Publier maintenant
                  </Button>
                  <Link href={`/campaigns/new?edit=${campaignId}`}>
                    <Button variant="outline">Modifier le brouillon</Button>
                  </Link>
                  <Button variant="outline" onClick={handleCancel} isLoading={cancelMutation.isPending}>
                    <XCircle className="w-4 h-4 mr-2" />
                    Annuler la campagne
                  </Button>
                </div>
              </Card>
            )}

            {/* Paiements groupés en attente (marque) */}
            {isOwnCampaign && campaign.pendingPayments?.length > 0 && (
              <GroupPaymentCard campaignId={campaignId} pending={campaign.pendingPayments} />
            )}

            {/* Livraisons (marque) */}
            {isOwnCampaign && campaign.deliveries?.length > 0 && (
              <Card className="p-6 bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <h3 className="font-semibold text-blue-900 flex items-center gap-2"><Package className="w-5 h-5" /> Créateurs sélectionnés ({campaign.deliveries.length}/{campaign.matching?.creatorsWanted || 1})</h3>
                  {campaign.remainingSlots > 0 && <span className="text-xs text-blue-700">Encore {campaign.remainingSlots} place(s) : sélectionnez d&apos;autres devis ci-dessous</span>}
                </div>
                <div className="space-y-2">
                  {campaign.deliveries.map((d: any) => (
                    <div key={d._id} className="bg-white rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.creatorId?.profile?.name}</span>
                        <Badge2 map={DELIVERY_STATUS} value={d.status} />
                        {['pending', 'failed'].includes(d.payment?.status) && d.payment?.stripePaymentIntentId && <span className="text-xs text-orange-700">paiement à confirmer</span>}
                      </div>
                      <Link href={`/deliveries/${d._id}`}><Button size="sm">Voir la livraison</Button></Link>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Performances cumulées (marque) */}
            {isOwnCampaign && campaign.performance?.totals?.videos > 0 && (
              <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-3">Performances des vidéos livrées</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center mb-3">
                  {[['Vues', campaign.performance.totals.views], ['Likes', campaign.performance.totals.likes], ['Commentaires', campaign.performance.totals.comments], ['Partages', campaign.performance.totals.shares], ['Coût / 1000 vues', campaign.performance.costPerThousandViews != null ? `${campaign.performance.costPerThousandViews} €` : '—']].map(([l, v]: any) => (
                    <div key={l} className="bg-neutral-50 rounded-lg p-3"><div className="text-xl font-bold text-neutral-900">{typeof v === 'number' ? v.toLocaleString('fr-FR') : v}</div><div className="text-xs text-neutral-500">{l}</div></div>
                  ))}
                </div>
                <ul className="text-sm text-neutral-700 space-y-1">
                  {campaign.performance.byCreator.map((c: any) => (
                    <li key={c.deliveryId} className="flex justify-between"><span>{c.creator} · {c.videos} vidéo(s)</span><span>{c.views.toLocaleString('fr-FR')} vues · {c.likes.toLocaleString('fr-FR')} likes</span></li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Livraison (créateur sélectionné) */}
            {!isOwnCampaign && campaign.delivery && (
              <Card className="p-6 bg-blue-50 border-blue-200">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Package className="w-6 h-6 text-blue-600" />
                    <div>
                      <h3 className="font-semibold text-blue-900">Votre mission</h3>
                      <p className="text-sm text-blue-700">Suivez la production et la validation de vos vidéos.</p>
                    </div>
                  </div>
                  <Link href={`/deliveries/${campaign.delivery._id}`}><Button>Voir la livraison</Button></Link>
                </div>
              </Card>
            )}

            {/* Discussion avec la marque (créateur lié à la campagne) */}
            {isCreator && (campaign.userHasApplied || campaign.invited || campaign.isSelected) && (
              <Card className="p-6">
                <Conversation campaignId={campaignId} title={`Discussion avec ${campaign.brandId?.profile?.companyName || 'la marque'}`} />
                <p className="text-xs text-neutral-500 mt-2">Négociez votre devis ici, puis mettez-le à jour avec « Modifier mon devis ».</p>
              </Card>
            )}

            {/* Brief */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Brief de la campagne
              </h2>

              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-1">Type de vidéo</h3>
                    <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                      {VIDEO_TYPES[campaign.brief.videoType] || campaign.brief.videoType}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-1">Durée</h3>
                    <p className="text-neutral-900">{campaign.brief.duration} secondes</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-1">Livrables</h3>
                    <p className="text-neutral-900">{campaign.brief.deliverables} vidéo(s)</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-1">Livraison acceptée</h3>
                    <p className="text-neutral-900 text-sm">{(campaign.brief.deliveryTypes || ['file', 'link']).map((t: string) => DELIVERY_TYPES[t]).join(' ou ')}</p>
                  </div>
                  {campaign.brief.platforms?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-neutral-500 mb-1">Réseaux de diffusion</h3>
                      <div className="flex flex-wrap gap-1">
                        {campaign.brief.platforms.map((p: string) => (
                          <span key={p} className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">{PLATFORMS[p] || p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {campaign.brief.productShipping && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">
                    📦 Un produit est envoyé au créateur sélectionné{campaign.brief.productDescription ? ` : ${campaign.brief.productDescription}` : ''}. Le délai de production démarre à sa réception.
                  </div>
                )}

                {campaign.brief.requirements?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-500 mb-2">Consignes</h3>
                    <ul className="list-disc list-inside space-y-1 text-neutral-700">
                      {campaign.brief.requirements.map((req: string, i: number) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-neutral-500 mb-2">Niches</h3>
                  <div className="flex flex-wrap gap-2">
                    {campaign.matching.niches.map((niche: string) => (
                      <span key={niche} className="px-2 py-1 bg-neutral-100 text-neutral-700 rounded text-sm">
                        {NICHES[niche] || niche}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Applications (for brand) */}
            {isOwnCampaign && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-1">
                  Candidatures ({campaign.applications?.length || 0})
                </h2>
                <p className="text-sm text-neutral-500 mb-4">Triées par score de matching (niches, budget, note, réactivité).</p>
                {campaign.applications?.length > 0 ? (
                  <div className="space-y-4">
                    {campaign.applications.map((app: any) => {
                      const c = app.creatorId || {};
                      const cid = c._id || app.creatorId;
                      const rating = c.profile?.stats?.rating || 0;
                      const reviews = c.profile?.stats?.totalReviews || 0;
                      return (
                        <div key={app._id} className="border border-neutral-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center overflow-hidden">
                                {c.profile?.avatar ? (
                                  <img src={c.profile.avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-primary-600 font-semibold">{c.profile?.name?.[0] || '?'}</span>
                                )}
                              </div>
                              <div>
                                <div className="font-medium flex items-center gap-2 flex-wrap">{c.profile?.name || 'Créateur'} <LevelBadges badges={c.badges} size="xs" /></div>
                                <div className="text-sm text-neutral-500 flex items-center gap-1">
                                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                                  {reviews ? `${rating.toFixed(1)} (${reviews} avis)` : 'Nouveau créateur'}
                                  <span className="mx-1">•</span>
                                  {c.profile?.stats?.completedJobs || 0} mission(s)
                                </div>
                                {c.profile?.availability?.unavailableUntil && new Date(c.profile.availability.unavailableUntil) > new Date() && (
                                  <div className="text-xs text-orange-700 mt-0.5">Indisponible jusqu&apos;au {new Date(c.profile.availability.unavailableUntil).toLocaleDateString('fr-FR')}{c.profile.availability.note ? ` · ${c.profile.availability.note}` : ''}</div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-primary-600 text-lg">
                                {formatCurrency(app.price)}{app.quote?.vatRate > 0 ? <span className="text-xs text-neutral-500 font-normal"> HT · {formatCurrency(app.price * (1 + app.quote.vatRate / 100))} TTC</span> : null}
                              </div>
                              <div className="text-sm text-neutral-500">
                                Match <strong>{app.matchScore}%</strong> · {app.estimatedDeliveryDays} j
                              </div>
                            </div>
                          </div>
                          {app.proposal && (
                            <p className="text-sm text-neutral-600 mb-3 bg-neutral-50 rounded p-3 whitespace-pre-line">{app.proposal}</p>
                          )}
                          <div className="mb-3 border border-neutral-100 rounded-lg p-3">
                            <div className="text-xs font-semibold text-neutral-500 uppercase mb-1">Devis</div>
                            <QuoteSummary application={app} />
                          </div>
                          {openChat === cid && (
                            <div className="mb-3">
                              <Conversation campaignId={campaignId} creatorId={cid} compact />
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge map={APPLICATION_STATUS} value={app.status} />
                            <Link href={`/profile/${cid}`}>
                              <Button size="sm" variant="outline">Voir le portfolio</Button>
                            </Link>
                            <Button size="sm" variant="ghost" onClick={() => setOpenChat(openChat === cid ? null : cid)}>
                              <MessageCircle className="w-4 h-4 mr-1" /> {openChat === cid ? 'Fermer' : 'Discuter'}
                            </Button>
                            {app.status === 'pending' && campaign.status === 'active' && (campaign.remainingSlots ?? 1) > 0 && (
                              <Button
                                size="sm"
                                onClick={() => handleSelect(cid, c.profile?.name || 'ce créateur', app.price)}
                                isLoading={selectMutation.isPending}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                {campaign.type === 'gifting' ? 'Sélectionner (frais de plateforme)' : 'Accepter le devis et payer'}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-neutral-500 text-sm py-6 text-center">
                    {campaign.status === 'draft' ? 'Publiez la campagne pour recevoir des candidatures.' : 'Aucune candidature pour le moment.'}
                  </p>
                )}
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Budget */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Budget</h3>
              <div className="text-center py-2">
                {campaign.type === 'gifting' ? (
                  <>
                    <div className="text-2xl font-bold text-pink-700 mb-1">🎁 Produit offert</div>
                    <div className="text-sm text-neutral-600">{campaign.gifting?.productName} · valeur {formatCurrency(campaign.gifting?.productValue || 0)}</div>
                  </>
                ) : campaign.budget?.total ? (
                  <>
                    <div className="text-4xl font-bold text-primary-600 mb-1">
                      {formatCurrency(campaign.budget.perVideo)}
                    </div>
                    <div className="text-sm text-neutral-600">par vidéo</div>
                    <div className="text-xs text-neutral-500 mt-2">
                      Total : {formatCurrency(campaign.budget.total)} pour {campaign.brief.deliverables} vidéo(s)
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-primary-600 mb-1">Devis libre</div>
                    <div className="text-sm text-neutral-600">{campaign.brief.deliverables} vidéo(s) · chaque créateur propose son prix</div>
                  </>
                )}
                {campaign.matching?.creatorsWanted > 1 && (
                  <div className="text-xs text-neutral-500 mt-2">{campaign.matching.creatorsWanted} créateurs recherchés</div>
                )}
                {isCreator && (
                  <div className="text-xs text-neutral-500 mt-1">
                    Vous recevez 90% du prix accepté (commission 10%)
                  </div>
                )}
              </div>
            </Card>

            {/* Timeline */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Calendrier</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-neutral-400" />
                  <div>
                    <div className="text-neutral-600">Date limite de candidature</div>
                    <div className="font-medium">
                      {campaign.timeline?.applicationDeadline ? formatDate(campaign.timeline.applicationDeadline) : '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-neutral-400" />
                  <div>
                    <div className="text-neutral-600">Temps restant</div>
                    <div className="font-medium">
                      {campaign.daysUntilDeadline > 0
                        ? `${campaign.daysUntilDeadline} jour(s)`
                        : 'Candidatures closes'}
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

            {/* CTA créateur */}
            {isCreator && campaign.isSelected && (
              <Card className="p-6 bg-green-50 border-green-200">
                <div className="flex items-center gap-3 text-green-700 mb-3">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Vous avez été sélectionné !</span>
                </div>
                {campaign.delivery && (
                  <Link href={`/deliveries/${campaign.delivery._id}`}>
                    <Button className="w-full">Accéder à la livraison</Button>
                  </Link>
                )}
              </Card>
            )}

            {isCreator && !campaign.isSelected && campaign.userHasApplied && (
              <Card className={editingQuote ? 'p-6' : 'p-6 bg-green-50 border-green-200'}>
                {editingQuote ? (
                  <>
                    <h3 className="font-semibold text-neutral-900 mb-3">Modifier mon devis</h3>
                    <QuoteForm
                      campaign={campaign}
                      initial={{ ...campaign.myApplication?.quote, price: campaign.myApplication?.price, estimatedDeliveryDays: campaign.myApplication?.estimatedDeliveryDays, proposal: campaign.myApplication?.proposal }}
                      submitLabel="Enregistrer le devis"
                      isLoading={updateQuoteMutation.isPending}
                      onSubmit={handleUpdateQuote}
                      onCancel={() => setEditingQuote(false)}
                    />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-green-700 mb-2">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Devis envoyé</span>
                      <Badge map={APPLICATION_STATUS} value={campaign.myApplication?.status} />
                    </div>
                    {campaign.myApplication && <QuoteSummary application={campaign.myApplication} compact />}
                    {campaign.myApplication?.status === 'pending' && campaign.status === 'active' && (
                      <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => setEditingQuote(true)}>
                        Modifier mon devis
                      </Button>
                    )}
                  </>
                )}
              </Card>
            )}

            {isCreator && !campaign.userHasApplied && campaign.status === 'active' && (
              <Card className="p-6">
                {campaign.canApply ? (
                  !showApplicationForm ? (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => setShowApplicationForm(true)}
                    >
                      Envoyer un devis
                    </Button>
                  ) : (
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-3">Mon devis</h3>
                      <QuoteForm
                        campaign={campaign}
                        submitLabel="Envoyer le devis"
                        isLoading={applyMutation.isPending}
                        onSubmit={handleApply}
                        onCancel={() => setShowApplicationForm(false)}
                      />
                    </div>
                  )
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-orange-700 mb-2">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-medium">Candidature impossible pour l&apos;instant</span>
                    </div>
                    <ul className="text-sm text-neutral-700 list-disc list-inside space-y-1 mb-3">
                      {(campaign.applyBlockers?.length ? campaign.applyBlockers : ['La période de candidature est terminée.']).map((b: string) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    {campaign.applyBlockers?.length > 0 && (
                      <Link href={blockerHref(campaign.applyBlockers[0])}>
                        <Button variant="outline" className="w-full" size="sm">Compléter mon profil</Button>
                      </Link>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
