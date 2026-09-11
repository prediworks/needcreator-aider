'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import Button from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';

/**
 * Page d'erreur d'une route : message clair pour l'utilisateur, remontée à Sentry
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Une erreur est survenue</h1>
        <p className="text-neutral-600 mb-6">Notre équipe en est informée. Vous pouvez réessayer ou revenir au tableau de bord.{error.digest ? ` (réf. ${error.digest})` : ''}</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => reset()}>Réessayer</Button>
          <Link href="/dashboard"><Button variant="outline">Tableau de bord</Button></Link>
        </div>
      </div>
    </div>
  );
}
