import * as Sentry from '@sentry/node';

/**
 * Remontée des erreurs vers Sentry (sentry.io, offre gratuite) ou GlitchTip (auto-hébergé, même protocole).
 * Actif uniquement si SENTRY_DSN est renseigné. À importer en tout premier dans index.js.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_RELEASE || undefined,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || '0.05'),
    sendDefaultPii: false,
    beforeSend(event) {
      // Jamais de jeton ni de mot de passe dans les rapports
      if (event.request?.headers) { delete event.request.headers.authorization; delete event.request.headers.cookie; }
      return event;
    },
  });
}

export const sentryEnabled = !!dsn;
export { Sentry };
