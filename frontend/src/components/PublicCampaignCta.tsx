'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/store/auth';

/** Bouton d'action d'une campagne publique : créateur connecté → la campagne ; sinon inscription créateur */
export default function PublicCampaignCta({ campaignId, open }: { campaignId: string; open: boolean }) {
  const user = useAuthStore((s) => s.user);
  if (!open) return <p className="text-sm text-neutral-500">Les candidatures sont closes pour cette campagne. <Link href="/campagnes" className="text-primary-600 underline">Voir les campagnes ouvertes</Link></p>;
  if (user?.role === 'creator') return <Link href={`/campaigns/${campaignId}`}><Button size="lg" className="w-full sm:w-auto">Envoyer un devis</Button></Link>;
  if (user?.role === 'brand') return <p className="text-sm text-neutral-500">Vous êtes connecté avec un compte marque. <Link href="/campaigns/new" className="text-primary-600 underline">Créer votre propre campagne</Link></p>;
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
      <Link href={`/register?role=creator&campaign=${campaignId}`}><Button size="lg" className="w-full sm:w-auto">Créer mon profil et envoyer un devis</Button></Link>
      <Link href="/login" className="text-sm text-primary-600 underline">Déjà inscrit ? Connectez-vous</Link>
    </div>
  );
}
