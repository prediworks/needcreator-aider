'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/useAuth';
import { useApproveCreator, useRejectCreator, useResetStripeConnect } from '@/hooks/useAdmin';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import { ArrowLeft, CheckCircle, XCircle, CreditCard, Trash2, RefreshCw } from 'lucide-react';
import { NICHES, VIDEO_TYPES, USER_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/utils';
import { SocialLinks } from '@/components/admin/CreatorFilters';

export default function AdminCreatorPage() {
  const params = useParams();
  const router = useRouter();
  const { ready } = useRequireAuth({ roles: ['admin'] });
  const userId = params.id as string;
  const approve = useApproveCreator();
  const reject = useRejectCreator();
  const resetConnect = useResetStripeConnect();

  const queryClient = useQueryClient();
  const reprocess = useMutation({ mutationFn: async (videoId: string) => (await api.post(`/admin/users/${userId}/portfolio/${videoId}/reprocess`)).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); setTimeout(() => queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] }), 90000); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: async () => (await api.get(`/admin/users/${userId}`)).data.user,
    enabled: ready && !!userId,
  });

  if (!ready || isLoading) return <Spinner />;
  if (!data) return <div className="p-8 text-center text-neutral-600">Utilisateur introuvable</div>;

  const p = data.profile || {};

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => router.push('/admin')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Retour à l&apos;administration
        </Button>

        <Card className="p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">{p.name}</h1>
              <p className="text-neutral-600">{data.email} · inscrit le {formatDate(data.createdAt)}</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge map={USER_STATUS} value={data.status} />
                {(p.niches || []).map((n: string) => (
                  <span key={n} className="px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-xs">{NICHES[n] || n}</span>
                ))}
                {p.pricing?.minPrice && <span className="text-sm text-neutral-600">dès {p.pricing.minPrice}€</span>}
              </div>
              {p.bio && <p className="text-neutral-700 mt-3 whitespace-pre-line">{p.bio}</p>}
              <div className="mt-3 text-sm" data-testid="admin-creator-socials"><span className="text-neutral-500 mr-2">Réseaux :</span><SocialLinks socials={p.socials} views /></div>
              {(p.realisations || []).length > 0 && (
                <div className="mt-2 text-sm">
                  <span className="text-neutral-500 mr-2">Réalisations extérieures :</span>
                  <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">{p.realisations.map((r: any, i: number) => <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline" title={r.url}>{r.title || r.platform || 'vidéo'}{r.brandName ? ` (${r.brandName})` : ''}</a>)}</span>
                </div>
              )}
              {(() => { const a: any = p.address?.city ? p.address : data.legalInfo?.address || {}; return (
                <div className="mt-2 text-xs text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
                  {a.city && <span>{a.city}{a.postalCode ? ` (${String(a.postalCode).slice(0, 2)})` : ''}</span>}
                  <span>{p.stats?.completedJobs || 0} mission{(p.stats?.completedJobs || 0) > 1 ? 's' : ''} réalisée{(p.stats?.completedJobs || 0) > 1 ? 's' : ''}</span>
                  {p.stats?.totalReviews > 0 && <span>note {Number(p.stats.rating).toFixed(1)}/5 ({p.stats.totalReviews} avis)</span>}
                  <span>{data.lastLoginAt ? `dernière connexion le ${formatDate(data.lastLoginAt)}` : 'jamais connecté depuis le suivi'}</span>
                  <span className={data.verification?.business?.status === 'verified' ? 'text-green-700' : 'text-orange-700'}>{data.verification?.business?.status === 'verified' ? 'entreprise vérifiée' : 'entreprise non vérifiée'}</span>
                </div>
              ); })()}
            </div>
            {data.status !== 'active' && (
              <div className="flex gap-2">
                <Button onClick={() => approve.mutate({ userId }, { onSuccess: () => router.push('/admin') })} isLoading={approve.isPending}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Valider
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const reason = prompt('Motif du refus :') || '';
                    reject.mutate({ userId, reason }, { onSuccess: () => router.push('/admin') });
                  }}
                  isLoading={reject.isPending}
                >
                  <XCircle className="w-4 h-4 mr-1" /> Refuser
                </Button>
              </div>
            )}
          </div>
        </Card>

        {data.role === 'creator' && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Paiements (Stripe Connect)</h2>
            {p.stripeConnect?.accountId ? (
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="text-sm text-neutral-700">
                  <div>Compte <code className="text-xs bg-neutral-100 px-1 rounded">{p.stripeConnect.accountId}</code></div>
                  <div className="mt-1">
                    {p.stripeConnect.payoutsEnabled ? 'Virements activés' : p.stripeConnect.detailsSubmitted ? 'Informations transmises, en attente de validation Stripe' : 'Onboarding non terminé'}
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  isLoading={resetConnect.isPending}
                  onClick={() => {
                    if (confirm('Supprimer le compte Stripe Connect de ce créateur ? Il devra refaire l\'onboarding pour recevoir des paiements.')) {
                      resetConnect.mutate({ userId });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer le compte Connect
                </Button>
              </div>
            ) : (
              <p className="text-sm text-neutral-600">Aucun compte Connect : le créateur n&apos;a pas encore lancé la connexion Stripe.</p>
            )}
          </Card>
        )}

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Portfolio ({p.portfolio?.length || 0} vidéo(s))</h2>
          {p.portfolio?.length ? (
            <div className="grid md:grid-cols-2 gap-4">
              {p.portfolio.map((v: any, i: number) => (
                <div key={v._id || i} className="border border-neutral-200 rounded-lg overflow-hidden">
                  <VideoPlayer src={v.videoUrl} title={v.title} className="rounded-none" />
                  <div className="p-3">
                    <div className="font-medium">{v.title}</div>
                    <div className="text-xs text-neutral-500">{VIDEO_TYPES[v.videoType] || v.videoType}{v.sourceCodec ? ` · fichier d'origine : ${v.sourceCodec === 'h264' ? 'H.264, lisible partout' : `${v.sourceCodec.toUpperCase()}, réencodé pour la lecture`}` : ''}</div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                      {v.processing === 'ok' && <span className="text-green-700">Aperçu filigrané prêt</span>}
                      {v.processing === 'pending' && <span className="text-neutral-500">Traitement en attente (quelques minutes après l&apos;envoi)</span>}
                      {v.processing === 'retry' && <span className="text-orange-700" title={v.watermarkError}>Échec du traitement, nouvel essai automatique</span>}
                      {v.processing === 'failed' && <span className="text-red-700" title={v.watermarkError}>Échec du traitement après 3 essais : fichier probablement corrompu ou format non pris en charge</span>}
                      <button type="button" onClick={() => reprocess.mutate(v._id)} disabled={reprocess.isPending} className="inline-flex items-center gap-1 text-primary-700 hover:underline disabled:opacity-50" title="Relance le réencodage : aperçu filigrané pour les visiteurs et version lisible dans tous les navigateurs. Utile si l'image reste noire avec le son (vidéo iPhone en HEVC) ou après un échec."><RefreshCw className="w-3 h-3" /> Réencoder</button>
                      {v.originalUrl && v.originalUrl !== v.videoUrl && <a href={v.originalUrl} target="_blank" rel="noopener noreferrer" className="text-neutral-500 hover:underline" title="Fichier tel qu'envoyé par le créateur (peut ne pas se lire dans ce navigateur)">fichier d&apos;origine</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-center py-8">Aucune vidéo envoyée pour le moment</p>
          )}
        </Card>
      </div>
    </div>
  );
}
