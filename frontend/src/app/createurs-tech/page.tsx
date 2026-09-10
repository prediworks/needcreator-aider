import type { Metadata } from 'next';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import ExternalCreatorsList from '@/components/ExternalCreatorsList';

export const metadata: Metadata = {
  title: 'Annuaire des créateurs tech',
  description: 'Créateurs de contenu et influenceurs tech en France et en Europe : audience, réseaux, et mise en relation via NeedCreator pour vos vidéos UGC.',
  alternates: { canonical: '/createurs-tech' },
};

/**
 * Annuaire public des créateurs référencés (pas encore inscrits). Données publiques des réseaux sociaux uniquement.
 */
export default function ExternalCreatorsPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">Annuaire des créateurs tech</h1>
          <p className="text-neutral-600 max-w-3xl">
            Créateurs et influenceurs tech référencés à partir de leurs profils publics, en France et en Europe. Ils ne sont pas encore inscrits sur NeedCreator :
            les marques peuvent les inviter depuis l&apos;application, l&apos;invitation part de la plateforme. Pour des créateurs vérifiés avec portfolio, devis et paiement sécurisé,{' '}
            <Link href="/register?role=brand" className="text-primary-600 underline">créez un compte marque</Link>.
          </p>
          <div className="mt-4 flex gap-3 flex-wrap">
            <Link href="/register?role=brand"><Button>Je suis une marque : inviter des créateurs</Button></Link>
            <Link href="/register?role=creator"><Button variant="outline">Je suis créateur : rejoindre NeedCreator</Button></Link>
          </div>
        </div>
        <ExternalCreatorsList mode="public" />
        <p className="text-xs text-neutral-500 mt-8">
          Vous figurez dans cet annuaire et souhaitez en être retiré ? Ouvrez votre fiche et utilisez le lien « Retirer mon profil ». Voir aussi notre{' '}
          <Link href="/legal/confidentialite" className="underline">politique de confidentialité</Link>.
        </p>
      </div>
    </div>
  );
}
