import type { Metadata } from 'next';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { NICHES, VIDEO_TYPES, PLATFORMS } from '@/lib/labels';
import { fetchPublicCampaigns } from '@/lib/publicCampaigns';
import { Clock, Video, Package } from 'lucide-react';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Campagnes UGC ouvertes',
  description: 'Les campagnes vidéo UGC ouvertes aux créateurs sur NeedCreator : marque, secteur, nombre de vidéos, budget. Envoyez votre devis, vous fixez votre prix.',
  alternates: { canonical: '/campagnes' },
};

export default async function PublicCampaignsPage() {
  const campaigns = await fetchPublicCampaigns();
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Campagnes UGC ouvertes aux créateurs</h1>
          <p className="text-neutral-600 max-w-3xl">
            Des marques cherchent des vidéos. Vous fixez votre prix dans un devis, le paiement est bloqué avant que vous tourniez, un contrat protège vos droits. Inscription gratuite, quelle que soit la taille de votre audience.
          </p>
          <div className="mt-4 flex gap-3 flex-wrap">
            <Link href="/register?role=creator"><Button>Créer mon profil créateur</Button></Link>
            <Link href="/createurs"><Button variant="outline">Comment ça marche pour les créateurs</Button></Link>
          </div>
        </div>
        {campaigns.length === 0 ? (
          <Card className="p-8 text-center text-neutral-600">Aucune campagne ouverte pour l&apos;instant. Créez votre profil : vous serez prévenu par email à chaque nouvelle campagne de vos niches.</Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {campaigns.map((c) => (
              <Link key={c.id} href={`/campagnes/${c.id}`} className="block">
                <Card className="p-5 h-full hover:border-primary-300 transition">
                  <div className="text-xs text-primary-700 font-medium mb-1">{c.brand.name}{c.brand.industry ? ` · ${c.brand.industry}` : ''}</div>
                  <h2 className="text-lg font-semibold text-neutral-900 mb-2">{c.title}</h2>
                  <p className="text-sm text-neutral-600 line-clamp-3 mb-3">{c.description}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                    <span className="flex items-center gap-1"><Video className="w-3.5 h-3.5" /> {c.deliverables} vidéo{c.deliverables > 1 ? 's' : ''} · {VIDEO_TYPES[c.videoType] || c.videoType}</span>
                    {c.type === 'gifting' ? <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> Produit offert</span> : c.budget ? <span>Budget {c.budget} €</span> : <span>Devis libre</span>}
                    {c.applicationDeadline && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> jusqu&apos;au {new Date(c.applicationDeadline).toLocaleDateString('fr-FR')}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {c.niches.map((n) => <span key={n} className="px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">{NICHES[n] || n}</span>)}
                    {c.platforms.slice(0, 3).map((p) => <span key={p} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs">{PLATFORMS[p] || p}</span>)}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
