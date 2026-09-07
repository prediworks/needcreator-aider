'use client';

import { useState, Suspense } from 'react';
import { useRequireAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useUploadPortfolioVideo, useDeletePortfolioVideo } from '@/hooks/usePortfolio';
import { useUserReviews } from '@/hooks/useReviews';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import StripeConnectCard from '@/components/StripeConnectCard';
import AmbassadorCard from '@/components/AmbassadorCard';
import LevelBadges from '@/components/LevelBadges';
import { Stars } from '@/components/ReviewForm';
import { ArrowLeft, Upload, Trash2, Save, Video, Plus, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { NICHES, NICHE_OPTIONS, VIDEO_TYPES, VIDEO_TYPE_OPTIONS, INDUSTRIES, USER_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/utils';

function ProfileContent() {
  const { user, ready } = useRequireAuth();
  const { data: profile, isLoading } = useProfile(ready);
  const updateMutation = useUpdateProfile();
  const uploadVideoMutation = useUploadPortfolioVideo();
  const deleteVideoMutation = useDeletePortfolioVideo();
  const { data: reviewsData } = useUserReviews(ready ? (user?.id || user?._id) : undefined);

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

  if (!ready || isLoading || !profile) return <Spinner />;

  const isCreator = profile.role === 'creator';
  const blockers: string[] = profile.applyBlockers || [];

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

    if (isCreator) {
      updates.profile = {
        name,
        bio,
        niches,
        pricing: { minPrice: parseInt(minPrice) },
      };
    } else {
      updates.profile = { name: companyName, companyName, website, industry };
    }

    await updateMutation.mutateAsync(updates);
    setIsEditing(false);
  };

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : prev.length >= 5 ? prev : [...prev, niche]
    );
  };

  const handleVideoUpload = async () => {
    if (!selectedVideo) return;
    if (selectedVideo.size > 500 * 1024 * 1024) {
      alert('La vidéo dépasse 500 Mo');
      return;
    }
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
    if (confirm('Supprimer cette vidéo de votre portfolio ?')) {
      await deleteVideoMutation.mutateAsync(videoId);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour au tableau de bord
          </Button>
        </Link>

        <div className="space-y-6">
          {/* Statut créateur */}
          {isCreator && profile.status === 'pending' && (
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900">Profil en attente de validation</h3>
                  <p className="text-sm text-yellow-800">
                    Notre équipe vérifie votre profil sous 24h. Profitez-en pour ajouter au moins 3 vidéos à votre portfolio et connecter votre compte Stripe.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Header */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary-600">
                    {profile.profile.name?.[0] || profile.profile.companyName?.[0] || 'U'}
                  </span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900">
                    {profile.profile.companyName || profile.profile.name}
                  </h1>
                  <div className="flex items-center gap-2 text-neutral-600 flex-wrap">
                    <span>{isCreator ? 'Créateur UGC' : profile.role === 'admin' ? 'Administrateur' : 'Marque'}</span>
                    <Badge map={USER_STATUS} value={profile.status} />
                    {isCreator && <LevelBadges badges={profile.badges} />}
                  </div>
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
                <div>
                  <h3 className="text-sm font-medium text-neutral-700 mb-1">Email</h3>
                  <p className="text-neutral-900">{profile.email}</p>
                </div>

                {profile.profile.bio && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-1">Bio</h3>
                    <p className="text-neutral-900 whitespace-pre-line">{profile.profile.bio}</p>
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
                          {NICHES[niche] || niche}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isCreator && profile.profile.pricing?.minPrice && (
                  <div>
                    <h3 className="text-sm font-medium text-neutral-700 mb-1">Tarif minimum par vidéo</h3>
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
                        <h3 className="text-sm font-medium text-neutral-700 mb-1">Secteur</h3>
                        <p className="text-neutral-900">{INDUSTRIES[profile.profile.industry] || profile.profile.industry}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {isCreator && (
                  <>
                    <Input
                      label="Nom ou pseudo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
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
                        Niches (1 à 5)
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

                    <Input
                      label="Tarif minimum par vidéo (€)"
                      type="number"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      min={50}
                      max={10000}
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
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">Secteur</label>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {Object.entries(INDUSTRIES).map(([value, l]) => (
                          <option key={value} value={value}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    isLoading={updateMutation.isPending}
                    className="flex-1"
                    disabled={isCreator && niches.length === 0}
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

          {/* Ambassadeur (créateur) */}
          {isCreator && <AmbassadorCard ambassador={profile.profile.ambassador} />}

          {/* Stripe Connect (créateur) */}
          {isCreator && <StripeConnectCard />}

          {/* Portfolio (Creator only) */}
          {isCreator && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Portfolio ({profile.profile.portfolio?.length || 0} vidéo{(profile.profile.portfolio?.length || 0) > 1 ? 's' : ''})
                </h2>
                <Button
                  size="sm"
                  onClick={() => setShowVideoUpload(!showVideoUpload)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter une vidéo
                </Button>
              </div>
              <p className="text-sm text-neutral-500 mb-6">
                Les marques regardent vos vidéos directement ici. 3 vidéos minimum pour candidater, montrez votre meilleur travail.
              </p>

              {/* Video Upload Form */}
              {showVideoUpload && (
                <div className="mb-6 p-4 bg-neutral-50 rounded-lg space-y-4">
                  <h3 className="font-medium text-neutral-900">Nouvelle vidéo</h3>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Fichier vidéo (MP4, MOV… jusqu&apos;à 500 Mo)
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
                    placeholder="Ex : Unboxing skincare pour marque bio"
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
                      rows={2}
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
                      {VIDEO_TYPE_OPTIONS.map(type => (
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
                      {uploadVideoMutation.isPending ? 'Envoi en cours…' : 'Envoyer'}
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
                      className="border border-neutral-200 rounded-lg overflow-hidden hover:border-primary-500 transition"
                    >
                      <VideoPlayer src={video.videoUrl} title={video.title} className="rounded-none" />
                      <div className="p-4 flex items-start gap-3">
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
                              {VIDEO_TYPES[video.videoType] || video.videoType}
                            </span>
                            {video.uploadedAt && <span>{formatDate(video.uploadedAt)}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteVideo(video._id)}
                          className="text-red-500 hover:text-red-700 p-2"
                          title="Supprimer"
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

          {/* Stats + avis */}
          {isCreator && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-6">
                Statistiques
              </h2>
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Missions complétées</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {profile.profile.stats?.completedJobs || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Note moyenne</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {profile.profile.stats?.totalReviews ? `${profile.profile.stats.rating.toFixed(1)} ⭐` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Avis reçus</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {profile.profile.stats?.totalReviews || 0}
                  </p>
                </div>
              </div>
              {profile.nextLevel && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-3">
                  <strong>Niveau suivant :</strong> {profile.nextLevel.message}
                </div>
              )}
              {blockers.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                  <strong>Pour candidater :</strong> {blockers.join(' ')}
                </div>
              )}
            </Card>
          )}

          {(reviewsData?.reviews?.length ?? 0) > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">Avis reçus</h2>
              <div className="space-y-4">
                {(reviewsData?.reviews || []).map((r: any) => (
                  <div key={r._id} className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-neutral-900">{r.reviewerId?.profile?.companyName || r.reviewerId?.profile?.name}</span>
                      <Stars value={r.rating} size="w-4 h-4" />
                    </div>
                    <p className="text-xs text-neutral-500 mb-1">{r.campaignId?.title} · {formatDate(r.createdAt)}</p>
                    {r.comment && <p className="text-neutral-700">{r.comment}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProfileContent />
    </Suspense>
  );
}
