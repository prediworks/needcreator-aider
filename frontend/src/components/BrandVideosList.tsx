'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * Vidéos tournées pour une marque : aperçu en filigrane, créateur, prix, et le devis où elle s'achète. Partagé par la page à lien personnel
 * (/videos/<lien>, sans compte) et l'espace de la marque inscrite.
 */
export default function BrandVideosList({ videos }: { videos: any[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4" data-testid="brand-videos">
      {videos.map((v) => (
        <Card key={v.id} className="p-4 flex flex-col" data-testid="brand-video">
          {v.previewUrl ? <video src={v.previewUrl} controls playsInline preload="metadata" className="w-full max-h-[60vh] rounded-lg bg-black mb-3" /> : v.status === 'bought' ? <div className="rounded-lg bg-green-50 text-green-800 text-sm p-4 mb-3">Achetée : la version sans filigrane est dans votre mission.</div> : null}
          <div className="font-semibold text-neutral-900">{v.productName}</div>
          <div className="text-sm text-neutral-600 mb-1">par {v.creator.slug ? <Link href={`/c/${v.creator.slug}`} className="text-primary-700 underline">{v.creator.name}</Link> : v.creator.name} · proposée le {formatDate(v.proposedAt)}</div>
          {v.note && <p className="text-sm text-neutral-700 mb-2">{v.note}</p>}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="text-lg font-bold text-neutral-900">{formatCurrency(v.price)} <span className="text-xs font-normal text-neutral-500">HT, droits inclus</span></span>
            {v.status === 'available' && v.quoteLink ? <Link href={v.quoteLink}><Button size="sm">Voir le devis et l&apos;acheter</Button></Link>
              : v.status === 'bought' ? <span className="text-xs text-green-700 font-medium">Achetée</span>
              : <span className="text-xs text-neutral-500">Devis clos</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}
