'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import BrandVideosList from '@/components/BrandVideosList';

/** Tableau de bord marque : les vidéos que des créateurs ont tournées pour elle (proposées par l'équipe), rien si aucune */
export default function BrandVideosCard() {
  const { data } = useQuery({ queryKey: ['brand-videos-mine'], queryFn: async () => (await api.get('/brand-videos/mine')).data, staleTime: 60000 });
  const videos = data?.videos || [];
  if (!videos.length) return null;
  const available = videos.filter((v: any) => v.status === 'available').length;
  return (
    <div className="mb-8" data-testid="brand-videos-card">
      <h2 className="text-xl font-semibold text-neutral-900 mb-1">Vidéos tournées pour vous</h2>
      <p className="text-sm text-neutral-600 mb-3">Des créateurs ont tourné ces vidéos avec vos produits.{available ? ` ${available} disponible${available > 1 ? 's' : ''} : regardez-la en filigrane, elle est à vous au prix indiqué si elle vous plaît.` : ''}</p>
      <BrandVideosList videos={videos} />
    </div>
  );
}
