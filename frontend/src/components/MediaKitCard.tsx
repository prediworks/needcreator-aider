'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Share2, Copy, Download, ExternalLink, Award, Code2 } from 'lucide-react';

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

      {/* Badges partageables : images prêtes pour story, carré, LinkedIn */}
      {data?.badges?.length > 0 && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Award className="w-4 h-4 text-primary-500" /> Mes badges à partager</h3>
          <p className="text-sm text-neutral-600 mb-3">Une image par badge, aux bons formats, avec votre nom et le lien de votre page. Publiez-la en story, en post ou sur LinkedIn : chaque partage ramène des marques vers vous.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {data.badges.map((b: any) => (
              <div key={b.kind} className="border border-neutral-200 rounded-lg p-3">
                <img src={b.images.square} alt={b.label} className="w-full rounded-lg border border-neutral-100 mb-2" loading="lazy" />
                <div className="font-medium text-neutral-900 text-sm mb-1">{b.label}</div>
                <div className="flex gap-2 flex-wrap text-xs">
                  {[['story', 'Story 9:16'], ['square', 'Carré'], ['linkedin', 'LinkedIn']].map(([k, l]) => (
                    <a key={k} href={b.images[k]} download={`badge-${b.kind}-${k}-needcreator.png`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50"><Download className="w-3 h-3" /> {l}</a>
                  ))}
                  <button type="button" className="inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50" onClick={() => copy(b.text, 'Texte')}><Copy className="w-3 h-3" /> Texte du post</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Widget créateur vérifié : à coller dans une bio de site ou un blog */}
      {data?.widget && (
        <div className="mt-6 border-t border-neutral-100 pt-5">
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Code2 className="w-4 h-4 text-primary-500" /> Widget « Créateur vérifié NeedCreator »</h3>
          {data.widget.available ? (
            <>
              <p className="text-sm text-neutral-600 mb-3">Un petit badge à afficher sur votre site, votre blog ou votre page de liens. Il renvoie vers votre kit média et se met à jour tout seul (niveau, missions, note).</p>
              <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
                <img src={data.widget.imageUrl} alt="Créateur vérifié NeedCreator" width={240} height={72} />
                <div>
                  <code className="block text-xs bg-neutral-100 px-3 py-2 rounded-lg break-all">{data.widget.html}</code>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(data.widget.html, 'Code du widget')}><Copy className="w-4 h-4 mr-1" /> Copier le code</Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-neutral-500">Disponible dès que votre portfolio est validé par notre équipe.</p>
          )}
        </div>
      )}
    </Card>
  );
}
