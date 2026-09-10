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
            <p className="text-sm text-yellow-800 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Campagnes 24 h en avant-première, devis remontés en tête chez les marques, place en tête de l&apos;annuaire, badge dans les emails aux marques.</p>
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
          <h3 className="font-semibold text-neutral-900">Programme Ambassadeur : parlez de NeedCreator, soyez mis en avant auprès des marques</h3>
          <p className="text-sm text-neutral-700 mt-1">
            Publiez sur vos réseaux (TikTok, Instagram, YouTube…) une vidéo de 30 à 90 secondes, sincère, qui explique ce que NeedCreator vous apporte,
            avec votre lien de parrainage en description. Dès qu&apos;elle est publiée, collez son lien ci-dessous : nous la validons sous 24 h. Elle doit rester en ligne au moins 30 jours.
          </p>
          <p className="text-sm text-neutral-800 mt-3 italic">Plus de visibilité auprès des marques, donc plus de chances d&apos;être sélectionné :</p>
          <ul className="text-sm text-neutral-700 mt-1 space-y-1">
            <li>🌟 Badge <strong>Ambassadeur</strong> visible par les marques</li>
            <li>⏱️ Nouvelles campagnes <strong>24 h en avant-première</strong></li>
            <li>📈 Vos devis <strong>remontent en tête</strong> chez les marques (bonus de matching) et vous êtes en tête de l&apos;annuaire</li>
            <li>🏠 Présence sur la <strong>page d&apos;accueil</strong> NeedCreator, si vous l&apos;autorisez dans votre portfolio</li>
            <li>🎁 Bonus de parrainage pour chaque créateur inscrit via votre lien</li>
          </ul>
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
