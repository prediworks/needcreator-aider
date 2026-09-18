import express from 'express';
import Joi from 'joi';
import { validate } from '../middleware/validate.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import ContactMessage from '../models/ContactMessage.js';
import { getSetting, SETTINGS } from '../models/Setting.js';
import { sendEmail, summary } from '../services/email.js';
import logger from '../utils/logger.js';

const router = express.Router();
const ROLE = { brand: 'Marque', creator: 'Créateur', other: 'Autre' };
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const schema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().max(200).required(),
  role: Joi.string().valid('brand', 'creator', 'other').default('other'),
  subject: Joi.string().trim().min(3).max(150).required(),
  message: Joi.string().trim().min(20).max(4000).required(),
  userId: Joi.string().hex().length(24).allow('', null),
  website: Joi.string().allow('').max(200), // piège à robots : champ invisible, doit rester vide
  turnstileToken: Joi.string().allow(''),
});

/** Public : formulaire « Nous contacter ». Envoi vers l'adresse du réglage « Adresse de réception du formulaire de contact ». */
router.post('/', verifyTurnstile, validate(schema), async (req, res) => {
  try {
    const { name, email, role, subject, message, userId, website } = req.body;
    if (website) return res.status(201).json({ message: 'Message envoyé' }); // robot : réponse identique, rien n'est envoyé
    const ip = req.ip || '';
    const recent = await ContactMessage.countDocuments({ ip, createdAt: { $gte: new Date(Date.now() - 3600000) } });
    if (recent >= 5) return res.status(429).json({ error: 'Trop de messages en peu de temps. Réessayez dans une heure ou écrivez-nous directement par email.' });
    const to = String(await getSetting(SETTINGS.contactEmail.key, SETTINGS.contactEmail.default) || SETTINGS.contactEmail.default).trim();
    const doc = await ContactMessage.create({ name, email, role, subject, message, userId: userId || undefined, ip, sentTo: to });
    const html = `<h2>Nouveau message du formulaire de contact</h2>${summary([['De', `${esc(name)} &lt;${esc(email)}&gt;`], ['Profil', ROLE[role]], ['Compte', userId ? 'connecté' : 'visiteur'], ['Sujet', esc(subject)]])}<p style="white-space:pre-line">${esc(message)}</p><p style="color:#666;font-size:13px">Répondez directement à cet email : la réponse part vers ${esc(email)}.</p>`;
    await sendEmail(to, `[Contact] ${subject}`, html, null, { replyTo: `${name} <${email}>` });
    doc.delivered = true; await doc.save();
    sendEmail(email, 'Nous avons bien reçu votre message', `<p>Bonjour ${esc(name)},</p><p>Merci pour votre message, nous vous répondons sous deux jours ouvrés.</p><p style="color:#666">Votre message : « ${esc(subject)} »</p>`).catch(() => {});
    logger.info(`Contact message ${doc._id} sent to ${to}`);
    res.status(201).json({ message: 'Message envoyé' });
  } catch (error) {
    logger.error('contact failed:', error);
    res.status(502).json({ error: 'Envoi impossible pour le moment. Écrivez-nous directement par email.' });
  }
});

export default router;
