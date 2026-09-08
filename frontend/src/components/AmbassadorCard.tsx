'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Megaphone, CheckCircle, Clock } from 'lucide-react';

/**
 * Incitation "Parlez de NeedCreator" → badge Ambassadeur + accès anticipé 24 h
 */
export default function AmbassadorCard({ ambassador, compact = false }: { ambassador?: any; compact?: boolean }) {
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const status = ambassador?.status || 'none';

  const submit = useMutation({
    mutationFn: async () => (await api.post('/auth/ambassador', { videoUrl: url })).data,
    onSuccess: async (data) => {
      toast.success(data.message);
      setUrl('');
      await Promise.all([refreshUser(), queryClient.invalidateQueries({ queryKey: ['profile'] })]);
    },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  if (status === 'approved') {
    if (compact) return null;
    return (
      <Card className="p-5 bg-yellow-50 border-yellow-200">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌟</span>
          <div>
            <h3 className="font-semibold text-yellow-900">Vous êtes Ambassadeur NeedCreator</h3>
            <p className="text-sm text-yellow-800 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Vous voyez les nouvelles campagnes 24 h avant tout le monde.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-yellow-200 bg-gradient-to-r from-yellow-50 to-white">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Megaphone className="w-5 h-5 text-yellow-700" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-neutral-900">Parlez de NeedCreator, accédez aux campagnes 24 h avant tout le monde</h3>
          <p className="text-sm text-neutral-700 mt-1">
            Publiez une courte vidéo sur vos réseaux (TikTok, Instagram, YouTube…) où vous présentez NeedCreator, collez le lien ci-dessous.
            Une fois validée, vous obtenez le badge <strong>🌟 Ambassadeur</strong> visible par les marques et l&apos;avant-première sur toutes les nouvelles campagnes.
          </p>
          {status === 'pending' ? (
            <p className="text-sm text-orange-700 mt-3 flex items-center gap-1">
              <Clock className="w-4 h-4" /> Vidéo envoyée, vérification en cours (sous 24 h).{' '}
              <a href={ambassador.videoUrl} target="_blank" rel="noopener noreferrer" className="underline">Voir</a>
            </p>
          ) : (
            <>
              {status === 'rejected' && (
                <p className="text-sm text-red-700 mt-2">Votre précédente vidéo n&apos;a pas été retenue{ambassador?.note ? ` : ${ambassador.note}` : ''}. Vous pouvez en proposer une autre.</p>
              )}
              <div className="flex gap-2 mt-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@vous/video/…" type="url" />
                </div>
                <Button onClick={() => submit.mutate()} isLoading={submit.isPending} disabled={!/^https?:\/\//.test(url)}>
                  Envoyer ma vidéo
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
