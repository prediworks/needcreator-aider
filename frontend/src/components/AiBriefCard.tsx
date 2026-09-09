'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Sparkles, Wand2 } from 'lucide-react';

interface AiBriefCardProps {
  videoType: string;
  platforms: string[];
  niches: string[];
  onGenerated: (brief: any) => void;
}

/**
 * Brief assisté par IA : deux phrases sur le produit → titre, description, consignes pré-remplis
 */
export default function AiBriefCard({ videoType, platforms, niches, onGenerated }: AiBriefCardProps) {
  const [product, setProduct] = useState('');
  const [goal, setGoal] = useState('');
  const [tone, setTone] = useState('authentique et chaleureux');
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['ai-status'], queryFn: async () => (await api.get('/campaigns/ai-brief/status')).data });

  const generate = useMutation({
    mutationFn: async () => (await api.post('/campaigns/ai-brief', { productDescription: product, videoType, platforms, niches, goal, tone })).data,
    onSuccess: (d) => { onGenerated(d.brief); toast.success('Brief généré ! Relisez et ajustez avant de continuer.'); },
    onError: (e: any) => toast.error(getErrorMessage(e, 'Génération impossible'), { duration: 10000 }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['ai-status'] }),
  });

  return (
    <div className="rounded-xl border-2 border-dashed border-primary-300 bg-gradient-to-br from-primary-50 to-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5 text-primary-600" />
        <h3 className="font-semibold text-neutral-900">Générer le brief avec l&apos;IA</h3>
        {status && !status.configured && <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">non configuré</span>}
        {status?.quota && (status.quota.pro
          ? <span className="text-xs text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded-full">Pro · illimité</span>
          : <span className={`text-xs px-2 py-0.5 rounded-full ${status.quota.remaining > 0 ? 'bg-primary-50 text-primary-800' : 'bg-red-50 text-red-700'}`}>{status.quota.remaining} / {status.quota.limit} rédaction(s) par l'IA gratuite(s) ce mois-ci</span>)}
      </div>
      <p className="text-sm text-neutral-600 mb-3">Décrivez votre produit en deux phrases : l&apos;IA rédige le titre, la description et les consignes. Vous gardez la main pour tout modifier.</p>
      <textarea
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Ex : Sérum visage à la vitamine C, bio, fabriqué en France, 29 €. Cible : femmes 25-40 ans qui veulent un teint plus lumineux sans routine compliquée."
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
      />
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <Input label="Objectif (optionnel)" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Publicité Meta, lancement produit, page produit…" />
        <Input label="Ton (optionnel)" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="authentique, fun, premium…" />
      </div>
      <Button onClick={() => generate.mutate()} isLoading={generate.isPending} disabled={product.trim().length < 10 || (status && !status.configured) || (status?.quota && !status.quota.pro && status.quota.remaining <= 0)}>
        <Wand2 className="w-4 h-4 mr-2" /> {generate.isPending ? 'Rédaction en cours (10-20 s)…' : 'Générer le brief'}
      </Button>
      {status?.quota && !status.quota.pro && status.quota.remaining <= 0 && (
        <p className="text-xs text-neutral-600 mt-2">Quota mensuel atteint. <a href="/profile" className="text-primary-600 underline">Passez en Pro</a> pour un accès illimité.</p>
      )}
      {status && !status.configured && (
        <p className="text-xs text-neutral-500 mt-2">Pour activer : renseignez une clé API IA dans <code>backend/.env</code> (voir <code>backend/config/prompts/README.md</code>).</p>
      )}
    </div>
  );
}
