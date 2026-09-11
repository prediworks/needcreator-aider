import * as Sentry from '@sentry/nextjs';

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
    ignoreErrors: ['ResizeObserver loop', 'Network Error', 'Load failed', 'auth/'],
  });
}
