import type { Metadata } from 'next';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import CreatorsDirectoryTabs from '@/components/CreatorsDirectoryTabs';
import { fetchPublicConfig } from '@/lib/publicConfig';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Créateurs UGC',
  description: 'Créateurs de contenu UGC en France et en Europe : créateurs inscrits et vérifiés sur NeedCreator, et créateurs référencés par niche. Sélectionnez un créateur et lancez votre campagne.',
  alternates: { canonical: '/nos-createurs' },
};

export default async function PublicCreatorsPage() {
  const cfg = await fetchPublicConfig();
  const showRegistered = cfg.publicCreatorsMinCount === 0 || cfg.publicCreatorsCount >= cfg.publicCreatorsMinCount;
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Créateurs UGC</h1>
          <p className="text-neutral-600 max-w-3xl">
            {showRegistered
              ? 'Les créateurs vérifiés sur NeedCreator, et les créateurs référencés par niche que les marques invitent en un clic.'
              : 'Créateurs et influenceurs référencés par niche, que les marques peuvent inviter sur leurs campagnes depuis NeedCreator.'}
            {' '}Pour des créateurs vérifiés avec portfolio, devis et paiement sécurisé, <Link href="/register?role=brand" className="text-primary-600 underline">créez un compte marque</Link>, c&apos;est gratuit.
          </p>
          <div className="mt-4 flex gap-3 flex-wrap">
            <Link href="/register?role=brand"><Button>Lancer une campagne</Button></Link>
            <Link href="/register?role=creator"><Button variant="outline">Rejoindre les créateurs</Button></Link>
          </div>
        </div>
        <CreatorsDirectoryTabs showRegistered={showRegistered} registeredCount={cfg.publicCreatorsCount} />
      </div>
    </div>
  );
}
