import admin from 'firebase-admin';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { sendVerificationLink, sendPasswordResetLink, sendVerificationReminder } from '../services/email.js';
import logger from '../utils/logger.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { rewriteActionLink } from '../utils/authLinks.js';

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
    return rewriteActionLink(await gen(settings));
  } catch (err) {
    // Domaine de retour non autorisé dans Firebase (IP, localhost) : lien sans retour
    if (['auth/invalid-continue-uri', 'auth/unauthorized-continue-uri'].includes(err?.code)) return rewriteActionLink(await gen(undefined));
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
    if (!(await getSetting(SETTINGS.verificationEmails.key, SETTINGS.verificationEmails.default))) return res.json({ message: 'Envoi des emails de confirmation désactivé par l\'administrateur (environnement de test).', verified: false, disabled: true });
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
    if (!(await getSetting(SETTINGS.verificationEmails.key, SETTINGS.verificationEmails.default))) { logger.info(`Verification email skipped for ${user._id} (setting verificationEmails off)`); return; }
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

/**
 * Rappels de confirmation d'adresse (tâche planifiée) : J+1 puis J+4 après l'inscription, tant que l'adresse n'est pas confirmée.
 * Avant chaque envoi, l'état Firebase est relu : une adresse confirmée sans reconnexion est reportée en base et ne reçoit rien.
 */
export async function runEmailVerificationReminders({ limit = 100 } = {}) {
  if (!(await getSetting(SETTINGS.verifyReminderEnabled.key, SETTINGS.verifyReminderEnabled.default))) return 0;
  if (!(await getSetting(SETTINGS.verificationEmails.key, SETTINGS.verificationEmails.default))) return 0;
  const { MemberMessageLog } = await import('../models/MemberMessage.js');
  const steps = [{ key: 'verifyReminder1', days: 1 }, { key: 'verifyReminder2', days: 4 }];
  let sent = 0;
  for (const step of steps) {
    const done = await MemberMessageLog.distinct('userId', { key: step.key });
    const users = await User.find({ role: { $in: ['creator', 'brand'] }, status: { $in: ['active', 'pending'] }, 'verification.email': { $ne: true }, createdAt: { $lte: new Date(Date.now() - step.days * 86400000) }, _id: { $nin: done } }).select('email profile createdAt').limit(limit).lean();
    for (const u of users) {
      try {
        let record = null;
        try { record = await admin.auth().getUserByEmail(u.email); } catch { /* compte Firebase absent : on tente quand même l'envoi */ }
        if (record?.emailVerified) { await User.updateOne({ _id: u._id }, { $set: { 'verification.email': true } }); continue; }
        const link = await actionLink('verify', u.email, '/dashboard');
        let emailed = true;
        // Adresse refusée par le serveur d'envoi (domaine inexistant, boîte pleine) : tracé quand même, pour ne pas réessayer chaque heure
        try { await sendVerificationReminder(u.email, u.profile?.companyName || u.profile?.name, link, step.key === 'verifyReminder2'); }
        catch (err) { emailed = false; logger.warn(`Verification reminder ${step.key} for ${u.email} not delivered: ${err?.message || err}`); }
        await MemberMessageLog.create({ userId: u._id, key: step.key, emailed }).catch(() => {});
        if (emailed) sent++;
      } catch (err) { logger.warn(`Verification reminder ${step.key} for ${u.email}: ${err?.message || err}`); }
    }
  }
  return sent;
}
