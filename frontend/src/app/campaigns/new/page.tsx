'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/useAuth';
import { useCreateCampaign, usePublishCampaign } from '@/hooks/useCampaigns';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { ArrowLeft, Save, Send, Info } from 'lucide-react';
import Link from 'next/link';
import { NICHES, NICHE_OPTIONS, VIDEO_TYPE_OPTIONS } from '@/lib/labels';
import { formatCurrency } from '@/lib/utils';

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

export default function NewCampaignPage() {
  const router = useRouter();
  const { ready } = useRequireAuth({ roles: ['brand'] });
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

  if (!ready) return <Spinner />;

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : prev.length >= 5 ? prev : [...prev, niche]
    );
  };

  const nbVideos = Math.max(1, parseInt(deliverables) || 1);
  const [minMarket, maxMarket] = MARKET_PRICES[videoType] || [80, 200];
  const suggestedBudget = Math.round(((minMarket + maxMarket) / 2) * nbVideos);
  const budgetNumber = parseInt(budget) || 0;
  const perVideo = budgetNumber ? Math.round(budgetNumber / nbVideos) : 0;
  const creatorShare = Math.round(budgetNumber * (1 - PLATFORM_FEE_PERCENT / 100));

  const payload = () => ({
    title,
    description,
    videoType,
    duration: parseInt(duration),
    deliverables: nbVideos,
    requirements: requirements.split('\n').map(r => r.trim()).filter(Boolean).slice(0, 10),
    budget: budgetNumber,
    niches,
    applicationDeadline,
  });

  const step1Valid = title.trim().length >= 10 && description.trim().length >= 50 && niches.length > 0;
  const step2Valid = budgetNumber >= 50 && !!applicationDeadline;

  const handleSaveDraft = async () => {
    const result = await createMutation.mutateAsync(payload());
    setCreatedCampaignId(result.campaign._id);
    setStep(3);
  };

  const handlePublish = async () => {
    let id = createdCampaignId;
    if (!id) {
      const result = await createMutation.mutateAsync(payload());
      id = result.campaign._id;
      setCreatedCampaignId(id);
    }
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
            Créer une campagne
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
            </div>
          )}

          {/* Step 2: Brief */}
          {step === 2 && (
            <div className="space-y-6">
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

              <div>
                <Input
                  label="Budget total (€, minimum 50)"
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder={String(suggestedBudget)}
                  min={50}
                  required
                />
                <div className="mt-2 bg-primary-50 border border-primary-100 rounded-lg p-3 text-sm text-neutral-700 space-y-1">
                  <div className="flex items-center gap-2 font-medium text-neutral-900">
                    <Info className="w-4 h-4 text-primary-600" />
                    Suggestion marché : {formatCurrency(minMarket)} à {formatCurrency(maxMarket)} par vidéo
                    <button type="button" className="text-primary-600 underline ml-1" onClick={() => setBudget(String(suggestedBudget))}>
                      utiliser {formatCurrency(suggestedBudget)}
                    </button>
                  </div>
                  {budgetNumber > 0 && (
                    <>
                      <div>Soit <strong>{formatCurrency(perVideo)}</strong> par vidéo affiché aux créateurs.</div>
                      <div>Commission plateforme {PLATFORM_FEE_PERCENT}% incluse : le créateur reçoit {formatCurrency(creatorShare)}. Aucun frais caché.</div>
                    </>
                  )}
                </div>
              </div>

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
                  isLoading={createMutation.isPending}
                  disabled={!step2Valid}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer le brouillon
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Publish */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <div className="text-4xl mb-4">🎉</div>
                <h2 className="text-xl font-semibold text-green-900 mb-2">
                  Brouillon enregistré !
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
                    <span className="font-medium">{formatCurrency(budgetNumber)} ({formatCurrency(perVideo)} / vidéo)</span>
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
