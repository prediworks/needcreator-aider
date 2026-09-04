'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useUploadPortfolioVideo, useDeletePortfolioVideo } from '@/hooks/usePortfolio';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ArrowLeft, Upload, Trash2, Save, Video, Plus } from 'lucide-react';
import Link from 'next/link';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateMutation = useUpdateProfile();
  const uploadVideoMutation = useUploadPortfolioVideo();
  const deleteVideoMutation = useDeletePortfolioVideo();

  const [isEditing, setIsEditing] = useState(false);
  const [showVideoUpload, setShowVideoUpload] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [niches, setNiches] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');

  // Video upload state
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoType, setVideoType] = useState('testimonial');

  const nicheOptions = [
    'beauty', 'fashion', 'tech', 'food', 'travel',
    'fitness', 'gaming', 'lifestyle', 'parenting', 'pets',
    'home', 'business', 'education', 'health'
  ];

  const videoTypes = [
    { value: 'testimonial', label: 'Témoignage' },
    { value: 'unboxing', label: 'Unboxing' },
    { value: 'demo', label: 'Démonstration' },
    { value: 'tutorial', label: 'Tutoriel' },
    { value: 'review', label: 'Avis' },
    { value: 'lifestyle', label: 'Lifestyle' },
  ];

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const startEditing = () => {
    setName(profile.profile.name || '');
    setBio(profile.profile.bio || '');
    setNiches(profile.profile.niches || []);
    setMinPrice(profile.profile.pricing?.minPrice?.toString() || '');
    setCompanyName(profile.profile.companyName || '');
    setWebsite(profile.profile.website || '');
    setIndustry(profile.profile.industry || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    const updates: any = {};

    if (profile.role === 'creator') {
      updates.profile = {
        name,
        bio,
        niches,
        pricing: {
          minPrice: parseInt(minPrice),
        },
      };
    } else if (profile.role === 'brand') {
      updates.profile = {
        name,
        companyName,
        website,
        industry,
      };
    }

    await updateMutation.mutateAsync(updates);
    setIsEditing(false);
  };

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : [...prev, niche]
    );
  };

  const handleVideoUpload = async () => {
    if (!selectedVideo) return;

    await uploadVideoMutation.mutateAsync({
      file: selectedVideo,
      title: videoTitle,
      description: videoDescription,
      videoType,
    });

    setSelectedVideo(null);
    setVideoTitle('');
    setVideoDescription('');
    setShowVideoUpload(false);
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette vidéo ?')) {
      await deleteVideoMutation.mutateAsync(videoId);
    }
  };

  const isCreator = profile.role === 'creator';

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au dashboard
          </Button>
        </Link>

        <div className="space-y-6">
          {/* Header */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary-600">
                    {profile.profile.name?.[0] || profile.profile.companyName?.[0] || 'U'}
                  </span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900">
                    {profile.profile.name || profile.profile.companyName}
                  </h1>
                  <p className="text-neutral-600">
                    {profile.role === 'creator' ? 'Créateur UGC' : 'Marque'}
                  </p>
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 transition-all"
                          style={{ width: `${profile.profileCompletion}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-neutral-600">
                        {profile.profileCompletion}% complété
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {!isEditing && (
                <Button onClick={startEditing}>
                  Modifier le profil
                </Button>
              )}
            </div>

            {/* Profile Info */}
            {!isEditing ? (
              <div className="space-y-4">
                {profile.profile.bio && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-1">Bio</h3>
                    <p className="text-neutral-900">{profile.profile.bio}</p>
                  </div>
                )}

                {isCreator && profile.profile.niches?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-2">Niches</h3>
                    <div className="flex flex-wrap gap-2">
                      {profile.profile.niches.map((niche: string) => (
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

                {isCreator && profile.profile.pricing?.minPrice && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-1">Tarif minimum</h3>
                    <p className="text-2xl font-bold text-primary-600">
                      {profile.profile.pricing.minPrice}€
                    </p>
                  </div>
                )}

                {!isCreator && (
                  <>
                    {profile.profile.website && (
                      <div>
                        <h3 className="text-sm font-medium text-neutral-700 mb-1">Site web</h3>
                        <a
                          href={profile.profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-700"
                        >
                          {profile.profile.website}
                        </a>
                      </div>
                    )}
                    {profile.profile.industry && (
                      <div>
                        <h3 className="text-sm font-medium text-neutral-700 mb-1">Industrie</h3>
                        <p className="text-neutral-900">{profile.profile.industry}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Input
                  label="Nom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                {isCreator && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Bio
                      </label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        rows={4}
                        maxLength={500}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Niches
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

                    <Input
                      label="Tarif minimum (€)"
                      type="number"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      min="50"
                      required
                    />
                  </>
                )}

                {!isCreator && (
                  <>
                    <Input
                      label="Nom de l'entreprise"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                    />
                    <Input
                      label="Site web"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      required
                    />
                    <Input
                      label="Industrie"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      required
                    />
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    isLoading={updateMutation.isPending}
                    className="flex-1"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Enregistrer
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Portfolio (Creator only) */}
          {isCreator && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Portfolio ({profile.profile.portfolio?.length || 0} vidéos)
                </h2>
                <Button
                  size="sm"
                  onClick={() => setShowVideoUpload(!showVideoUpload)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une vidéo
                </Button>
              </div>

              {/* Video Upload Form */}
              {showVideoUpload && (
                <div className="mb-6 p-4 bg-neutral-50 rounded-lg space-y-4">
                  <h3 className="font-medium text-neutral-900">Nouvelle vidéo</h3>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Fichier vidéo
                    </label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => setSelectedVideo(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-neutral-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary-50 file:text-primary-700
                        hover:file:bg-primary-100"
                    />
                  </div>

                  <Input
                    label="Titre"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Description (optionnel)
                    </label>
                    <textarea
                      value={videoDescription}
                      onChange={(e) => setVideoDescription(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
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

                  <div className="flex gap-2">
                    <Button
                      onClick={handleVideoUpload}
                      isLoading={uploadVideoMutation.isPending}
                      disabled={!selectedVideo || !videoTitle}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Uploader
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowVideoUpload(false);
                        setSelectedVideo(null);
                        setVideoTitle('');
                        setVideoDescription('');
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {/* Portfolio Grid */}
              {profile.profile.portfolio?.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {profile.profile.portfolio.map((video: any) => (
                    <div
                      key={video._id}
                      className="border border-neutral-200 rounded-lg p-4 hover:border-primary-500 transition"
                    >
                      <div className="flex items-start gap-3">
                        <Video className="w-10 h-10 text-primary-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-neutral-900 mb-1">
                            {video.title}
                          </h4>
                          {video.description && (
                            <p className="text-sm text-neutral-600 mb-2">
                              {video.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span className="px-2 py-1 bg-neutral-100 rounded">
                              {video.videoType}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteVideo(video._id)}
                          className="text-red-500 hover:text-red-700 p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500">
                  <Video className="w-16 h-16 mx-auto mb-4 text-neutral-300" />
                  <p>Aucune vidéo dans votre portfolio</p>
                  <p className="text-sm mt-1">
                    Ajoutez au moins 3 vidéos pour pouvoir candidater aux campagnes
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Stats */}
          {isCreator && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-6">
                Statistiques
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Missions complétées</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {profile.profile.stats?.completedJobs || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Note moyenne</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {profile.profile.stats?.rating?.toFixed(1) || '0.0'} ⭐
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Avis reçus</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {profile.profile.stats?.totalReviews || 0}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
