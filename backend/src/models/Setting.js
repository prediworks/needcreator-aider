import mongoose from 'mongoose';
import { config } from '../config/index.js';

/**
 * Réglages modifiables depuis l'admin sans redémarrage (clé → valeur)
 */
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Setting = mongoose.model('Setting', settingSchema);

const cache = new Map();
const TTL = 30 * 1000;

/**
 * Lit un réglage (cache 30 s), avec valeur par défaut
 */
export async function getSetting(key, defaultValue) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const doc = await Setting.findOne({ key }).lean();
  const value = doc ? doc.value : defaultValue;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(key, value, userId = null) {
  await Setting.updateOne({ key }, { $set: { value, updatedBy: userId } }, { upsert: true });
  cache.set(key, { value, at: Date.now() });
}

const days = (n) => `${n} jour${n > 1 ? 's' : ''}`;

export const SETTINGS = {
  // Interroge le registre national des entreprises (annuaire-entreprises.data.gouv.fr) pour valider le SIRET
  contactEmail: { key: 'contactEmail', type: 'text', group: 'Site public', default: 'contact@needcreator.com', label: 'Adresse de réception du formulaire de contact', description: 'Les messages de la page « Nous contacter » arrivent à cette adresse ; répondre à l\'email répond directement à l\'expéditeur. Plusieurs adresses possibles, séparées par des virgules.' },
  publicCreatorsMinCount: { key: 'publicCreatorsMinCount', type: 'number', unit: 'créateurs', min: 0, max: 500, group: 'Site public', default: 6, label: 'Onglet « Inscrits » de la page Créateurs : nombre minimum de créateurs inscrits', description: 'Sur le site public, la page Créateurs affiche l\'annuaire des créateurs référencés. L\'onglet des créateurs inscrits (profil validé, portfolio, accord donné) n\'apparaît qu\'à partir de ce nombre, pour ne pas montrer une liste vide. 0 = toujours affiché.' },
  backupEnabled: { key: 'backupEnabled', type: 'boolean', group: 'Sauvegardes', default: false, label: 'Sauvegarde automatique de la base sur le serveur', description: 'Copie complète de la base (toutes les collections) dans le répertoire ci-dessous, à la fréquence indiquée, par les tâches planifiées. Indépendante des sauvegardes Atlas. Restauration : npm run backup:restore -- <archive>.' },
  backupIntervalHours: { key: 'backupIntervalHours', type: 'number', unit: 'heures', min: 1, max: 168, group: 'Sauvegardes', default: 24, label: 'Fréquence des sauvegardes', description: 'Une sauvegarde est faite si la dernière date de plus de ce nombre d\'heures (vérifié à chaque passage des tâches planifiées).' },
  backupRetentionDays: { key: 'backupRetentionDays', type: 'number', unit: 'jours', min: 0, max: 365, group: 'Sauvegardes', default: 30, label: 'Délai de conservation', description: 'Les sauvegardes plus anciennes sont supprimées après chaque nouvelle sauvegarde. 0 = tout conserver.' },
  backupDir: { key: 'backupDir', type: 'text', group: 'Sauvegardes', default: process.env.BACKUP_DIR || '', label: 'Répertoire des sauvegardes (sur le serveur)', description: 'Chemin absolu sur le VPS, accessible en écriture par l\'application. Vide = dossier needcreator-backups dans le répertoire personnel de l\'utilisateur qui lance le backend.' },
  verificationEmails: { key: 'verificationEmails', type: 'boolean', group: 'Vérifications', default: true, label: 'Envoyer les emails de confirmation d\'adresse', description: 'À l\'inscription et sur « Renvoyer l\'email ». Chaque envoi demande un lien à Firebase, qui bloque temporairement au-delà d\'un certain nombre de demandes (TOO_MANY_ATTEMPTS_TRY_LATER). À désactiver sur un environnement de développement où les tests créent des comptes en boucle ; à laisser activé en production.' },
  businessRegistryCheck: { key: 'businessRegistryCheck', type: 'boolean', group: 'Vérifications', default: process.env.BUSINESS_REGISTRY_CHECK !== 'false', label: 'Vérification des SIRET au registre national des entreprises', description: 'Si désactivé, seul le format du SIRET / TVA est contrôlé (moins de friction, moins de sécurité).' },

  // Relances automatiques (tâches planifiées, JOBS_INTERVAL_MINUTES). 0 = désactivée. Une seule relance par élément.
  reminderQuoteNoAnswerDays: { key: 'reminderQuoteNoAnswerDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 3, label: 'Marque : devis sans réponse', description: 'Email à la marque quand des devis attendent une réponse depuis ce nombre de jours (un seul email par campagne). 0 = désactivé.' },
  notifyNotSelected: { key: 'notifyNotSelected', type: 'boolean', group: 'Relances automatiques', default: true, label: 'Prévenir les créateurs non retenus', description: 'Quand tous les postes d\'une campagne sont pourvus, email court (sans motif) aux créateurs dont le devis n\'a pas été retenu, avec un lien vers les campagnes ouvertes de leurs niches et un bloc « Augmentez vos chances » adapté (portfolio, académie).' },
  notSelectedAmbassadorTip: { key: 'notSelectedAmbassadorTip', type: 'boolean', group: 'Relances automatiques', default: true, label: 'Proposer le programme Ambassadeur dans l\'email de non-sélection', description: 'Ajoute, pour les créateurs qui ne sont pas encore Ambassadeurs, le conseil de le devenir (campagnes en avant-première, devis remontés en tête, commission réduite). Présenté comme un conseil parmi d\'autres, jamais seul.' },
  reminderCreatorNoUploadDays: { key: 'reminderCreatorNoUploadDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 5, label: 'Créateur : mission sans aucune vidéo envoyée', description: 'Email au créateur sélectionné qui n\'a encore rien envoyé ce nombre de jours après la sélection (ou après la réception du produit). 0 = désactivé.' },
  reminderProductNotReceivedDays: { key: 'reminderProductNotReceivedDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 5, label: 'Créateur : produit expédié, réception non confirmée', description: 'Email au créateur ce nombre de jours après l\'expédition du produit si la réception n\'est pas confirmée. 0 = désactivé.' },
  reminderRevisionPendingDays: { key: 'reminderRevisionPendingDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 3, label: 'Créateur : révision demandée sans nouvelle version', description: 'Email au créateur ce nombre de jours après une demande de révision restée sans nouvelle version. 0 = désactivé.' },

  // Révisions et refus définitif automatique
  maxRevisions: { key: 'maxRevisions', type: 'number', unit: 'révisions', min: 0, max: 10, group: 'Révisions et refus', default: config.business.maxRevisions, label: 'Nombre maximum de révisions par mission', description: 'Au-delà, la marque ne peut plus demander de révision : elle valide (ou la validation automatique s\'applique).' },
  platformFeePercent: { key: 'platformFeePercent', type: 'number', unit: '%', min: 0, max: 50, group: 'Commission', default: config.stripe.platformFeePercent, label: 'Commission standard NeedCreator', description: 'Retenue sur le devis versé au créateur (jamais ajoutée au paiement de la marque). Figée sur chaque campagne à sa création : un changement ne concerne que les campagnes suivantes. Affichée sur le site et dans les CGU. Repli : STRIPE_PLATFORM_FEE_PERCENT du .env.' },
  proFeePercent: { key: 'proFeePercent', type: 'number', unit: '%', min: 0, max: 50, group: 'Commission', default: config.plans.proFeePercent, label: 'Commission sur les campagnes des marques Pro', description: 'Identique à la commission standard par défaut : l\'abonnement Pro ajoute des fonctionnalités, pas une remise. Figée à la création de la campagne.' },
  repeatDiscountPercent: { key: 'repeatDiscountPercent', type: 'number', unit: '%', min: 0, max: 50, group: 'Commission', default: 3, label: 'Remise fidélité sur une reconduction', description: 'Quand une marque reconduit une mission avec le même créateur (« Reconduire avec ce créateur »), cette remise est déduite du prix payé par la marque et financée par NeedCreator sur sa commission : le créateur touche la même chose. Plafonnée à la commission de la campagne.' },
  externalQuoteFeePercent: { key: 'externalQuoteFeePercent', type: 'number', unit: '%', min: 0, max: 50, group: 'Commission', default: config.stripe.platformFeePercent, label: 'Commission sur les missions extérieures payées via NeedCreator', description: 'Devis établis par un créateur pour un client hors plateforme, acceptés et payés via NeedCreator. Par défaut égale à la commission standard ; la réduction Ambassadeur s\'applique en plus si elle est plus basse. Aucune commission quand le client paie en direct.' },
  ambassadorFeePercent: { key: 'ambassadorFeePercent', type: 'number', unit: '%', min: 0, max: 100, group: 'Commission', default: 8, label: 'Commission réduite pour les créateurs Ambassadeurs', description: 'Commission NeedCreator retenue sur les missions d\'un créateur Ambassadeur, à la place de la commission standard (appliquée si elle est plus basse). Fixée à la sélection du créateur, affichée sur le site.' },
  reviewPublishDays: { key: 'reviewPublishDays', type: 'number', unit: 'jours', min: 1, max: 60, group: 'Avis', default: 14, label: 'Avis : délai de publication automatique', description: 'Les avis sont cachés jusqu\'à ce que les deux parties aient noté (double aveugle). Sans avis de l\'autre partie au bout de ce délai, l\'avis est publié seul.' },
  maxLateWithdrawals: { key: 'maxLateWithdrawals', type: 'number', unit: 'retraits', min: 0, max: 20, group: 'Révisions et refus', default: 3, label: 'Créateur : missions retirées pour retard avant blocage des candidatures', description: 'Au-delà de ce nombre de missions retirées pour retard (garantie de remplacement ou refus automatique), le créateur ne peut plus envoyer de devis tant que l\'admin n\'a pas remis son compteur à zéro (fiche utilisateur). 0 = jamais bloqué.' },
  disputeCreatorSharePercent: { key: 'disputeCreatorSharePercent', type: 'number', unit: '%', min: 0, max: 100, group: 'Révisions et refus', default: 50, label: 'Litige : part du prix proposée au créateur en cas de partage', description: 'Valeur proposée par défaut à l\'admin qui tranche un litige avec l\'issue « partage » (le reste est remboursé à la marque). Modifiable au cas par cas.' },
  autoRejectAfterRevisionDays: { key: 'autoRejectAfterRevisionDays', type: 'number', unit: 'jours', min: 0, max: 90, group: 'Révisions et refus', default: 0, label: 'Refus définitif automatique : silence du créateur après une demande de révision', description: 'Si le créateur n\'a envoyé aucune nouvelle version ce nombre de jours après la demande de révision, la mission est refusée définitivement : montant bloqué libéré ou remboursé à la marque, place libérée sur la campagne, les deux parties prévenues. 0 = désactivé (la mission reste ouverte). Conseil : au moins le double du délai de relance ci-dessus.' },
  acquisitionEnabled: { key: 'acquisitionEnabled', type: 'boolean', group: 'Prospection', default: false, label: 'Agents de prospection : recherche nocturne activée', description: 'Chaque nuit, les agents cherchent de nouveaux créateurs (YouTube) et marques (bibliothèque publicitaire Meta) avec les mots-clés ci-dessous, trouvent leur email et les qualifient avec l\'IA. Résultats dans Admin → Prospection. Clés YOUTUBE_API_KEY et META_ACCESS_TOKEN requises.' },
  acquisitionDailyLimit: { key: 'acquisitionDailyLimit', type: 'number', unit: 'prospects', min: 5, max: 500, group: 'Prospection', default: 60, label: 'Nouveaux prospects par nuit (maximum)', description: 'Plafond de nouveaux prospects qualifiés par exécution, toutes sources confondues. Chaque qualification coûte un appel à l\'IA.' },
  acquisitionMinSubscribers: { key: 'acquisitionMinSubscribers', type: 'number', unit: 'abonnés', min: 0, max: 1000000, group: 'Prospection', default: 0, label: 'Créateurs YouTube : abonnés minimum', description: 'En dessous, la chaîne est ignorée. Laissez 0 : les créateurs UGC utilisent YouTube comme portfolio et ont souvent moins de 100 abonnés ; l\'IA juge sur la description.' },
  acquisitionMaxSubscribers: { key: 'acquisitionMaxSubscribers', type: 'number', unit: 'abonnés', min: 100, max: 10000000, group: 'Prospection', default: 300000, label: 'Créateurs YouTube : abonnés maximum', description: 'Au-dessus, la chaîne est ignorée (créateurs trop établis pour l\'UGC).' },
  acquisitionCreatorKeywords: { key: 'acquisitionCreatorKeywords', type: 'text', group: 'Prospection', default: '', label: 'Mots-clés créateurs (une ligne par niche : « niche: mot ; mot »)', description: 'Niches : beauty, fashion, tech, food, travel, fitness, gaming, lifestyle, parenting, pets, home, business, education, health. Vide = liste par défaut. Une recherche YouTube par mot-clé et par nuit (100 unités de quota chacune).' },
  acquisitionBrandKeywords: { key: 'acquisitionBrandKeywords', type: 'text', group: 'Prospection', default: '', label: 'Mots-clés marques (une ligne par secteur : « secteur: mot ; mot »)', description: 'Recherche dans la bibliothèque publicitaire Meta des annonces actives en France contenant ces mots. Vide = liste par défaut.' },
  metaAccessToken: { key: 'metaAccessToken', type: 'text', group: 'Prospection', default: '', label: 'Jeton Meta (bibliothèque publicitaire et Instagram), renouvelable ici', description: 'Jeton d\'accès prolongé (60 jours) avec les autorisations ads_read, pages_show_list, instagram_basic. Vide = valeur META_ACCESS_TOKEN du serveur. Rappel dans le tableau de bord admin 10 jours avant expiration.' },
  metaPageId: { key: 'metaPageId', type: 'text', group: 'Prospection', default: '', label: 'ID de la page Facebook reliée au compte Instagram NeedCreator', description: 'Facultatif. Chiffres visibles dans la page Facebook → À propos → Transparence de la page (ou dans son adresse). Sert à la recherche Instagram par hashtags quand Meta n\'inclut pas la page dans la liste « mes pages » du jeton.' },
  mailingAutoSend: { key: 'mailingAutoSend', type: 'boolean', group: 'Prospection', default: false, label: 'Envoi automatique vers l\'outil de mailing', description: 'Chaque nuit, les prospects qualifiés avec email (score minimum ci-dessous) sont poussés dans les listes « NeedCreator · Prospection créateurs » et « … marques » de l\'outil de mailing (MAILING_PROVIDER). Vos séquences rattachées à ces listes font le reste. Les prospects « À contacter » sont poussés quel que soit leur score.' },
  mailingDailyLimit: { key: 'mailingDailyLimit', type: 'number', unit: 'contacts', min: 1, max: 1000, group: 'Prospection', default: 50, label: 'Contacts poussés par nuit (maximum)', description: 'Plafond quotidien, créateurs et marques confondus. Montez progressivement : 50 la première semaine, puis 100, puis 200.' },
  mailingMinScore: { key: 'mailingMinScore', type: 'number', unit: '/100', min: 0, max: 100, group: 'Prospection', default: 60, label: 'Score IA minimum pour l\'envoi automatique', description: 'En dessous, le prospect reste « Qualifié » en attente de votre validation (statut « À contacter »).' },
  mailingPauseBounceRate: { key: 'mailingPauseBounceRate', type: 'number', unit: '%', min: 0, max: 50, group: 'Prospection', default: 5, label: 'Pause automatique si le taux de rebond dépasse', description: 'Calculé sur les 7 derniers jours d\'après les statistiques de l\'outil de mailing. 0 = jamais de pause automatique. La pause désactive « Envoi automatique » et vous êtes prévenu par email.' },
  mailingAutoReplyInterested: { key: 'mailingAutoReplyInterested', type: 'boolean', group: 'Prospection', default: false, label: 'Répondre automatiquement aux prospects intéressés', description: 'Quand une réponse est classée « intéressé » par l\'IA, la réponse proposée (avec le lien d\'inscription) part automatiquement depuis l\'outil de mailing. Désactivé : la réponse attend votre clic dans Admin → Prospection. Les questions et les refus attendent toujours un humain.' },
  acquisitionInstagramHashtags: { key: 'acquisitionInstagramHashtags', type: 'text', group: 'Prospection', default: '', label: 'Hashtags Instagram (créateurs), séparés par des points-virgules', description: 'Publications récentes de ces hashtags via l\'API officielle Instagram (compte professionnel relié à une page Facebook du jeton Meta ; 30 hashtags uniques par période de 7 jours, liste bornée à 25). L\'auteur n\'est pas fourni par l\'API : la légende sert à trouver l\'email et à qualifier ; le pseudo est complété quand Meta a approuvé « oEmbed Read ». Vide = ugcfrance ; ugccreatorfrance ; creatriceugc ; createurugc ; ugccreator.' },
};

/**
 * Valide une valeur selon la définition (booléen ou nombre borné)
 */
export function coerceSettingValue(def, value) {
  if (def.type === 'boolean') return !!value;
  if (def.type === 'text') { const t = String(value ?? '').trim(); if (t.length > 300) throw new Error('300 caractères maximum'); return t; }
  if (def.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('Valeur numérique attendue');
    if (def.min !== undefined && n < def.min) throw new Error(`Minimum : ${def.min}`);
    if (def.max !== undefined && n > def.max) throw new Error(`Maximum : ${def.max}`);
    return Math.round(n);
  }
  return value;
}

/** Raccourci : nombre de révisions maximum (réglage admin, repli sur la valeur par défaut) */
export async function getMaxRevisions() {
  return getSetting(SETTINGS.maxRevisions.key, SETTINGS.maxRevisions.default);
}

/** Commissions en vigueur (réglages admin, repli sur le .env) */
export async function getFeePercents() {
  const [standard, pro, ambassador] = await Promise.all([
    getSetting(SETTINGS.platformFeePercent.key, SETTINGS.platformFeePercent.default),
    getSetting(SETTINGS.proFeePercent.key, SETTINGS.proFeePercent.default),
    getSetting(SETTINGS.ambassadorFeePercent.key, SETTINGS.ambassadorFeePercent.default),
  ]);
  return { standard, pro, ambassador };
}

export default Setting;
