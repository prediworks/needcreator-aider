'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRequireAuth } from '@/hooks/useAuth';
import { useApproveCreator, useRejectCreator } from '@/hooks/useAdmin';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { NICHES, VIDEO_TYPES, USER_STATUS } from '@/lib/labels';
import { formatDate } from '@/lib/utils';

export default function AdminCreatorPage() {
  const params = useParams();
  const router = useRouter();
  const { ready } = useRequireAuth({ roles: ['admin'] });
  const userId = params.id as string;
  const approve = useApproveCreator();
  const reject = useRejectCreator();

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

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Portfolio ({p.portfolio?.length || 0} vidéo(s))</h2>
          {p.portfolio?.length ? (
            <div className="grid md:grid-cols-2 gap-4">
              {p.portfolio.map((v: any, i: number) => (
                <div key={v._id || i} className="border border-neutral-200 rounded-lg overflow-hidden">
                  <VideoPlayer src={v.videoUrl} title={v.title} className="rounded-none" />
                  <div className="p-3">
                    <div className="font-medium">{v.title}</div>
                    <div className="text-xs text-neutral-500">{VIDEO_TYPES[v.videoType] || v.videoType}</div>
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
