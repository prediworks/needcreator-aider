'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { Instagram, Youtube, Music2, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { NICHES } from '@/lib/labels';

export const nicheLabel = (c: any) => (c.niches || []).map((n: string) => NICHES[n] || n).join(', ') || c.sourceNiche || '';

const COUNTRY_LABELS: Record<string, string> = { FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', MC: 'Monaco', DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', NL: 'Pays-Bas', PT: 'Portugal', GB: 'Royaume-Uni', IE: 'Irlande', AT: 'Autriche', SE: 'Suède', NO: 'Norvège', DK: 'Danemark', FI: 'Finlande', PL: 'Pologne', RO: 'Roumanie', GR: 'Grèce', CA: 'Canada', MA: 'Maroc', TN: 'Tunisie', DZ: 'Algérie', US: 'États-Unis' };
export const countryLabel = (c: string) => COUNTRY_LABELS[c] || c;
const fmt = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1).replace('.0', '')} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n || 0);

/**
 * Annuaire des créateurs référencés (importés, pas encore inscrits).
 * mode 'public' : site vitrine, liens réseaux + retrait. mode 'brand' : bouton d'invitation via la plateforme.
 */
export default function ExternalCreatorsList({ mode, campaigns = [] }: { mode: 'public' | 'brand'; campaigns?: any[] }) {
  const queryClient = useQueryClient();
  const [country, setCountry] = useState('FR');
  const [q, setQ] = useState('');
  const [network, setNetwork] = useState('');
  const [niche, setNiche] = useState('');
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState<any>(null);
  const [campaignId, setCampaignId] = useState('');
  const [message, setMessage] = useState('');
  const params = { country: country || undefined, q: q || undefined, network: network || undefined, niche: niche || undefined, page, limit: 24 };
  const { data, isLoading } = useQuery({
    queryKey: ['external-creators', params],
    queryFn: async () => (await api.get('/external-creators', { params })).data,
  });
  const invite = useMutation({
    mutationFn: async (id: string) => (await api.post(`/external-creators/${id}/invite`, { campaignId: campaignId || undefined, message })).data,
    onSuccess: (d) => { toast.success(d.message); setInviting(null); setMessage(''); queryClient.invalidateQueries({ queryKey: ['external-creators'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  return (
    <div>
      <Card className="p-4 mb-6 grid md:grid-cols-5 gap-3">
        <Input placeholder="Pseudo ou nom" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="md:col-span-2" />
        <select value={niche} onChange={(e) => { setNiche(e.target.value); setPage(1); }} className="px-3 py-2 border border-neutral-300 rounded-lg">
          <option value="">Toutes les niches</option>
          {(data?.niches || []).map((n: any) => <option key={n.niche} value={n.niche}>{NICHES[n.niche] || n.niche} ({n.count})</option>)}
        </select>
        <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }} className="px-3 py-2 border border-neutral-300 rounded-lg">
          <option value="">Tous les pays</option>
          {(data?.countries || []).map((c: any) => <option key={c.country} value={c.country}>{countryLabel(c.country)} ({c.count})</option>)}
        </select>
        <select value={network} onChange={(e) => { setNetwork(e.target.value); setPage(1); }} className="px-3 py-2 border border-neutral-300 rounded-lg">
          <option value="">Tout réseau</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
        </select>
      </Card>

      {isLoading ? <Spinner fullScreen={false} /> : !data?.creators?.length ? (
        <Card className="p-12 text-center"><Users className="w-12 h-12 text-neutral-300 mx-auto mb-3" /><p className="text-neutral-600">Aucun créateur référencé pour ces critères.</p></Card>
      ) : (
        <>
          <p className="text-sm text-neutral-500 mb-3">{data.pagination.total} créateur(s) référencé(s){mode === 'brand' ? ' · pas encore inscrits : invitez-les, l\'email part de NeedCreator en votre nom' : ''}</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.creators.map((c: any) => (
              <Card key={c.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/annuaire-createurs/${c.slug}`} className="font-semibold text-neutral-900 hover:text-primary-600">{c.name || c.username}</Link>
                    <div className="text-xs text-neutral-500">@{c.username} · {countryLabel(c.country)}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-700">{c.status === 'invited' ? 'Invité' : 'Référencé'}</span>
                </div>
                <div className="text-sm text-neutral-700"><strong>{fmt(c.followers)}</strong> abonnés{c.posts ? ` · ${fmt(c.posts)} publications` : ''}</div>
                {nicheLabel(c) && <div className="flex flex-wrap gap-1">{(c.niches?.length ? c.niches : [c.sourceNiche]).filter(Boolean).map((n: string) => <span key={n} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 text-xs">{NICHES[n] || n}</span>)}</div>}
                <div className="flex gap-2 text-neutral-500">
                  {c.instagram && <a href={c.instagram} target="_blank" rel="noopener noreferrer nofollow" title="Instagram" className="hover:text-pink-600"><Instagram className="w-4 h-4" /></a>}
                  {c.youtube && <a href={c.youtube} target="_blank" rel="noopener noreferrer nofollow" title="YouTube" className="hover:text-red-600"><Youtube className="w-4 h-4" /></a>}
                  {c.tiktok && <a href={c.tiktok} target="_blank" rel="noopener noreferrer nofollow" title="TikTok" className="hover:text-neutral-900"><Music2 className="w-4 h-4" /></a>}
                </div>
                {mode === 'brand' && (
                  inviting?.id === c.id ? (
                    <div className="space-y-2 border-t border-neutral-100 pt-2">
                      <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm">
                        <option value="">Sans campagne précise</option>
                        {campaigns.map((cp: any) => <option key={cp._id} value={cp._id}>{cp.title}</option>)}
                      </select>
                      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Un mot pour le créateur (optionnel)" rows={2} maxLength={600} className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => invite.mutate(c.id)} isLoading={invite.isPending}><Send className="w-4 h-4 mr-1" /> Envoyer</Button>
                        <Button size="sm" variant="ghost" onClick={() => setInviting(null)}>Annuler</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="mt-auto" onClick={() => setInviting(c)}>Inviter sur NeedCreator</Button>
                  )
                )}
              </Card>
            ))}
          </div>
          {data.pagination.pages > 1 && (
            <div className="mt-6 flex justify-center gap-2 flex-wrap">
              {Array.from({ length: Math.min(data.pagination.pages, 20) }, (_, i) => i + 1).map((p) => (
                <Button key={p} size="sm" variant={p === page ? 'primary' : 'outline'} onClick={() => setPage(p)}>{p}</Button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
