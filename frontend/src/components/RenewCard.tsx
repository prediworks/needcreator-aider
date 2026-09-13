'use client';

import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useRenewCampaign } from '@/hooks/useCampaigns';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { Repeat } from 'lucide-react';

/** Après une mission validée : la marque reconduit avec le même créateur (campagne privée pré-remplie, remise fidélité) */
export default function RenewCard({ delivery }: { delivery: any }) {
  const router = useRouter();
  const cfg = usePublicConfig();
  const renew = useRenewCampaign();
  const campaignId = delivery.campaignId?._id || delivery.campaignId;
  const creatorId = delivery.creatorId?._id || delivery.creatorId;
  const name = delivery.creatorId?.profile?.name || 'ce créateur';
  return (
    <Card className="p-6 border-primary-200 bg-primary-50/40">
      <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Repeat className="w-4 h-4 text-primary-600" /> Reconduire avec {name}</h3>
      <p className="text-sm text-neutral-700 mb-3">
        Une nouvelle campagne privée, même brief, réservée à {name}, avec son dernier devis pré-rempli. Vous vérifiez, vous publiez, il ou elle répond en un clic.
        {cfg.repeatDiscountPercent > 0 && <> Remise fidélité de <strong>{cfg.repeatDiscountPercent} %</strong> sur le prix, offerte par NeedCreator : le créateur touche la même chose.</>}
      </p>
      <Button size="sm" isLoading={renew.isPending} onClick={async () => { const r = await renew.mutateAsync({ campaignId, creatorId }); if (r?.campaign?._id) router.push(`/campaigns/${r.campaign._id}`); }}>
        <Repeat className="w-4 h-4 mr-1" /> Reconduire avec {name}
      </Button>
    </Card>
  );
}
