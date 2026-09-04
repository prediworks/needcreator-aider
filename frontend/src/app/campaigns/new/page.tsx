'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useCreateCampaign, usePublishCampaign } from '@/hooks/useCampaigns';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ArrowLeft, Save, Send } from 'lucide-react';
import Link from 'next/link';

export default function NewCampaignPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
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
  const [requirements, setRequirements] = useState('');
  const [budget, setBudget] = useState('');
  const [niches, setNiches] = useState<string[]>([]);
  const [applicationDeadline, setApplicationDeadline] = useState('');

  const videoTypes = [
    { value: 'testimonial', label: 'Témoignage' },
    { value: 'unboxing', label: 'Unboxing' },
    { value: 'demo', label: 'Démonstration' },
    { value: 'tutorial', label: 'Tutoriel' },
    { value: 'review', label: 'Avis' },
    { value: 'lifestyle', label: 'Lifestyle' },
  ];

  const nicheOptions = [
    'beauty', 'fashion', 'tech', 'food', 'travel',
    'fitness', 'gaming', 'lifestyle', 'parenting', 'pets',
    'home', 'business', 'education', 'health'
  ];

  if (!isAuthenticated || user?.role !== 'brand') {
    router.push('/dashboard');
    return null;
  }

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : [...prev, niche]
    );
  };

  const handleSaveDraft = async () => {
    const data = {
      title,
      description,
      videoType,
      duration: parseInt(duration),
      deliverables: parseInt(deliverables),
      requirements: requirements.split('\n').filter(r => r.trim()),
      budget: parseInt(budget),
      niches,
      applicationDeadline,
    };

    const result = await createMutation.mutateAsync(data);
    setCreatedCampaignId(result.campaign._id);
    setStep(3);
  };

  const handlePublish = async () => {
    if (createdCampaignId) {
      await publishMutation.mutateAsync(createdCampaignId);
      router.push('/dashboard');
    } else {
      // Create and publish in one go
      const data = {
        title,
        description,
        videoType,
        duration: parseInt(duration),
        deliverables: parseInt(deliverables),
        requirements: requirements.split('\n').filter(r => r.trim()),
        budget: parseInt(budget),
        niches,
        applicationDeadline,
      };

      const result = await createMutation.mutateAsync(data);
      await publishMutation.mutateAsync(result.campaign._id);
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au dashboard
          </Button>
        </Link>

        <Card className="p-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Créer une campagne
          </h1>
          <p className="text-neutral-600 mb-8">
            Remplissez les informations pour créer votre campagne UGC
          </p>

          {/* Progress */}
          <div className="flex items-center justify-between mb-8">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary-600' : 'text-neutral-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step >= 1 ? 'bg-primary-500 text-white' : 'bg-neutral-200'
              }`}>
                1
              </div>
              <span className="text-sm font-medium">Informations</span>
            </div>
            <div className="flex-1 h-0.5 bg-neutral-200 mx-4"></div>
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary-600' : 'text-neutral-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step >= 2 ? 'bg-primary-500 text-white' : 'bg-neutral-200'
              }`}>
                2
              </div>
              <span className="text-sm font-medium">Brief</span>
            </div>
            <div className="flex-1 h-0.5 bg-neutral-200 mx-4"></div>
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary-600' : 'text-neutral-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step >= 3 ? 'bg-primary-500 text-white' : 'bg-neutral-200'
              }`}>
                3
              </div>
              <span className="text-sm font-medium">Publication</span>
            </div>
          </div>

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <Input
                label="Titre de la campagne"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Vidéo UGC pour notre nouveau produit"
                required
              />

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez votre campagne en détail..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={5}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Niches (sélectionnez au moins 1)
                </label>
                <div className="flex flex-wrap gap-2">
                  {nicheOptions.map(niche => (
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
                      {niche}
                    </button>
                  ))}
                </div>
              </div>

              <Button 
                onClick={() => setStep(2)} 
                className="w-full"
                disabled={!title || !description || niches.length === 0}
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
                  {videoTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Durée (secondes)"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  min="15"
                  max="180"
                  required
                />

                <Input
                  label="Nombre de vidéos"
                  type="number"
                  value={deliverables}
                  onChange={(e) => setDeliverables(e.target.value)}
                  min="1"
                  max="10"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Exigences (une par ligne)
                </label>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder="Ex: Montrer le produit en action&#10;Parler des bénéfices&#10;Inclure un call-to-action"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={5}
                />
              </div>

              <Input
                label="Budget total (€)"
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="300"
                min="50"
                required
              />

              <Input
                label="Date limite de candidature"
                type="date"
                value={applicationDeadline}
                onChange={(e) => setApplicationDeadline(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
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
                  disabled={!budget || !applicationDeadline}
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
                  Campagne créée avec succès !
                </h2>
                <p className="text-green-700">
                  Votre campagne est enregistrée en brouillon. Vous pouvez maintenant la publier pour recevoir des candidatures.
                </p>
              </div>

              <div className="bg-neutral-50 rounded-lg p-6">
                <h3 className="font-semibold text-neutral-900 mb-4">Résumé</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Titre:</span>
                    <span className="font-medium">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Type:</span>
                    <span className="font-medium">{videoType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Vidéos:</span>
                    <span className="font-medium">{deliverables}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Budget:</span>
                    <span className="font-medium">{budget}€</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <Button 
                  variant="outline"
                  onClick={() => router.push('/dashboard')}
                  className="flex-1"
                >
                  Retour au dashboard
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
