'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Store, CheckCircle, Unplug } from 'lucide-react';

/**
 * Connexion de la boutique Shopify (marque)
 */
export default function ShopifyCard() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [shop, setShop] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['shopify-status'], queryFn: async () => (await api.get('/integrations/shopify/status')).data });

  useEffect(() => {
    const flag = searchParams.get('shopify');
    if (flag === 'connected') { toast.success('Boutique Shopify connectée !'); queryClient.invalidateQueries({ queryKey: ['shopify-status'] }); }
    if (flag === 'error') toast.error(`Connexion Shopify échouée (${searchParams.get('reason') || 'erreur'})`);
  }, [searchParams, queryClient]);

  const install = useMutation({
    mutationFn: async () => (await api.post('/integrations/shopify/install', { shop })).data,
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  const disconnect = useMutation({
    mutationFn: async () => (await api.delete('/integrations/shopify')).data,
    onSuccess: () => { toast.success('Boutique déconnectée'); queryClient.invalidateQueries({ queryKey: ['shopify-status'] }); },
  });

  if (isLoading || !data) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <Store className="w-5 h-5 text-green-600" />
        <h2 className="text-xl font-semibold text-neutral-900">Boutique Shopify</h2>
      </div>
      {data.connected ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {data.shop} connectée. Importez vos produits dans vos briefs et publiez les vidéos validées sur vos fiches produit.</p>
          <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()} isLoading={disconnect.isPending}><Unplug className="w-4 h-4 mr-1" /> Déconnecter</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Connectez votre boutique pour pré-remplir vos briefs avec vos fiches produit et ajouter les vidéos UGC validées à vos pages produit.</p>
          {!data.configured && <p className="text-xs text-orange-700 bg-orange-50 rounded p-2">L&apos;intégration n&apos;est pas encore activée sur la plateforme (clés d&apos;application Shopify à renseigner par l&apos;administrateur).</p>}
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[240px]"><Input label="Adresse de la boutique" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="ma-boutique.myshopify.com" /></div>
            <Button onClick={() => install.mutate()} isLoading={install.isPending} disabled={!shop.trim() || !data.configured}>Connecter</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
