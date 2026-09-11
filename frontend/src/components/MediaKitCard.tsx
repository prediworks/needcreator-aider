'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Share2, Copy, Download, ExternalLink } from 'lucide-react';

/**
 * Kit média : lien court public, QR code, texte de partage. Chaque créateur devient apporteur de marques.
 */
export default function MediaKitCard() {
  const { data, isLoading } = useQuery({ queryKey: ['media-kit'], queryFn: async () => (await api.get('/auth/media-kit')).data, staleTime: 3600000 });
  const copy = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); toast.success(`${label} copié`); } catch { toast.error('Copie impossible'); } };
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Share2 className="w-5 h-5 text-primary-500" /> Mon kit média</h2>
      <p className="text-sm text-neutral-600 mb-4">Votre page publique en une adresse courte : portfolio, niches, note, réseaux et un bouton « Me proposer une mission ». Mettez-la dans votre bio Instagram ou TikTok, envoyez-la aux marques, imprimez le QR code. Une marque qui arrive par ce lien vous retrouve directement.</p>
      {isLoading || !data ? <p className="text-sm text-neutral-500">Chargement…</p> : (
        <div className="grid sm:grid-cols-[1fr_auto] gap-5 items-start">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm bg-neutral-100 px-3 py-2 rounded-lg break-all">{data.url}</code>
              <Button size="sm" variant="outline" onClick={() => copy(data.url, 'Lien')}><Copy className="w-4 h-4 mr-1" /> Copier</Button>
              <a href={data.url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost"><ExternalLink className="w-4 h-4 mr-1" /> Voir ma page</Button></a>
            </div>
            <div className="text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
              <div className="text-xs text-neutral-500 mb-1">Texte prêt à coller (bio, email, message)</div>
              <p>{data.shareText}</p>
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => copy(data.shareText, 'Texte')}><Copy className="w-4 h-4 mr-1" /> Copier le texte</Button>
            </div>
          </div>
          <div className="text-center">
            <img src={data.qr} alt="QR code vers ma page" width={144} height={144} className="rounded-lg border border-neutral-200 mx-auto" />
            <a href={data.qr} download={`qr-needcreator-${data.slug}.png`} className="inline-flex items-center gap-1 text-xs text-primary-600 underline mt-2"><Download className="w-3.5 h-3.5" /> Télécharger le QR code</a>
          </div>
        </div>
      )}
    </Card>
  );
}
