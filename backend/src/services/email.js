import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

// Create SendGrid transporter as fallback
const sendgridTransporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: config.email.sendgridApiKey,
  },
});

// Create SMTP transporter if SMTP_HOST is configured
const smtpConfig = config.email.smtp;
const smtpTransporter = smtpConfig?.host
  ? nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user
        ? {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
          }
        : undefined,
    })
  : null;

// Use SMTP if available, otherwise fallback to SendGrid
const transporter = smtpTransporter || sendgridTransporter;

/**
 * Send email
 */
async function sendEmail(to, subject, html, text = null) {
  try {
    const info = await transporter.sendMail({
      from: config.email.fromEmail,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    });
    
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
}

/**
 * Welcome email for creators
 */
export async function sendCreatorWelcome(email, name) {
  const subject = 'Bienvenue sur la plateforme UGC ! 🎉';
  const html = `
    <h1>Bienvenue ${name} !</h1>
    <p>Votre compte créateur a été créé avec succès.</p>
    <p>Votre profil est en cours de validation par notre équipe. Vous recevrez un email dans les 24h.</p>
    <p>En attendant, vous pouvez :</p>
    <ul>
      <li>Compléter votre portfolio (minimum 3 vidéos)</li>
      <li>Configurer vos tarifs</li>
      <li>Connecter votre compte Stripe pour recevoir vos paiements</li>
    </ul>
    <p>À très bientôt !</p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Welcome email for brands
 */
export async function sendBrandWelcome(email, companyName) {
  const subject = 'Bienvenue sur la plateforme UGC ! 🚀';
  const html = `
    <h1>Bienvenue ${companyName} !</h1>
    <p>Votre compte marque a été créé avec succès.</p>
    <p>Vous pouvez maintenant :</p>
    <ul>
      <li>Créer votre première campagne</li>
      <li>Parcourir les profils de créateurs</li>
      <li>Configurer votre moyen de paiement</li>
    </ul>
    <p>Besoin d'aide ? Notre équipe est là pour vous accompagner.</p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Creator profile approved
 */
export async function sendCreatorApproved(email, name) {
  const subject = 'Votre profil a été approuvé ! ✅';
  const html = `
    <h1>Félicitations ${name} !</h1>
    <p>Votre profil créateur a été validé par notre équipe.</p>
    <p>Vous pouvez maintenant candidater aux campagnes et commencer à gagner de l'argent !</p>
    <p><a href="${config.cors.origin}/campaigns">Voir les campagnes disponibles</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * New campaign notification for creators
 */
export async function sendNewCampaignNotification(email, name, campaignTitle, campaignId) {
  const subject = `Nouvelle campagne : ${campaignTitle}`;
  const html = `
    <h1>Bonjour ${name} !</h1>
    <p>Une nouvelle campagne correspond à votre profil :</p>
    <h2>${campaignTitle}</h2>
    <p><a href="${config.cors.origin}/campaigns/${campaignId}">Voir la campagne et candidater</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Application received notification for brand
 */
export async function sendApplicationReceived(email, companyName, creatorName, campaignTitle) {
  const subject = `Nouvelle candidature pour "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${companyName} !</h1>
    <p>${creatorName} a candidaté à votre campagne "${campaignTitle}".</p>
    <p><a href="${config.cors.origin}/dashboard">Voir la candidature</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Application accepted notification for creator
 */
export async function sendApplicationAccepted(email, name, campaignTitle, campaignId) {
  const subject = `Votre candidature a été acceptée ! 🎉`;
  const html = `
    <h1>Félicitations ${name} !</h1>
    <p>Votre candidature pour "${campaignTitle}" a été acceptée.</p>
    <p>Vous pouvez maintenant commencer la production.</p>
    <p><a href="${config.cors.origin}/campaigns/${campaignId}">Accéder au brief complet</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Delivery submitted notification for brand
 */
export async function sendDeliverySubmitted(email, companyName, campaignTitle, deliveryId) {
  const subject = `Livraison reçue pour "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${companyName} !</h1>
    <p>Le créateur a soumis les livrables pour "${campaignTitle}".</p>
    <p><strong>Important :</strong> Vous avez 7 jours pour valider ou demander des révisions.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir les livrables</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Delivery approved notification for creator
 */
export async function sendDeliveryApproved(email, name, campaignTitle, amount) {
  const subject = `Livraison approuvée ! Paiement en cours 💰`;
  const html = `
    <h1>Bravo ${name} !</h1>
    <p>Votre livraison pour "${campaignTitle}" a été approuvée.</p>
    <p>Montant : ${amount}€</p>
    <p>Le paiement sera transféré sur votre compte Stripe sous 2-3 jours ouvrés.</p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Revision requested notification for creator
 */
export async function sendRevisionRequested(email, name, campaignTitle, feedback, deliveryId) {
  const subject = `Révision demandée pour "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name}</h1>
    <p>La marque a demandé une révision pour "${campaignTitle}".</p>
    <h3>Feedback :</h3>
    <p>${feedback}</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Soumettre la révision</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Auto-approval reminder for brand (J+3)
 */
export async function sendAutoApprovalReminder(email, companyName, campaignTitle, daysLeft, deliveryId) {
  const subject = `Rappel : ${daysLeft} jours pour valider "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${companyName}</h1>
    <p>Il vous reste ${daysLeft} jours pour valider ou demander des révisions pour "${campaignTitle}".</p>
    <p>Passé ce délai, la livraison sera automatiquement approuvée et le paiement sera effectué.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir les livrables</a></p>
  `;
  
  return sendEmail(email, subject, html);
}

/**
 * Auto-approval notification
 */
export async function sendAutoApprovalNotification(brandEmail, creatorEmail, companyName, creatorName, campaignTitle, amount) {
  // To brand
  await sendEmail(
    brandEmail,
    `Approbation automatique : "${campaignTitle}"`,
    `
      <h1>Bonjour ${companyName}</h1>
      <p>La livraison pour "${campaignTitle}" a été automatiquement approuvée après 7 jours.</p>
      <p>Le paiement de ${amount}€ a été effectué au créateur.</p>
    `
  );
  
  // To creator
  await sendEmail(
    creatorEmail,
    `Approbation automatique ! Paiement en cours 💰`,
    `
      <h1>Bonjour ${creatorName}</h1>
      <p>Votre livraison pour "${campaignTitle}" a été automatiquement approuvée.</p>
      <p>Montant : ${amount}€</p>
      <p>Le paiement sera transféré sur votre compte Stripe sous 2-3 jours ouvrés.</p>
    `
  );
}
