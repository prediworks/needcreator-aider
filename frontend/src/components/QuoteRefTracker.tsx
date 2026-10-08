'use client';

import { useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

/**
 * Page ouverte depuis les outils offerts avec un devis de créateur (?devis=<id>) : la visite du client est rattachée au devis, une fois la
 * session connue (l'équipe ne compte pas ; le créateur du devis est écarté par le serveur). Rien n'est affiché.
 */
export default function QuoteRefTracker({ action }: { action: 'rights' }) {
  const { isAdmin, loading } = useAuth();
  const sent = useRef(false);
  useEffect(() => {
    if (loading || sent.current) return;
    sent.current = true;
    try {
      const devis = (new URLSearchParams(window.location.search).get('devis') || '').trim();
      if (/^[a-f0-9]{24}$/i.test(devis) && !isAdmin) api.post('/ad-scans/ref', { ref: devis, action, source: 'quote' }).catch(() => null);
    } catch { /* adresse illisible */ }
  }, [loading, isAdmin, action]);
  return null;
}
