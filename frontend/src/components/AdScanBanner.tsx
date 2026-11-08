'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Search, ClipboardCheck } from 'lucide-react';

/**
 * Bandeau du scan concurrentiel (accueil, page Marques) : le visiteur tape le nom d'un concurrent et lance le scan sans quitter la page ;
 * la page de l'outil reprend le nom (« ?q= ») et lance la lecture.
 */
export default function AdScanBanner() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <section className="py-14 bg-neutral-900 text-white" data-testid="ad-scan-banner">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center px-3 py-1 bg-white/10 rounded-full mb-3 text-xs font-medium">Outil gratuit · sans compte</div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Vos concurrents font de la pub. Lesquelles marchent ?</h2>
            <p className="text-neutral-300">Une publicité maintenue depuis trois mois est une publicité qui rapporte. Tapez le nom d&apos;un concurrent : ses publicités Meta actives, de la plus ancienne à la plus récente, les angles qu&apos;il utilise et ceux qu&apos;il laisse libres.</p>
          </div>
          <div>
            <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) router.push(`/publicites-concurrents?q=${encodeURIComponent(q.trim())}`); }} className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="ad-scan-banner-q" className="sr-only">Nom d&apos;un concurrent</label>
              <input id="ad-scan-banner-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom d'un concurrent (ex. : Respire)" className="flex-1 rounded-lg px-4 py-3 text-neutral-900 bg-white border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-400" required minLength={2} data-testid="ad-scan-banner-q" />
              <Button type="submit" size="lg"><Search className="w-4 h-4 mr-2" /> Voir ses publicités</Button>
            </form>
            <p className="text-sm text-neutral-400 mt-3">Ou <Link href="/audit-publicites" className="underline text-white inline-flex items-center gap-1"><ClipboardCheck className="w-4 h-4" /> l&apos;audit créatif de vos propres publicités</Link> : ce qui dure, ce qui se répète, trois vidéos créateur à commander.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
