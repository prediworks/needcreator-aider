'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BrandVideosList from '@/components/BrandVideosList';

/** « Vidéos tournées pour [marque] » : toutes les vidéos que des créateurs lui ont proposées, sans compte, par un lien personnel */
export default function BrandVideosPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({ queryKey: ['brand-videos', token], queryFn: async () => (await api.get(`/brand-videos/public/${token}`)).data, retry: false });
  if (isLoading) return <Spinner />;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center px-4"><Card className="p-8 text-center"><p className="text-neutral-700">Ce lien est inconnu ou n&apos;est plus valable.</p></Card></div>;
  const available = data.videos.filter((v: any) => v.status === 'available').length;
  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <div className="container mx-auto px-4 max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2">Vidéos tournées pour {data.brandName}</h1>
          <p className="text-neutral-700">Des créateurs vérifiés de NeedCreator ont tourné ces vidéos avec vos produits, sans que vous ayez rien demandé. Regardez-les en filigrane : si l&apos;une vous plaît, elle est à vous au prix indiqué, droits inclus ; sinon, rien.{available ? ` ${available} disponible${available > 1 ? 's' : ''} à l'achat.` : ''}</p>
        </div>
        {data.videos.length ? <BrandVideosList videos={data.videos} /> : <Card className="p-6 text-sm text-neutral-700">Aucune vidéo disponible pour l&apos;instant.</Card>}
        <Card className="p-5 text-sm text-neutral-700">
          Le paiement est bloqué à l&apos;achat et versé au créateur seulement après votre validation ; vous pouvez demander une modification avant de valider. Envie d&apos;une vidéo sur un autre produit ? <Link href="/register?role=brand" className="text-primary-700 underline">Créez votre compte marque</Link> et publiez une demande.
        </Card>
      </div>
    </div>
  );
}
