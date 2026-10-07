'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Search, ClipboardCheck } from 'lucide-react';

/** Tableau de bord marque : scanner un concurrent, auditer ses publicités, et ses derniers scans */
export default function BrandAdScanCard() {
  const { data } = useQuery({ queryKey: ['ad-scans-mine'], queryFn: async () => (await api.get('/ad-scans/mine')).data.scans, staleTime: 60000 });
  const mine = data || [];
  return (
    <Card className="p-4 mb-6" data-testid="brand-ad-scan-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-sm text-neutral-700 max-w-xl"><strong>Les publicités de vos concurrents :</strong> celles qui tournent depuis des mois, les angles qu&apos;ils utilisent et ceux qu&apos;ils laissent libres. Ou l&apos;audit de vos propres publicités, avec trois vidéos créateur à commander.</div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/publicites-concurrents"><Button size="sm" variant="outline"><Search className="w-4 h-4 mr-1" /> Scanner un concurrent</Button></Link>
          <Link href="/audit-publicites"><Button size="sm" variant="outline"><ClipboardCheck className="w-4 h-4 mr-1" /> Auditer mes publicités</Button></Link>
        </div>
      </div>
      {mine.length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap text-xs">
          <span className="text-neutral-500 self-center">Vos derniers scans :</span>
          {mine.map((s: any) => (
            <Link key={s.slug} href={`/publicites/${s.slug}`} className="px-2 py-1 rounded-full border border-neutral-200 hover:border-primary-400 bg-white text-neutral-700">{s.pageName}{s.status === 'pending' ? ' (en cours)' : s.oldestDays != null ? ` · ${s.totalActive} pubs, ${s.oldestDays} j` : ''}</Link>
          ))}
        </div>
      )}
    </Card>
  );
}
