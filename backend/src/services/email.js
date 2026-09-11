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

const SITE = () => config.cors.origin;
const COMPANY = { legalName: 'PREDIWORKS SAS', address: '17 Rue Coysevox, Paris', contact: 'contact@needcreator.com' };
const BRAND_COLOR = '#05ddb2';

/**
 * Bouton d'action (un seul par email de préférence)
 */
export function button(url, label) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0"><tr><td align="center" bgcolor="${BRAND_COLOR}" style="border-radius:8px"><a href="${url}" style="display:inline-block;padding:13px 22px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#0b1f1a;text-decoration:none;border-radius:8px">${label}</a></td></tr></table>`;
}

/**
 * Encart résumé (campagne, montant, date…) : rows = [[label, value], …]
 */
export function summary(rows) {
  const cells = rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v]) =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;width:40%">${k}</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${v}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;background:#f3f7f6;border-radius:8px"><tr><td style="padding:12px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${cells}</table></td></tr></table>`;
}

/**
 * Habille un fragment HTML (h1, p, ul, a…) dans le gabarit NeedCreator : en-tête avec logo, carte blanche, pied de page.
 * Les liens seuls dans un paragraphe deviennent des boutons.
 */
export function renderLayout(fragment, { preheader = '' } = {}) {
  let body = String(fragment || '')
    // <p><a href="…">Libellé</a></p> → bouton (sauf si le lien est déjà stylé)
    .replace(/<p>\s*<a href="([^"]+)"(?![^>]*style=)>([^<]+)<\/a>\s*<\/p>/g, (m, url, label) => button(url, label))
    .replace(/<h1>/g, '<h1 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#111827">')
    .replace(/<h2>/g, '<h2 style="margin:20px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:1.3;color:#111827">')
    .replace(/<h3>/g, '<h3 style="margin:16px 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.3;color:#374151">')
    .replace(/<p>/g, '<p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#374151">')
    .replace(/<p style="color:#666;font-size:13px">/g, '<p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b7280">')
    .replace(/<ul>/g, '<ul style="margin:0 0 12px;padding-left:20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#374151">')
    .replace(/<li>/g, '<li style="margin:0 0 6px">')
    .replace(/<a href="([^"]+)">/g, `<a href="$1" style="color:#0a8f75;text-decoration:underline">`);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NeedCreator</title></head>
