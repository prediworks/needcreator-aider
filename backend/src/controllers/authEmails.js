import admin from 'firebase-admin';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { sendVerificationLink, sendPasswordResetLink } from '../services/email.js';
import logger from '../utils/logger.js';

/**
 * Emails d'authentification envoyés par NOTRE SMTP (pas par Firebase) :
 * Firebase fournit seulement le lien signé, l'email part avec l'expéditeur NeedCreator.
 */

async function actionLink(kind, email, path) {
  const settings = { url: `${config.cors.origin}${path}` };
  const gen = kind === 'verify'
    ? (s) => admin.auth().generateEmailVerificationLink(email, s)
    : (s) => admin.auth().generatePasswordResetLink(email, s);
  try {
    return await gen(settings);
  } catch (err) {
    // Domaine de retour non autorisé dans Firebase (IP, localhost) : lien sans retour
    if (['auth/invalid-continue-uri', 'auth/unauthorized-continue-uri'].includes(err?.code)) return gen(undefined);
    throw err;
  }
}

/** Limite : 1 envoi par minute et par compte (verification) */
const lastSent = new Map();
function throttled(key, ms = 60000) {
  const t = lastSent.get(key) || 0;
  if (Date.now() - t < ms) return true;
  lastSent.set(key, Date.now());
  return false;
}

/**
 * Envoie (ou renvoie) l'email de confirmation d'adresse à l'utilisateur connecté
 */
export async function sendVerificationEmail(req, res) {
  try {
    const record = await admin.auth().getUser(req.user.firebaseUid);
    if (record.emailVerified) return res.json({ message: 'Adresse déjà confirmée', verified: true });
    if (throttled(`verify:${req.user._id}`)) return res.status(429).json({ error: 'Email déjà envoyé il y a moins d\'une minute. Vérifiez vos spams avant de réessayer.' });
    const link = await actionLink('verify', req.user.email, '/dashboard');
    await sendVerificationLink(req.user.email, req.user.profile?.companyName || req.user.profile?.name, link);
    res.json({ message: 'Email de confirmation envoyé', verified: false });
  } catch (error) {
    logger.error('sendVerificationEmail failed:', error);
    res.status(502).json({ error: `Envoi impossible : ${error?.message || 'erreur inconnue'}` });
  }
}

/**
 * Appelé à l'inscription (non bloquant)
 */
export async function sendVerificationAfterRegistration(user) {
  try {
    const link = await actionLink('verify', user.email, '/dashboard');
    await sendVerificationLink(user.email, user.profile?.companyName || user.profile?.name, link);
    lastSent.set(`verify:${user._id}`, Date.now());
  } catch (error) {
    logger.error('Verification email after registration failed:', error?.message || error);
  }
}

/** Limite par IP : 5 demandes de réinitialisation par 15 min */
export const passwordResetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de demandes. Réessayez dans quelques minutes.' } });

/**
 * Mot de passe oublié (public). Réponse identique que l'email existe ou non.
 */
export async function requestPasswordReset(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = { message: 'Si un compte existe pour cette adresse, un email de réinitialisation vient d\'être envoyé.' };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
  try {
    if (throttled(`reset:${email}`)) return res.json(generic);
    const user = await User.findOne({ email, status: { $ne: 'deleted' } }).select('_id email profile.name profile.companyName');
    if (!user) return res.json(generic);
    const link = await actionLink('reset', email, '/login');
    await sendPasswordResetLink(email, user.profile?.companyName || user.profile?.name, link);
    res.json(generic);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return res.json(generic);
    logger.error('requestPasswordReset failed:', error);
    res.status(502).json({ error: `Envoi impossible : ${error?.message || 'erreur inconnue'}` });
  }
}
