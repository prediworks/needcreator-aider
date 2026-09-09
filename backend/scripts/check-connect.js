/**
 * Vérifie que Stripe Connect est activé pour la clé du .env (test ou live) :
 * crée un compte Express puis le supprime aussitôt.
 * Usage : cd backend && npm run check:connect
 */
import 'dotenv/config';
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.log('❌ STRIPE_SECRET_KEY absent du .env'); process.exit(1); }
const mode = key.startsWith('sk_live_') ? 'LIVE' : 'TEST';
const stripe = new Stripe(key);
try {
  const account = await stripe.accounts.create({ type: 'express', country: 'FR' });
  await stripe.accounts.del(account.id);
  console.log(`✅ Stripe Connect actif en mode ${mode} (compte ${account.id} créé puis supprimé)`);
} catch (e) {
  console.log(`❌ Stripe Connect indisponible en mode ${mode} : ${e.message}`);
  process.exit(1);
}
