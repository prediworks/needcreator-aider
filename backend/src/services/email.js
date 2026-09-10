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

/**
 * Badge Ambassadeur attribué
 */
export async function sendAmbassadorApproved(email, name) {
  const subject = 'Vous êtes Ambassadeur NeedCreator ! 🌟';
  const html = `
    <h1>Merci ${name} !</h1>
    <p>Votre vidéo a été validée : vous avez maintenant le badge <strong>Ambassadeur</strong>.</p>
    <p>Vous accédez aux nouvelles campagnes 24 h avant tout le monde.</p>
    <p><a href="${config.cors.origin}/campaigns">Voir les campagnes en avant-première</a></p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Invitation d'une marque à candidater
 */
export async function sendCampaignInvitation(email, name, brandName, campaignTitle, campaignId, message = '') {
  const subject = `${brandName} vous invite sur la campagne "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name} !</h1>
    <p><strong>${brandName}</strong> a consulté votre profil et souhaite travailler avec vous sur la campagne <strong>${campaignTitle}</strong>.</p>
    ${message ? `<blockquote>${message}</blockquote>` : ''}
    <p><a href="${config.cors.origin}/campaigns/${campaignId}">Voir la campagne et envoyer un devis</a></p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Nouveau message (anti-spam : au plus un email toutes les 15 min par discussion)
 */
export async function sendNewMessageNotification(email, name, senderName, campaignTitle, campaignId, creatorId, text) {
  const subject = `Nouveau message de ${senderName} — ${campaignTitle}`;
  const html = `
    <h1>Bonjour ${name}</h1>
    <p><strong>${senderName}</strong> vous a écrit au sujet de la campagne <strong>${campaignTitle}</strong> :</p>
    <blockquote style="border-left:3px solid #05ddb2;padding-left:12px;color:#444">${String(text).slice(0, 500).replace(/</g, '&lt;')}</blockquote>
    <p><a href="${config.cors.origin}/messages?campaign=${campaignId}&creator=${creatorId}">Répondre sur NeedCreator</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendProductShipped(email, name, brandName, campaignTitle, carrier, trackingNumber, trackingUrl, deliveryId) {
  const subject = `📦 ${brandName} vous a envoyé le produit — ${campaignTitle}`;
  const html = `
    <h1>Bonjour ${name}</h1>
    <p><strong>${brandName}</strong> a expédié le produit pour la campagne <strong>${campaignTitle}</strong>.</p>
    ${carrier || trackingNumber ? `<p>Transporteur : ${carrier || '—'} · Suivi : ${trackingUrl ? `<a href="${trackingUrl}">${trackingNumber || 'lien'}</a>` : (trackingNumber || '—')}</p>` : ''}
    <p>Dès réception, confirmez-le sur la plateforme : votre délai de production démarrera à ce moment-là.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Confirmer la réception</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendProductReceived(email, companyName, creatorName, campaignTitle, productionDeadline, deliveryId) {
  const subject = `✅ ${creatorName} a reçu le produit — ${campaignTitle}`;
  const html = `
    <h1>Bonjour ${companyName}</h1>
    <p><strong>${creatorName}</strong> confirme avoir reçu le produit pour <strong>${campaignTitle}</strong>.</p>
    <p>Livraison des vidéos attendue avant le <strong>${new Date(productionDeadline).toLocaleDateString('fr-FR')}</strong>.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Suivre la livraison</a></p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Contrat de mission généré (marque et créateur)
 */
export async function sendContractGenerated(email, name, campaignTitle, contractNumber, deliveryId) {
  const subject = `Votre contrat de mission ${contractNumber} — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>Le devis a été accepté : le contrat de mission et de cession de droits <strong>${contractNumber}</strong> est disponible.</p>
    <p>Il récapitule les parties, la mission, le prix et les droits d'utilisation convenus.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir la mission et télécharger le contrat</a></p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Droits d'utilisation qui expirent dans 30 jours
 */
export async function sendRightsExpiring(email, name, campaignTitle, endDate, deliveryId, isBrand) {
  const date = new Date(endDate).toLocaleDateString('fr-FR');
  const subject = `Les droits d'utilisation de "${campaignTitle}" expirent le ${date}`;
  const html = isBrand ? `
    <h1>Bonjour ${name},</h1>
    <p>Les droits d'utilisation des vidéos de la campagne "${campaignTitle}" prennent fin le <strong>${date}</strong>.</p>
    <p>Passé cette date, vous ne pourrez plus diffuser ces contenus sans l'accord du créateur.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Demander une prolongation</a></p>
  ` : `
    <h1>Bonjour ${name},</h1>
    <p>Les droits que vous avez cédés sur les vidéos de "${campaignTitle}" prennent fin le <strong>${date}</strong>.</p>
    <p>La marque peut vous demander une prolongation : vous fixerez alors librement votre prix.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir la mission</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendExtensionRequested(email, name, campaignTitle, message, deliveryId) {
  const subject = `Demande de prolongation des droits — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>La marque souhaite prolonger les droits d'utilisation des vidéos de "${campaignTitle}".</p>
    ${message ? `<p>Son message : « ${message} »</p>` : ''}
    <p>Proposez votre prix et la durée souhaitée depuis la page de la mission.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Faire une proposition</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendExtensionProposed(email, name, campaignTitle, price, durationLabel, deliveryId) {
  const subject = `Proposition de prolongation des droits — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>Le créateur propose de prolonger les droits d'utilisation des vidéos de "${campaignTitle}" pour <strong>${durationLabel}</strong>, au prix de <strong>${price} € HT</strong>.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Accepter et payer</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendExtensionPaid(email, name, campaignTitle, addendumNumber, newEndAt, deliveryId) {
  const subject = `Prolongation des droits confirmée — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>La prolongation des droits sur les vidéos de "${campaignTitle}" est confirmée (avenant <strong>${addendumNumber}</strong>).</p>
    <p>${newEndAt ? `Nouvelle date de fin des droits : <strong>${new Date(newEndAt).toLocaleDateString('fr-FR')}</strong>.` : 'Les droits sont désormais illimités dans le temps.'}</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Télécharger l'avenant</a></p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Confirmation d'adresse email (lien Firebase, envoyé par notre SMTP)
 */
export async function sendVerificationLink(email, name, link) {
  const subject = 'Confirmez votre adresse email — NeedCreator';
  const html = `
    <h1>Bienvenue ${name || ''} !</h1>
    <p>Pour activer toutes les fonctionnalités de NeedCreator, confirmez votre adresse email en cliquant sur le bouton ci-dessous.</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#05ddb2;color:#111;border-radius:8px;text-decoration:none;font-weight:600">Confirmer mon adresse</a></p>
    <p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${link}</p>
    <p style="color:#666;font-size:13px">Vous n'êtes pas à l'origine de cette inscription ? Ignorez simplement cet email.</p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Réinitialisation du mot de passe (lien Firebase, envoyé par notre SMTP)
 */
export async function sendPasswordResetLink(email, name, link) {
  const subject = 'Réinitialisation de votre mot de passe — NeedCreator';
  const html = `
    <h1>Bonjour ${name || ''},</h1>
    <p>Vous avez demandé à réinitialiser votre mot de passe NeedCreator. Cliquez sur le bouton pour en choisir un nouveau. Ce lien est valable une heure.</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#05ddb2;color:#111;border-radius:8px;text-decoration:none;font-weight:600">Choisir un nouveau mot de passe</a></p>
    <p style="color:#666;font-size:13px">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${link}</p>
    <p style="color:#666;font-size:13px">Vous n'avez rien demandé ? Ignorez cet email, votre mot de passe reste inchangé.</p>
  `;
  return sendEmail(email, subject, html);
}
