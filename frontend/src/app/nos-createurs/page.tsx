import type { Metadata } from 'next';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import PublicCreatorsList from '@/components/PublicCreatorsList';

export const metadata: Metadata = {
  title: 'Nos créateurs UGC',
  description: 'Créateurs UGC vérifiés sur NeedCreator : portfolio vidéo, niches, niveau. Sélectionnez un créateur et lancez votre campagne.',
  alternates: { canonical: '/nos-createurs' },
};

export default function PublicCreatorsPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Nos créateurs UGC</h1>
          <p className="text-neutral-600 max-w-3xl">
            Créateurs inscrits et vérifiés par notre équipe (3 vidéos de portfolio minimum, identité contrôlée), qui ont choisi de présenter leur travail ici.
            Pour voir tous les portfolios, les tarifs et envoyer une campagne, <Link href="/register?role=brand" className="text-primary-600 underline">créez un compte marque</Link>, c&apos;est gratuit.
          </p>
          <div className="mt-4 flex gap-3 flex-wrap">
            <Link href="/register?role=brand"><Button>Lancer une campagne</Button></Link>
            <Link href="/register?role=creator"><Button variant="outline">Rejoindre les créateurs</Button></Link>
          </div>
        </div>
        <PublicCreatorsList />
      </div>
    </div>
  );
}