<body style="margin:0;padding:0;background:#f4f6f8">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f4f6f8">${preheader}</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f6f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0 4px 14px"><a href="${SITE()}" style="text-decoration:none"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
    <td width="30" height="30" bgcolor="${BRAND_COLOR}" align="center" valign="middle" style="border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:30px;color:#ffffff;font-weight:700">&#9654;</td>
    <td style="padding-left:10px;font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#111827">NeedCreator</td>
  </tr></table></a></td></tr>
  <tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 28px 20px">${body}</td></tr>
  <tr><td style="padding:16px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9ca3af;text-align:center">
    <a href="${SITE()}/dashboard" style="color:#6b7280;text-decoration:underline">Mon compte</a> &nbsp;·&nbsp; <a href="${SITE()}/how-it-works" style="color:#6b7280;text-decoration:underline">Comment ça marche</a> &nbsp;·&nbsp; <a href="mailto:${COMPANY.contact}" style="color:#6b7280;text-decoration:underline">${COMPANY.contact}</a><br>
    Vous recevez cet email parce que vous avez un compte NeedCreator.<br>
    © ${year} NeedCreator · ${COMPANY.legalName}, ${COMPANY.address}
  </td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Version texte lisible (liens conservés) pour les clients sans HTML et les filtres anti-spam
 */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, url, label) => `${label.replace(/<[^>]*>/g, '').trim()} : ${url}`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/td>\s*<td[^>]*>/gi, ' : ')
    .replace(/<\/(p|h1|h2|h3|li|tr|div|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#9654;/g, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Send email (le fragment HTML est habillé dans le gabarit ; passer raw:true pour envoyer tel quel)
 */
export async function sendEmail(to, subject, html, text = null, { raw = false, preheader = '' } = {}) {
  try {
    const full = raw ? html : renderLayout(html, { preheader });
    const info = await transporter.sendMail({
      from: config.email.fromEmail,
      to,
      subject,
      html: full,
      text: text || htmlToText(raw ? html : html),
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
export async function sendApplicationReceived(email, companyName, creatorName, campaignTitle, isAmbassador = false) {
  const subject = `Nouveau devis pour "${campaignTitle}"${isAmbassador ? ' (créateur Ambassadeur)' : ''}`;
  const html = `
    <h1>Bonjour ${companyName} !</h1>
    <p>${creatorName}${isAmbassador ? ', <strong>créateur Ambassadeur NeedCreator</strong> 🌟,' : ''} a envoyé un devis pour votre campagne.</p>
    ${summary([['Campagne', campaignTitle], ['Créateur', creatorName + (isAmbassador ? ' · Ambassadeur' : '')]])}
    <p><a href="${config.cors.origin}/dashboard">Voir le devis</a></p>
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
    <p><strong>Important :</strong> Vous avez ${config.business.autoApprovalDays} jours pour valider ou demander des révisions.</p>
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
    <p>Vos vidéos ont été validées par la marque.</p>
    ${summary([['Mission', campaignTitle], ['Montant', `${amount} €`], ['Paiement', 'Virement Stripe sous 2 à 3 jours ouvrés']])}
    <p><a href="${config.cors.origin}/earnings">Voir mes revenus</a></p>
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
      <p>La livraison pour "${campaignTitle}" a été automatiquement approuvée après ${config.business.autoApprovalDays} jours.</p>
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
    <p>Le devis a été accepté : le contrat de mission et de cession de droits est disponible. Il récapitule les parties, la mission, le prix et les droits d'utilisation convenus.</p>
    ${summary([['Mission', campaignTitle], ['Contrat', contractNumber]])}
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

/**
 * Livraison en retard (créateur) et garantie de remplacement (marque)
 */
export async function sendDeliveryLate(email, name, campaignTitle, deadline, deliveryId) {
  const subject = `Livraison en retard — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>La date de livraison prévue pour "${campaignTitle}" (${new Date(deadline).toLocaleDateString('fr-FR')}) est dépassée.</p>
    <p>Livrez vos vidéos au plus vite : passé 48 heures, la marque pourra confier la mission à un autre créateur et votre profil en gardera la trace.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Livrer maintenant</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendReplacementAvailable(email, companyName, creatorName, campaignTitle, deliveryId) {
  const subject = `Garantie de remplacement — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${companyName},</h1>
    <p>${creatorName} n'a pas livré la mission "${campaignTitle}" dans le délai prévu, malgré nos rappels.</p>
    <p>Vous pouvez la confier en un clic à l'un des autres créateurs ayant envoyé un devis : le montant bloqué est libéré et la nouvelle mission démarre immédiatement.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Choisir un remplaçant</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendMissionWithdrawn(email, name, campaignTitle) {
  const subject = `Mission retirée — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>La mission "${campaignTitle}" vous a été retirée : la livraison n'a pas été effectuée dans le délai prévu et la marque a fait appel à un autre créateur.</p>
    <p>Aucun paiement n'est dû. Pour éviter que cela se reproduise, prévenez la marque via la messagerie dès qu'un retard se profile.</p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Invitation d'un créateur référencé (pas encore inscrit), envoyée par la plateforme au nom d'une marque
 */
export async function sendExternalCreatorInvitation(email, name, brandName, campaignTitle, joinLink, message = '') {
  const subject = campaignTitle ? `${brandName} vous propose une collaboration UGC — "${campaignTitle}"` : `${brandName} souhaite collaborer avec vous sur NeedCreator`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>La marque <strong>${brandName}</strong> a repéré votre profil et souhaite vous confier ${campaignTitle ? `la campagne vidéo « ${campaignTitle} »` : 'une campagne vidéo UGC'} sur NeedCreator.</p>
    ${message ? `<p>Son message : « ${message} »</p>` : ''}
    <p>NeedCreator est une plateforme française : vous fixez votre prix, le paiement est bloqué avant que vous ne commenciez, et vous recevez 90 % de votre devis. Inscription gratuite, 3 vidéos de portfolio suffisent.</p>
    <p><a href="${joinLink}" style="display:inline-block;padding:12px 20px;background:#05ddb2;color:#111;border-radius:8px;text-decoration:none;font-weight:600">Découvrir la proposition et m'inscrire</a></p>
    <p style="color:#666;font-size:13px">Vous recevez cet email car votre profil public (réseaux sociaux) figure dans notre annuaire de créateurs. Vous pouvez le retirer à tout moment depuis sa page sur ${config.cors.origin}/annuaire-createurs, ou en répondant à cet email.</p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Première mission validée : invitation à devenir Ambassadeur
 */
export async function sendBecomeAmbassador(email, name, campaignTitle) {
  const subject = 'Première mission validée : et si vous parliez de NeedCreator ?';
  const html = `
    <h1>Bravo ${name} !</h1>
    <p>Votre première mission ("${campaignTitle}") est validée et votre paiement est en route.</p>
    <p>Vous avez maintenant une vraie expérience à raconter : publiez sur vos réseaux une courte vidéo sincère sur NeedCreator, avec votre lien de parrainage, et devenez <strong>Ambassadeur</strong> :
    campagnes 24 h en avant-première, devis remontés en tête chez les marques, place en tête de l'annuaire, et 10 € par créateur inscrit via votre lien qui livre sa première mission.</p>
    <p><a href="${config.cors.origin}/profile">Envoyer le lien de ma vidéo</a></p>
  `;
  return sendEmail(email, subject, html);
}

/**
 * Relances automatiques (réglables dans l'admin)
 */
export async function sendQuotesAwaitingReminder(email, companyName, campaignTitle, count, campaignId, days) {
  const subject = `${count} devis attend${count > 1 ? 'ent' : ''} votre réponse — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${companyName},</h1>
    <p>${count > 1 ? `${count} créateurs ont envoyé un devis` : 'Un créateur a envoyé un devis'} pour votre campagne il y a plus de ${days} jour${days > 1 ? 's' : ''}, sans réponse de votre part.</p>
    ${summary([['Campagne', campaignTitle], ['Devis en attente', String(count)]])}
    <p>Les créateurs s'organisent en fonction de vos réponses : un devis accepté rapidement, c'est une vidéo livrée plus tôt. Vous pouvez aussi décliner en un clic.</p>
    <p><a href="${config.cors.origin}/campaigns/${campaignId}">Répondre aux devis</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendCreatorNoUploadReminder(email, name, campaignTitle, deliveryId, deadline) {
  const subject = `Où en est votre mission "${campaignTitle}" ?`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>Vous avez été sélectionné(e) pour cette mission, mais aucune vidéo n'a encore été envoyée.</p>
    ${summary([['Mission', campaignTitle], ['Date limite', deadline ? new Date(deadline).toLocaleDateString('fr-FR') : 'selon votre devis']])}
    <p>Si tout se passe bien, ignorez ce message. En cas d'imprévu, prévenez la marque via la messagerie : un retard annoncé se gère, un silence non.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Envoyer mes vidéos</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendProductReceivedCheck(email, name, campaignTitle, brandName, deliveryId, shippedAt) {
  const subject = `Avez-vous reçu le produit de ${brandName} ?`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>${brandName} a expédié le produit le ${new Date(shippedAt).toLocaleDateString('fr-FR')} pour la mission "${campaignTitle}", et la réception n'est pas encore confirmée.</p>
    <p>Confirmez la réception dès que le colis est arrivé : c'est ce qui démarre votre délai de production. S'il n'est pas arrivé, signalez-le à la marque via la messagerie.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Confirmer la réception</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendRevisionPendingReminder(email, name, campaignTitle, deliveryId, autoRejectAt) {
  const subject = `Révision en attente — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>La marque a demandé une révision sur la mission "${campaignTitle}" et attend une nouvelle version.</p>
    ${autoRejectAt ? `<p><strong>Sans nouvelle version avant le ${new Date(autoRejectAt).toLocaleDateString('fr-FR')}, la mission sera refusée définitivement</strong> et le montant bloqué sera rendu à la marque.</p>` : ''}
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Envoyer la nouvelle version</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendAutoRejected(brandEmail, creatorEmail, companyName, creatorName, campaignTitle, days, deliveryId, campaignId, paymentNote) {
  await sendEmail(brandEmail, `Mission refusée définitivement — "${campaignTitle}"`, `
    <h1>Bonjour ${companyName},</h1>
    <p>${creatorName} n'a pas envoyé de nouvelle version dans les ${days} jours suivant votre demande de révision. La mission est refusée définitivement.</p>
    ${summary([['Campagne', campaignTitle], ['Créateur', creatorName], ['Paiement', paymentNote]])}
    <p>Votre campagne est de nouveau ouverte : vous pouvez sélectionner un autre créateur parmi les devis reçus.</p>
    <p><a href="${config.cors.origin}/campaigns/${campaignId}">Choisir un autre créateur</a></p>
  `);
  await sendEmail(creatorEmail, `Mission refusée — "${campaignTitle}"`, `
    <h1>Bonjour ${creatorName},</h1>
    <p>La mission "${campaignTitle}" a été refusée définitivement : aucune nouvelle version n'a été envoyée dans les ${days} jours suivant la demande de révision de la marque.</p>
    <p>Aucun paiement n'est dû. Pour la suite, répondez aux demandes de révision dans le délai, ou prévenez la marque via la messagerie en cas d'empêchement.</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir la mission</a></p>
  `);
}

/**
 * Litiges
 */
export async function sendDisputeOpened(email, name, brandName, campaignTitle, reason, deliveryId) {
  const subject = `Refus définitif demandé — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>${brandName} a demandé un refus définitif de vos vidéos, les révisions prévues au devis étant épuisées. La validation automatique est suspendue le temps de l'examen.</p>
    ${summary([['Mission', campaignTitle], ['Motif de la marque', reason]])}
    <p>Vous pouvez répondre une fois depuis la page de la mission : notre équipe lira les deux versions et tranchera (paiement intégral, partage, ou remboursement de la marque).</p>
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Répondre au litige</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendDisputeResponse(email, companyName, creatorName, campaignTitle, response, deliveryId) {
  const subject = `Réponse du créateur au litige — "${campaignTitle}"`;
  const html = `
    <h1>Bonjour ${companyName},</h1>
    <p>${creatorName} a répondu à votre demande de refus définitif. Notre équipe tranchera sous peu.</p>
    ${summary([['Mission', campaignTitle], ['Réponse du créateur', response]])}
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir la mission</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendDisputeResolved(brandEmail, creatorEmail, companyName, creatorName, campaignTitle, dispute, deliveryId) {
  const outcome = dispute.outcome === 'approve'
    ? 'Paiement intégral au créateur : les vidéos sont considérées comme livrées conformément au brief.'
    : dispute.outcome === 'refund_full'
      ? 'Remboursement intégral de la marque : la mission est refusée, aucun paiement au créateur.'
      : `Partage : la marque paie ${dispute.creatorPercent} % du prix (${dispute.paidAmount} €), le reste (${dispute.refundedAmount} €) lui est rendu.`;
  const rows = summary([['Mission', campaignTitle], ['Décision', outcome], ['Motivation', dispute.note]]);
  await sendEmail(brandEmail, `Litige tranché — "${campaignTitle}"`, `
    <h1>Bonjour ${companyName},</h1>
    <p>Notre équipe a examiné la livraison de ${creatorName} et votre motif de refus.</p>
    ${rows}
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir la mission</a></p>
  `);
  await sendEmail(creatorEmail, `Litige tranché — "${campaignTitle}"`, `
    <h1>Bonjour ${creatorName},</h1>
    <p>Notre équipe a examiné vos vidéos et le motif de ${companyName}.</p>
    ${rows}
    <p><a href="${config.cors.origin}/deliveries/${deliveryId}">Voir la mission</a></p>
  `);
}

/**
 * Avis (double aveugle)
 */
export async function sendReviewNudge(email, name, otherName, campaignTitle, deadline, campaignId) {
  const subject = `${otherName} a laissé un avis sur « ${campaignTitle} »`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>${otherName} vient de laisser un avis sur votre collaboration. Il restera caché jusqu'à ce que vous laissiez le vôtre : les deux avis sont publiés en même temps, pour que chacun s'exprime librement.</p>
    ${summary([['Mission', campaignTitle], ['Publication automatique', `le ${new Date(deadline).toLocaleDateString('fr-FR')} si vous ne répondez pas`]])}
    <p><a href="${config.cors.origin}/campaigns/${campaignId}">Laisser mon avis et découvrir le sien</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendReviewsPublished(email, name, otherName, campaignTitle) {
  const subject = `Votre avis et celui de ${otherName} sont publiés`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>Les avis sur la mission « ${campaignTitle} » sont maintenant visibles. Vous pouvez répondre publiquement à l'avis reçu depuis votre profil.</p>
    <p><a href="${config.cors.origin}/profile">Voir l'avis reçu</a></p>
  `;
  return sendEmail(email, subject, html);
}

export async function sendReviewResponse(email, name, responderName, campaignTitle, comment) {
  const subject = `${responderName} a répondu à votre avis`;
  const html = `
    <h1>Bonjour ${name},</h1>
    <p>${responderName} a répondu publiquement à votre avis sur « ${campaignTitle} ».</p>
    ${summary([['Réponse', comment]])}
  `;
  return sendEmail(email, subject, html);
}

/**
 * Équipe marque : invitation d'un collaborateur
 */
export async function sendTeamInvitation(email, name, companyName, invitedBy, link) {
  const subject = `${invitedBy} vous invite à rejoindre ${companyName} sur NeedCreator`;
  const html = `
    <h1>Bonjour ${name || ''},</h1>
    <p>${invitedBy} vous invite à gérer les campagnes UGC de <strong>${companyName}</strong> sur NeedCreator : créer des campagnes, choisir des créateurs, valider les vidéos, au nom de l'entreprise.</p>
    <p>Créez votre accès avec cette adresse email (${email}) : votre compte sera automatiquement rattaché à l'équipe.</p>
    <p><a href="${link}">Rejoindre l'équipe</a></p>
    <p style="color:#666;font-size:13px">Vous ne connaissez pas ${companyName} ? Ignorez cet email.</p>
  `;
  return sendEmail(email, subject, html);
}
