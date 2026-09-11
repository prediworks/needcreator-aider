'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { useCreateCampaign, usePublishCampaign, useUpdateCampaign, useCampaign } from '@/hooks/useCampaigns';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { MIN_QUOTE_PRICE } from '@/lib/config';
import { ArrowLeft, Save, Send, Info } from 'lucide-react';
import Link from 'next/link';
import { NICHES, NICHE_OPTIONS, VIDEO_TYPE_OPTIONS, PLATFORMS, PLATFORM_OPTIONS, DELIVERY_TYPES } from '@/lib/labels';
import { formatCurrency } from '@/lib/utils';
import AiBriefCard from '@/components/AiBriefCard';
import ShopifyProductPicker from '@/components/ShopifyProductPicker';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import MissingHint from '@/components/ui/MissingHint';
import { toast } from 'sonner';
import TemplatePicker, { type CampaignPrefill } from '@/components/TemplatePicker';

const PLATFORM_FEE_PERCENT = 10;

// Fourchettes de prix marché indicatives (€ / vidéo) par type de contenu
const MARKET_PRICES: Record<string, [number, number]> = {
  testimonial: [80, 150], unboxing: [80, 150], demo: [100, 200], tutorial: [120, 250],
  review: [80, 150], comparison: [120, 220], lifestyle: [100, 200], 'behind-the-scenes': [100, 180],
  interview: [150, 300], challenge: [100, 200], haul: [90, 180], vlog: [120, 250],
};

const BRIEF_TEMPLATE = `Montrer le produit en action dès les 3 premières secondes
Parler face caméra, ton naturel et authentique
Mentionner les 2 bénéfices principaux
Terminer par un appel à l'action (ex : "lien en bio")
Format vertical 9:16, lumière naturelle`;

function NewCampaignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const fromId = searchParams.get('from'); // dupliquer une campagne passée
  const { ready, user } = useRequireAuth({ roles: ['brand'] });
  const updateMutation = useUpdateCampaign();
  const { data: existing, isLoading: loadingExisting } = useCampaign(editId || fromId || '', ready && !!(editId || fromId));
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [prefilled, setPrefilled] = useState(false);
  const { data: marketRates } = useQuery({ queryKey: ['market-rates'], queryFn: async () => (await api.get('/campaigns/market-rates')).data, staleTime: 10 * 60 * 1000, enabled: ready });
  const feePercent = (user as any)?.referral?.discountedCampaignsLeft > 0 ? 5 : ((user as any)?.plan?.feePercent ?? PLATFORM_FEE_PERCENT);
  const createMutation = useCreateCampaign();
  const publishMutation = usePublishCampaign();

  const [step, setStep] = useState(1);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  // Form data
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoType, setVideoType] = useState('testimonial');
  const [duration, setDuration] = useState('30');
  const [deliverables, setDeliverables] = useState('3');
  const [requirements, setRequirements] = useState(BRIEF_TEMPLATE);
  const [budget, setBudget] = useState('');
  const [niches, setNiches] = useState<string[]>([]);
  const [applicationDeadline, setApplicationDeadline] = useState('');
  const [deliveryTypes, setDeliveryTypes] = useState<string[]>(['file', 'link']);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [creatorsWanted, setCreatorsWanted] = useState('1');
  const [productShipping, setProductShipping] = useState(false);
  const [productDescription, setProductDescription] = useState('');
  const [campaignType, setCampaignType] = useState<'paid' | 'gifting'>('paid');
  const [giftingValue, setGiftingValue] = useState('');
  const isPro = !!(user as any)?.isPro;

  // Mode édition : pré-remplit le formulaire avec le brouillon existant
  useEffect(() => {
    if (!existing || prefilled) return;
    setTitle(fromId ? `${existing.title || ''} (copie)`.slice(0, 100) : (existing.title || ''));
    setDescription(existing.description || '');
    setVideoType(existing.brief?.videoType || 'testimonial');
    setDuration(String(existing.brief?.duration || 30));
    setDeliverables(String(existing.brief?.deliverables || 1));
    setRequirements((existing.brief?.requirements || []).join('\n'));
    setBudget(existing.budget?.total ? String(existing.budget.total) : '');
    setNiches(existing.matching?.niches || []);
    setApplicationDeadline(!fromId && existing.timeline?.applicationDeadline ? new Date(existing.timeline.applicationDeadline).toISOString().slice(0, 10) : '');
    setVisibility(existing.visibility === 'private' ? 'private' : 'public');
    setDeliveryTypes(existing.brief?.deliveryTypes || ['file', 'link']);
    setPlatforms(existing.brief?.platforms || []);
    setCreatorsWanted(String(existing.matching?.creatorsWanted || 1));
    setProductShipping(!!existing.brief?.productShipping);
    setProductDescription(existing.brief?.productDescription || '');
    setCampaignType(existing.type === 'gifting' ? 'gifting' : 'paid');
    setGiftingValue(existing.gifting?.productValue ? String(existing.gifting.productValue) : '');
    if (!fromId) setCreatedCampaignId(existing._id);
    setPrefilled(true);
  }, [existing, prefilled]);

  if (!ready || (editId && loadingExisting)) return <Spinner />;

  if (editId && existing && existing.status !== 'draft') {
    return (
      <div className="min-h-screen bg-neutral-50 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <Card className="p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Cette campagne n&apos;est plus modifiable</h1>
            <p className="text-neutral-600 mb-4">Seules les campagnes en brouillon peuvent être modifiées. Une campagne publiée peut être annulée tant qu&apos;aucun créateur n&apos;est sélectionné.</p>
            <Link href={`/campaigns/${editId}`}><Button>Retour à la campagne</Button></Link>
          </Card>
        </div>
      </div>
    );
  }

  const isEdit = !!editId;

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : prev.length >= 5 ? prev : [...prev, niche]
    );
  };

  const nbVideos = Math.max(1, parseInt(deliverables) || 1);
  // Suggestion de prix : médiane des devis acceptés sur la plateforme (grille indicative en secours)
  const rate = marketRates?.rates?.[videoType];
  const [gridMin, gridMax] = MARKET_PRICES[videoType] || [80, 200];
  const minMarket = rate?.min ?? gridMin;
  const maxMarket = rate?.max ?? gridMax;
  const medianMarket = rate?.median ?? Math.round((gridMin + gridMax) / 2);
  const suggestedBudget = Math.round(medianMarket * nbVideos);
  const marketNote = rate?.source === 'market'
    ? `d'après ${rate.count} devis acceptés sur NeedCreator (médiane ${formatCurrency(rate.median)})`
    : `grille indicative${rate?.count ? ` (seulement ${rate.count} devis accepté(s) pour ce type de vidéo, ${marketRates?.minSample ?? 10} nécessaires)` : ''}`;
  const budgetNumber = parseInt(budget) || 0;
  const perVideo = budgetNumber ? Math.round(budgetNumber / nbVideos) : 0;
  const creatorShare = Math.round(budgetNumber * (1 - feePercent / 100));

  const payload = () => ({
    title,
    description,
    videoType,
    duration: parseInt(duration),
    deliverables: nbVideos,
    requirements: requirements.split('\n').map(r => r.trim()).filter(Boolean).slice(0, 10),
    budget: budgetNumber >= MIN_QUOTE_PRICE ? budgetNumber : null,
    niches,
    applicationDeadline,
    deliveryTypes,
    platforms,
    creatorsWanted: Math.max(1, parseInt(creatorsWanted) || 1),
    visibility,
    productShipping: campaignType === 'gifting' ? true : productShipping,
    productDescription: (campaignType === 'gifting' || productShipping) ? productDescription : '',
    type: campaignType,
    giftingProductName: campaignType === 'gifting' ? productDescription : '',
    giftingProductValue: campaignType === 'gifting' ? parseFloat(giftingValue) || null : null,
  });

  const toggleIn = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

  const step1Valid = title.trim().length >= 10 && description.trim().length >= 50 && niches.length > 0;
  const step2Valid = (budgetNumber === 0 || budgetNumber >= MIN_QUOTE_PRICE) && !!applicationDeadline && deliveryTypes.length > 0
    && (campaignType !== 'gifting' || ((parseFloat(giftingValue) || 0) >= 30 && !!productDescription.trim() && nbVideos <= 2));

  const saveDraft = async () => {
    if (isEdit && createdCampaignId) {
      await updateMutation.mutateAsync({ campaignId: createdCampaignId, data: payload() });
      return createdCampaignId;
    }
    const result = await createMutation.mutateAsync(payload());
    setCreatedCampaignId(result.campaign._id);
    return result.campaign._id as string;
  };

  const handleSaveDraft = async () => {
    await saveDraft();
    setStep(3);
  };

  const handlePublish = async () => {
    const id = createdCampaignId && !isEdit ? createdCampaignId : await saveDraft();
    await publishMutation.mutateAsync(id!);
    router.push(`/campaigns/${id}`);
  };

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au tableau de bord
          </Button>
        </Link>

        <Card className="p-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {isEdit ? 'Modifier le brouillon' : 'Créer une campagne'}
          </h1>
          <p className="text-neutral-600 mb-8">
            5 minutes suffisent. Les créateurs correspondant à vos niches seront notifiés à la publication.
          </p>

          {/* Progress */}
          <div className="flex items-center justify-between mb-8">
            {[['1', 'Informations'], ['2', 'Brief & budget'], ['3', 'Publication']].map(([n, labelText], i) => (
              <div key={n} className="contents">
                <div className={`flex items-center gap-2 ${step >= i + 1 ? 'text-primary-600' : 'text-neutral-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step >= i + 1 ? 'bg-primary-500 text-white' : 'bg-neutral-200'
                  }`}>
                    {n}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{labelText}</span>
                </div>
                {i < 2 && <div className="flex-1 h-0.5 bg-neutral-200 mx-4"></div>}
              </div>
            ))}
          </div>

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              {!isEdit && !fromId && (
                <TemplatePicker enabled={ready} onPick={(p: CampaignPrefill, label) => { setTitle(p.title); setDescription(p.description); setVideoType(p.videoType); setDuration(String(p.duration)); setDeliverables(String(p.deliverables)); setNiches(p.niches); setPlatforms(p.platforms); setProductShipping(p.productShipping); setRequirements(p.requirements.join('\n')); toast.success(`Formulaire pré-rempli : ${label}`); }} />
              )}
              <ShopifyProductPicker
                onPick={(p) => {
                  setTitle((t) => t || `Vidéo UGC pour ${p.title}`.slice(0, 100));
                  setDescription((d) => d || `${p.title}${p.price ? ` (${p.price} €)` : ''} — ${p.description}`.slice(0, 1000));
                  setProductDescription(p.title);
                  setProductShipping(true);
                }}
                buttonLabel="Pré-remplir"
              />

              <AiBriefCard
                videoType={videoType}
                platforms={platforms}
                niches={niches}
                onGenerated={(b) => {
                  setTitle(b.title || '');
                  setDescription(b.description || '');
                  const lines = [
                    ...(b.requirements || []),
                    ...((b.dos || []).map((d: string) => `À faire : ${d}`)),
                    ...((b.donts || []).map((d: string) => `À éviter : ${d}`)),
                  ];
                  if (b.hashtags?.length) lines.push(`Hashtags : ${b.hashtags.map((h: string) => `#${h}`).join(' ')}`);
                  setRequirements(lines.slice(0, 10).join('\n'));
                  if (b.suggestedDuration) setDuration(String(b.suggestedDuration));
                  if (b.suggestedDeliverables) setDeliverables(String(b.suggestedDeliverables));
                }}
              />

              <div>
                <Input
                  label="Titre de la campagne (10 caractères minimum)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Vidéo témoignage pour notre nouvelle crème hydratante"
                  maxLength={100}
                  required
                />
                <p className="text-xs text-neutral-500 mt-1">{title.length}/100</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Description (50 caractères minimum)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Présentez votre marque, le produit et l'objectif de la vidéo (publicité, réseaux sociaux, page produit...)"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={5}
                  maxLength={1000}
                  required
                />
                <p className={`text-xs mt-1 ${description.trim().length < 50 ? 'text-orange-600' : 'text-neutral-500'}`}>
                  {description.trim().length}/1000 {description.trim().length < 50 && `(encore ${50 - description.trim().length} caractères)`}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Niches ciblées (1 à 5) — détermine quels créateurs sont notifiés
                </label>
                <div className="flex flex-wrap gap-2">
                  {NICHE_OPTIONS.map(niche => (
                    <button
                      key={niche}
                      type="button"
                      onClick={() => handleNicheToggle(niche)}
                      className={`px-3 py-1 rounded-full text-sm transition ${
                        niches.includes(niche)
                          ? 'bg-primary-500 text-white'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {NICHES[niche]}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => setStep(2)}
                className="w-full"
                disabled={!step1Valid}
              >
                Continuer
              </Button>
              <MissingHint items={[
                title.trim().length < 10 && `un titre de 10 caractères (${title.trim().length} saisis)`,
                description.trim().length < 50 && `une description de 50 caractères (${description.trim().length} saisis)`,
                niches.length === 0 && 'au moins une niche',
              ]} />
            </div>
          )}

          {/* Step 2: Brief */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Type de campagne</label>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { v: 'paid', t: 'Rémunérée', d: 'Vous payez le créateur (devis). Paiement bloqué à la sélection, versé à la validation.' },
                    { v: 'gifting', t: '🎁 Gifting (produit offert)', d: `Vous envoyez un produit (valeur ≥ 30 €) à la place d'une rémunération. 2 vidéos max, 2 campagnes par mois, 5 € de frais par vidéo livrée.${isPro ? '' : ' Réservé au plan Pro.'}` },
                  ].map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      disabled={o.v === 'gifting' && !isPro}
                      onClick={() => setCampaignType(o.v as any)}
                      className={`text-left p-4 rounded-lg border-2 transition ${campaignType === o.v ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'} ${o.v === 'gifting' && !isPro ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="font-semibold text-neutral-900">{o.t}</div>
                      <div className="text-xs text-neutral-600 mt-1">{o.d}</div>
                    </button>
                  ))}
                </div>
                {!isPro && <p className="text-xs text-neutral-500 mt-2">Le gifting et les campagnes multi-créateurs sont réservés au <Link href="/profile#subscription" className="text-primary-600 underline">plan Pro</Link>.</p>}
              </div>

              {campaignType === 'gifting' && (
                <div className="grid sm:grid-cols-2 gap-3 bg-pink-50 border border-pink-100 rounded-lg p-4">
                  <Input label="Produit offert" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Ex : Sérum vitamine C 30 ml" maxLength={200} required />
                  <Input label="Valeur du produit (€, minimum 30)" type="number" min={30} value={giftingValue} onChange={(e) => setGiftingValue(e.target.value)} required />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Type de vidéo
                </label>
                <select
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {VIDEO_TYPE_OPTIONS.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Durée (15 à 180 secondes)"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min={15}
                  max={180}
                  required
                />

                <Input
                  label="Nombre de vidéos (1 à 10)"
                  type="number"
                  value={deliverables}
                  onChange={(e) => setDeliverables(e.target.value)}
                  min={1}
                  max={10}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Brief : consignes pour le créateur (une par ligne, 10 maximum)
                </label>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={6}
                />
                <p className="text-xs text-neutral-500 mt-1">Un modèle est pré-rempli, adaptez-le à votre produit.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">Mode de livraison accepté</label>
                  <div className="flex flex-col gap-2">
                    {Object.entries(DELIVERY_TYPES).map(([v, l]) => (
                      <label key={v} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input type="checkbox" checked={deliveryTypes.includes(v)} onChange={() => toggleIn(deliveryTypes, setDeliveryTypes, v)} />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
                <Input
                  label={`Nombre de créateurs recherchés${isPro ? '' : ' (Pro pour plus d\'un)'}`}
                  type="number"
                  value={creatorsWanted}
                  onChange={(e) => setCreatorsWanted(e.target.value)}
                  min={1}
                  max={isPro ? 20 : 1}
                  disabled={!isPro}
                />
              </div>

              <div className="bg-neutral-50 rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                  <input type="checkbox" checked={visibility === 'private'} onChange={(e) => setVisibility(e.target.checked ? 'private' : 'public')} />
                  Campagne privée : visible uniquement par les créateurs que vous invitez
                </label>
                <p className="text-xs text-neutral-500 mt-1">Pour un lancement confidentiel. Aucune notification aux créateurs à la publication ; invitez-les depuis l&apos;annuaire ou la page de la campagne.</p>
              </div>

              <div className="bg-neutral-50 rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                  <input type="checkbox" checked={productShipping} onChange={(e) => setProductShipping(e.target.checked)} />
                  Un produit doit être envoyé au créateur avant la production
                </label>
                <p className="text-xs text-neutral-500 mt-1 mb-2">Vous recevrez l&apos;adresse du créateur après sélection, avec un suivi expédié / reçu. Le délai de production démarre à la réception.</p>
                {productShipping && (
                  <Input label="Quel produit ? (optionnel)" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Ex : 1 sérum vitamine C 30 ml + 1 crème de nuit" maxLength={300} />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Réseaux de diffusion prévus (optionnel)</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleIn(platforms, setPlatforms, p)}
                      className={`px-3 py-1 rounded-full text-sm transition ${platforms.includes(p) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    >
                      {PLATFORMS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {campaignType === 'paid' && <div>
                <Input
                  label="Budget total (€) — facultatif"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder={`Laissez vide pour recevoir des devis libres (suggestion : ${suggestedBudget})`}
                  min={MIN_QUOTE_PRICE}
                />
                <p className="text-xs text-neutral-500 mt-1">Sans budget, chaque créateur propose son prix dans son devis. Vous choisissez ensuite.</p>
                <div className="mt-2 bg-primary-50 border border-primary-100 rounded-lg p-3 text-sm text-neutral-700 space-y-1">
                  <div className="flex items-center gap-2 font-medium text-neutral-900">
                    <Info className="w-4 h-4 text-primary-600" />
                    Suggestion : {formatCurrency(minMarket)} à {formatCurrency(maxMarket)} par vidéo
                    <button type="button" className="text-primary-600 underline ml-1" onClick={() => setBudget(String(suggestedBudget))}>
                      utiliser {formatCurrency(suggestedBudget)}
                    </button>
                  </div>
                  <div className="text-xs text-neutral-500">{marketNote}{nbVideos > 1 ? ` · ${nbVideos} vidéos × ${formatCurrency(medianMarket)}` : ''}</div>
                  {budgetNumber > 0 && (
                    <>
                      <div>Soit <strong>{formatCurrency(perVideo)}</strong> par vidéo affiché aux créateurs.</div>
                      <div>Commission plateforme {feePercent}% incluse{feePercent < PLATFORM_FEE_PERCENT ? ' (réduite)' : ''} : le créateur reçoit {formatCurrency(creatorShare)}. Aucun frais caché.</div>
                    </>
                  )}
                </div>
              </div>}
              {campaignType === 'gifting' && (
                <div className="text-sm text-neutral-700 bg-neutral-50 rounded-lg p-3">Pas de budget : les créateurs candidatent pour recevoir le produit. À la sélection, seuls les frais de plateforme (5 € par vidéo) sont bloqués.</div>
              )}

              <Input
                label="Date limite de candidature"
                type="date"
                value={applicationDeadline}
                onChange={(e) => setApplicationDeadline(e.target.value)}
                min={tomorrow}
                required
              />

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Retour
                </Button>
                <Button
                  onClick={handleSaveDraft}
                  className="flex-1"
                  isLoading={createMutation.isPending || updateMutation.isPending}
                  disabled={!step2Valid}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isEdit ? 'Enregistrer les modifications' : 'Enregistrer le brouillon'}
                </Button>
              </div>
              <MissingHint items={[
                !(budgetNumber === 0 || budgetNumber >= MIN_QUOTE_PRICE) && `un budget d'au moins ${MIN_QUOTE_PRICE} € (ou vide)`,
                !applicationDeadline && 'la date limite de candidature',
                deliveryTypes.length === 0 && 'au moins un mode de livraison',
                campaignType === 'gifting' && (parseFloat(giftingValue) || 0) < 30 && 'une valeur de produit d\'au moins 30 €',
                campaignType === 'gifting' && !productDescription.trim() && 'la description du produit',
                campaignType === 'gifting' && nbVideos > 2 && '2 vidéos maximum en gifting',
              ]} />
            </div>
          )}

          {/* Step 3: Publish */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <div className="text-4xl mb-4">🎉</div>
                <h2 className="text-xl font-semibold text-green-900 mb-2">
                  {isEdit ? 'Modifications enregistrées !' : 'Brouillon enregistré !'}
                </h2>
                <p className="text-green-700">
                  Publiez la campagne pour que les créateurs puissent candidater. Vous ne payez qu&apos;au moment de sélectionner un créateur.
                </p>
              </div>

              <div className="bg-neutral-50 rounded-lg p-6">
                <h3 className="font-semibold text-neutral-900 mb-4">Résumé</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-600">Titre</span>
                    <span className="font-medium text-right">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Type</span>
                    <span className="font-medium">{VIDEO_TYPE_OPTIONS.find(t => t.value === videoType)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Vidéos</span>
                    <span className="font-medium">{nbVideos} × {duration}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Budget</span>
                    <span className="font-medium">{budgetNumber ? `${formatCurrency(budgetNumber)} (${formatCurrency(perVideo)} / vidéo)` : 'Devis libres'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Créateurs recherchés</span>
                    <span className="font-medium">{creatorsWanted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Niches</span>
                    <span className="font-medium">{niches.map(n => NICHES[n]).join(', ')}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/campaigns/${createdCampaignId}`)}
                  className="flex-1"
                >
                  Publier plus tard
                </Button>
                <Button
                  onClick={handlePublish}
                  className="flex-1"
                  isLoading={publishMutation.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Publier maintenant
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewCampaignForm />
    </Suspense>
  );
}
