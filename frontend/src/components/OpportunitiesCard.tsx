'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Video, Briefcase, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

/**
 * Tableau de bord créateur, en tête : les deux façons de décrocher une mission, à égalité.
 * Missions recommandées (campagnes de ses niches) et candidature spontanée en vidéo (marques à filmer, celles qui demandent une vidéo d'abord).
 * Sans campagne ouverte, la candidature spontanée prend toute la largeur : jamais de bloc vide à la meilleure place.
 */
export default function OpportunitiesCard() {
  const { data: reco } = useQuery({ queryKey: ['campaigns', 'recommended'], queryFn: async () => (await api.get('/campaigns', { params: { filter: 'recommended', limit: 3 } })).data, staleTime: 120000 });
  const { data } = useQuery({ queryKey: ['showcase-brands', ''], queryFn: async () => (await api.get('/showcase/brands')).data.brands, staleTime: 5 * 60000 });
  const campaigns = (reco?.campaigns || []) as any[];
  const brands = (data || []) as any[];
  const top = [...brands.filter(b => b.suggestedByMe), ...brands.filter(b => b.requested && !b.suggestedByMe), ...brands.filter(b => !b.requested && !b.suggestedByMe)].slice(0, 3);
  const alone = campaigns.length === 0;
  return (
    <Card className="p-5 mb-6 border-primary-200" data-testid="opportunities-card">
      <h2 className="text-lg font-semibold text-neutral-900">Vos opportunités</h2>
      <div className={`grid gap-4 mt-3 ${alone ? '' : 'md:grid-cols-2'}`}>
        {!alone && (
          <div className="rounded-xl border border-neutral-200 p-4" data-testid="opportunities-missions">
            <h3 className="flex items-center gap-2 font-medium text-neutral-900"><Briefcase className="w-4 h-4 text-blue-500" /> Missions recommandées pour vous</h3>
            <p className="text-sm text-neutral-600 mt-1">Une marque publie un brief, vous envoyez votre devis, elle choisit.</p>
            <ul className="mt-2 space-y-2">
              {campaigns.slice(0, 3).map((c: any) => (
                <li key={c._id}>
                  <Link href={`/campaigns/${c._id}`} className="flex items-center justify-between gap-2 text-sm border border-neutral-200 rounded-lg px-3 py-2 hover:border-primary-300">
                    <span className="truncate">{c.title}</span>
                    <span className="text-neutral-500 whitespace-nowrap">{c.budget?.total ? formatCurrency(c.budget.total) : 'budget libre'} <ArrowRight className="w-3.5 h-3.5 inline" /></span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/campaigns" className="inline-block mt-3"><Button size="sm" variant="outline">Toutes les campagnes</Button></Link>
          </div>
        )}
        <div className="rounded-xl border border-primary-300 bg-primary-50/40 p-4" data-testid="opportunities-spontaneous">
          <h3 className="flex items-center gap-2 font-medium text-neutral-900"><Video className="w-4 h-4 text-primary-600" /> Candidature spontanée en vidéo</h3>
          <p className="text-sm text-neutral-600 mt-1">N&apos;attendez pas d&apos;être choisi : tournez 20 secondes sur un produit que vous possédez, fixez votre prix. La marque reçoit la vidéo finie et l&apos;achète en un clic. En général 80 à 150 € la vidéo.</p>
          {top.length > 0 ? (
            <ul className={`mt-2 gap-2 grid ${alone ? 'sm:grid-cols-3' : ''}`}>
              {top.map((b) => (
                <li key={b.id}>
                  <Link href={`/vitrine?marque=${b.id}`} className="flex items-center justify-between gap-2 text-sm bg-white border border-neutral-200 rounded-lg px-3 py-2 hover:border-primary-300">
                    <span className="truncate"><span className="font-medium">{b.name}</span>{b.niche ? <span className="text-neutral-500"> · {b.niche}</span> : null}</span>
                    <span className="whitespace-nowrap">
                      {b.suggestedByMe ? <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-primary-100 text-primary-800">réservée pour vous</span> : b.requested ? <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-green-100 text-green-800">vidéo demandée</span> : <ArrowRight className="w-3.5 h-3.5 inline text-neutral-500" />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-700 mt-2">Aucune marque dans la liste pour l&apos;instant : suggérez celle dont vous possédez un produit.</p>}
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <Link href="/vitrine"><Button size="sm" data-testid="spontaneous-cta">Proposer une vidéo à une marque{brands.length ? ` (${brands.length} marques)` : ''}</Button></Link>
            <Link href="/vitrine?suggerer=1" className="text-sm text-primary-700 underline" data-testid="opportunities-suggest">Ma marque n&apos;est pas dans la liste : la suggérer</Link>
          </div>
          {alone && <p className="text-xs text-neutral-500 mt-3">Aucune campagne ouverte dans vos niches pour l&apos;instant : elles s&apos;afficheront ici, à côté. <Link href="/campaigns" className="underline">Toutes les campagnes</Link></p>}
        </div>
      </div>
    </Card>
  );
}
