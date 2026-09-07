'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Store } from 'lucide-react';

/**
 * Sélecteur de produit Shopify (n'apparaît que si une boutique est connectée)
 */
export default function ShopifyProductPicker({ onPick, buttonLabel = 'Utiliser ce produit' }: { onPick: (product: any) => void; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: status } = useQuery({ queryKey: ['shopify-status'], queryFn: async () => (await api.get('/integrations/shopify/status')).data });
  const { data, isLoading, error } = useQuery({
    queryKey: ['shopify-products', q],
    queryFn: async () => (await api.get('/integrations/shopify/products', { params: { q: q || undefined } })).data,
    enabled: open && !!status?.connected,
  });

  if (!status?.connected) return null;

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-green-900 flex items-center gap-2"><Store className="w-4 h-4" /> Boutique {status.shop} connectée</div>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? 'Fermer' : 'Choisir un produit Shopify'}</Button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit par titre…" />
          {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : error ? <p className="text-sm text-red-700">Impossible de charger les produits</p> : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {(data?.products || []).map((p: any) => (
                <div key={p.id} className="bg-white rounded-lg p-2 flex items-center gap-3">
                  {p.image ? <img src={p.image} alt="" className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 bg-neutral-100 rounded" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="text-xs text-neutral-500 truncate">{p.price ? `${p.price} €` : ''} {p.description?.slice(0, 80)}</div>
                  </div>
                  <Button size="sm" onClick={() => { onPick(p); setOpen(false); }}>{buttonLabel}</Button>
                </div>
              ))}
              {data?.products?.length === 0 && <p className="text-sm text-neutral-500">Aucun produit trouvé.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
