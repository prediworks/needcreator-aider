'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Video, Briefcase } from 'lucide-react';

/**
 * Tableau de bord créateur : deux façons de décrocher une mission, à égalité.
 * Répondre à une campagne, ou proposer une vidéo déjà tournée à une marque (candidature spontanée).
 */
export default function SpontaneousCard() {
  const { data } = useQuery({ queryKey: ['showcase-brands', ''], queryFn: async () => (await api.get('/showcase/brands')).data.brands, staleTime: 5 * 60000 });
  const brands = (data || []) as any[];
  const top = [...brands.filter(b => b.requested), ...brands.filter(b => !b.requested)].slice(0, 3);
  return (
    <Card className="p-6 mb-6 border-primary-200" data-testid="spontaneous-card">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Deux façons de décrocher une mission</h2>
      <div className="grid md:grid-cols-2 gap-4 mt-3">
        <div className="rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center gap-2 font-medium text-neutral-900"><Briefcase className="w-4 h-4 text-blue-500" /> Répondre à une campagne</div>
          <p className="text-sm text-neutral-600 mt-1">Une marque publie un brief, vous envoyez votre devis, elle choisit.</p>
          <Link href="/campaigns"><Button size="sm" variant="outline" className="mt-3">Voir les campagnes</Button></Link>
        </div>
        <div className="rounded-xl border border-primary-300 bg-primary-50/40 p-4">
          <div className="flex items-center gap-2 font-medium text-neutral-900"><Video className="w-4 h-4 text-primary-600" /> Candidature spontanée en vidéo</div>
          <p className="text-sm text-neutral-600 mt-1">N&apos;attendez pas d&apos;être choisi : tournez 20 secondes sur un produit que vous possédez, fixez votre prix. La marque reçoit la vidéo finie et l&apos;achète en un clic. En général 80 à 150 € la vidéo.</p>
          {top.length > 0 && (
            <ul className="text-sm text-neutral-700 mt-2 space-y-0.5">
              {top.map((b) => <li key={b.id}>· <span className="font-medium">{b.name}</span>{b.niche ? ` · ${b.niche}` : ''}{b.requested && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] bg-green-100 text-green-800">vidéo demandée</span>}</li>)}
            </ul>
          )}
          <Link href="/vitrine"><Button size="sm" className="mt-3" data-testid="spontaneous-cta">Proposer une vidéo à une marque{brands.length ? ` (${brands.length} marques)` : ''}</Button></Link>
        </div>
      </div>
    </Card>
  );
}
