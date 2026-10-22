import admin from 'firebase-admin';
import User from '../models/User.js';
import AdScanSubscription from '../models/AdScanSubscription.js';
import { stripe } from './stripe.js';
import { sendVerificationLink } from './email.js';
import { actionLink } from '../controllers/authEmails.js';
import logger from '../utils/logger.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change l'adresse email d'un compte (erreur à l'inscription) : connexion Firebase et fiche NeedCreator ensemble,
 * compte, portfolio et mot de passe intacts. La nouvelle adresse est à confirmer : un lien lui est envoyé.
 * Suit aussi l'abonnement au rapport de publicités et le client Stripe de la marque. Erreurs avec .status (400, 404, 409).
 */
export async function changeUserEmail(userId, rawEmail, by = 'admin') {
  const email = String(rawEmail || '').trim().toLowerCase();
  const fail = (status, message) => Object.assign(new Error(message), { status });
  if (!EMAIL_RE.test(email)) throw fail(400, 'Adresse email invalide');
  const user = await User.findById(userId);
  if (!user) throw fail(404, 'Compte introuvable');
  const old = user.email;
  if (old === email) throw fail(400, 'C\'est déjà l\'adresse de ce compte');
  if (await User.exists({ email, _id: { $ne: user._id } })) throw fail(409, `L'adresse ${email} est déjà utilisée par un autre compte NeedCreator`);
  const taken = await admin.auth().getUserByEmail(email).catch(() => null);
  if (taken && taken.uid !== user.firebaseUid) throw fail(409, `L'adresse ${email} est déjà utilisée par une autre connexion (Firebase)`);

  await admin.auth().updateUser(user.firebaseUid, { email, emailVerified: false });
  try {
    user.email = email;
    user.set('verification.email', false);
    await user.save();
  } catch (err) {
    await admin.auth().updateUser(user.firebaseUid, { email: old }).catch(() => {});
    throw err;
  }
  await AdScanSubscription.updateMany({ userId: user._id, email: old }, { $set: { email } }).catch(() => {});
  if (user.stripeCustomerId && stripe) await stripe.customers.update(user.stripeCustomerId, { email }).catch((e) => logger.warn(`Stripe customer email not updated for ${user._id}: ${e.message}`));

  let linkSent = false;
  try {
    const link = await actionLink('verify', email, '/dashboard');
    await sendVerificationLink(email, user.profile?.companyName || user.profile?.name, link);
    linkSent = true;
  } catch (err) {
    logger.warn(`Verification link after email change failed for ${user._id}: ${err.message}`);
  }
  logger.info(`Email changed by ${by} for user ${user._id}: ${old} → ${email}`);
  return { old, email, linkSent };
}
