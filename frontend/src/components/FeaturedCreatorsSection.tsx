'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Button from '@/components/ui/Button';
import PublicCreatorsList from '@/components/PublicCreatorsList';

/**
 * Section « Nos créateurs Ambassadeurs » de la page d'accueil : masquée tant qu'aucun Ambassadeur n'a donné son accord
 */
export default function FeaturedCreatorsSection() {
  const { data } = useQuery({ queryKey: ['public-creators', { featured: '1', limit: 1 }], queryFn: async () => (await api.get('/creators/public', { params: { featured: '1', limit: 1 } })).data });
  if (!data?.pagination?.total) return null;
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Nos créateurs Ambassadeurs</h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">Des créateurs vérifiés qui parlent de NeedCreator sur leurs réseaux. Voici leur travail.</p>
        </div>
        <PublicCreatorsList featuredOnly limit={6} />
        <div className="text-center mt-8">
          <Link href="/nos-createurs"><Button variant="outline">Voir tous nos créateurs</Button></Link>
        </div>
      </div>
    </section>
  );
}
