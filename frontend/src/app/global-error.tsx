'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/** Erreur dans la mise en page racine : page minimale (pas de layout disponible) */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 40, textAlign: 'center' }}>
        <h1>Une erreur est survenue</h1>
        <p>Notre équipe en est informée. <button onClick={() => reset()} style={{ textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', color: '#0d9488' }}>Réessayer</button></p>
      </body>
    </html>
  );
}
