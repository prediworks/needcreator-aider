'use client';

import { useState } from 'react';
import Link from 'next/link';
import PublicCreatorsList from '@/components/PublicCreatorsList';
import ExternalCreatorsList from '@/components/ExternalCreatorsList';

/**
 * Page publique « Créateurs » : annuaire des créateurs référencés (toujours) et, à partir d'un seuil réglé dans l'admin,
 * l'onglet des créateurs inscrits (profil validé, portfolio, accord donné).
 */
export default function CreatorsDirectoryTabs({ showRegistered, registeredCount }: { showRegistered: boolean; registeredCount: number }) {
  const [tab, setTab] = useState<'registered' | 'referenced'>(showRegistered ? 'registered' : 'referenced');
  return (
    <div>
      {showRegistered && (
        <div className="flex gap-2 mb-6 border-b border-neutral-200">
          {([['registered', `Créateurs NeedCreator (${registeredCount})`], ['referenced', 'À inviter']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-primary-500 text-primary-700' : 'border-transparent text-neutral-600 hover:text-neutral-900'}`}>{label}</button>
          ))}
        </div>
      )}
      {tab === 'registered' && showRegistered ? (
        <div>
          <p className="text-sm text-neutral-600 mb-4">Créateurs inscrits et vérifiés par notre équipe, portfolio vidéo et identité contrôlés, qui ont choisi de présenter leur travail ici. Pour voir tous les portfolios, les tarifs et envoyer une campagne, <Link href="/register?role=brand" className="text-primary-600 underline">créez un compte marque</Link>, c&apos;est gratuit.</p>
          <PublicCreatorsList />
        </div>
      ) : (
        <div>
          <p className="text-sm text-neutral-600 mb-4">Créateurs et influenceurs référencés par niche à partir de leurs profils publics, en France et en Europe. Les marques les invitent en un clic depuis NeedCreator.</p>
          <ExternalCreatorsList mode="public" />
          <p className="text-xs text-neutral-500 mt-8">Vous figurez dans cet annuaire et souhaitez en être retiré ? Ouvrez votre fiche et utilisez le lien « Retirer mon profil ». Voir aussi notre <Link href="/legal/confidentialite" className="underline">politique de confidentialité</Link>.</p>
        </div>
      )}
    </div>
  );
}
