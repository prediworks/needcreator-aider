import logger from '../utils/logger.js';

/**
 * Vérification Cloudflare Turnstile (anti-robot) sur les formulaires publics.
 * Désactivée automatiquement si TURNSTILE_SECRET_KEY est absent.
 * Clés de test Cloudflare : secret 1x0000000000000000000000000000000AA (toujours OK),
 * 2x0000000000000000000000000000000AA (toujours refusé).
 */
export async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return next();

  const token = req.body?.turnstileToken;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Vérification anti-robot manquante. Rechargez la page et réessayez.' });
  }

  try {
    const form = new URLSearchParams({ secret, response: token });
    if (req.ip) form.set('remoteip', req.ip);
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const data = await resp.json();
    if (!data.success) {
      logger.warn('Turnstile refusé', { codes: data['error-codes'], ip: req.ip });
      return res.status(400).json({ error: 'Vérification anti-robot échouée. Rechargez la page et réessayez.' });
    }
    delete req.body.turnstileToken;
    return next();
  } catch (err) {
    // Panne Cloudflare : on ne bloque pas l'inscription, on journalise
    logger.error('Turnstile injoignable, vérification ignorée', { error: err.message });
    delete req.body.turnstileToken;
    return next();
  }
}
