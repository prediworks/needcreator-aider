import * as Sentry from '@sentry/nextjs';
import { installDomPatch } from './src/lib/domPatch';

// Tolère la traduction automatique du navigateur (sinon React plante sur removeChild / insertBefore)
installDomPatch();

// Erreurs côté navigateur. Actif seulement si NEXT_PUBLIC_SENTRY_DSN est renseigné.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: [
      'ResizeObserver loop', 'Network Error', 'Load failed', 'auth/',
      'Database deleted by request of the user', // Safari : l'utilisateur a effacé les données des sites
      'EmptyRanges', // script injecté par une extension ou le navigateur intégré d'une appli, absent de notre code
    ],
  });
}
