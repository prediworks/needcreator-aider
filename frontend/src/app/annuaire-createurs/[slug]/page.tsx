'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { countryLabel, nicheLabel } from '@/components/ExternalCreatorsList';
import { Instagram, Youtube, Music2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ExternalCreatorPage() {
  const { slug } = useParams() as { slug: string };
  const { data, isLoading, error } = useQuery({ queryKey: ['external-creator', slug], queryFn: async () => (await api.get(`/external-creators/${slug}`)).data.creator });
  const [email, setEmail] = useState('');
  const [showOptout, setShowOptout] = useState(false);
  const optout = useMutation({
    mutationFn: async () => (await api.post(`/external-creators/${slug}/optout`, { email })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); setShowOptout(false); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-neutral-600">Ce profil n&apos;est pas (ou plus) référencé. <Link href="/annuaire-createurs" className="ml-2 underline">Retour à l&apos;annuaire</Link></div>;
  const c = data;
  const n = (v: number) => (v || 0).toLocaleString('fr-FR');

  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        <Link href="/annuaire-createurs" className="text-sm text-neutral-600 hover:text-neutral-900">← Annuaire des créateurs</Link>
        <Card className="p-8 mt-4">
          <h1 className="text-3xl font-bold text-neutral-900">{c.name || c.username}</h1>
          <p className="text-neutral-500 mb-4">@{c.username} · {countryLabel(c.country)}{nicheLabel(c) ? ` · ${nicheLabel(c)}` : ''} · créateur référencé</p>
          <div className="grid grid-cols-3 gap-3 text-center mb-6">
            {[['Abonnés', n(c.followers)], ['Publications', n(c.posts)], ['Likes', n(c.likes)]].map(([l, v]) => (
              <div key={l} className="bg-neutral-50 rounded-lg p-3"><div className="text-xl font-bold text-neutral-900">{v}</div><div className="text-xs text-neutral-500">{l}</div></div>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap mb-6">
            {c.instagram && <a href={c.instagram} target="_blank" rel="noopener noreferrer nofollow"><Button variant="outline" size="sm"><Instagram className="w-4 h-4 mr-1" /> Instagram</Button></a>}
            {c.youtube && <a href={c.youtube} target="_blank" rel="noopener noreferrer nofollow"><Button variant="outline" size="sm"><Youtube className="w-4 h-4 mr-1" /> YouTube</Button></a>}
            {c.tiktok && <a href={c.tiktok} target="_blank" rel="noopener noreferrer nofollow"><Button variant="outline" size="sm"><Music2 className="w-4 h-4 mr-1" /> TikTok</Button></a>}
          </div>
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-sm text-neutral-800 mb-6">
            <strong>Vous êtes une marque ?</strong> Ce créateur n&apos;est pas encore inscrit. Depuis votre compte NeedCreator, invitez-le en un clic : l&apos;invitation part de la plateforme avec votre campagne.{' '}
            <Link href="/register?role=brand" className="underline">Créer un compte marque</Link>
          </div>
          <div className="border-t border-neutral-100 pt-4 text-sm text-neutral-600">
            <strong>Vous êtes {c.name || c.username} ?</strong>{' '}
            <Link href="/register?role=creator" className="text-primary-600 underline">Rejoignez NeedCreator</Link> pour recevoir des propositions payées, ou{' '}
            <button type="button" className="underline" onClick={() => setShowOptout(!showOptout)}>retirez votre profil</button> de l&apos;annuaire.
            {showOptout && (
              <div className="mt-3 space-y-2">
                <Input label="Adresse email associée à votre profil (pour vérification)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button size="sm" onClick={() => optout.mutate()} isLoading={optout.isPending} disabled={!email}>Retirer mon profil</Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
