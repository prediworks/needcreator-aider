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
  businessRegistryCheck: { key: 'businessRegistryCheck', type: 'boolean', group: 'Vérifications', default: process.env.BUSINESS_REGISTRY_CHECK !== 'false', label: 'Vérification des SIRET au registre national des entreprises', description: 'Si désactivé, seul le format du SIRET / TVA est contrôlé (moins de friction, moins de sécurité).' },

  // Relances automatiques (tâches planifiées, JOBS_INTERVAL_MINUTES). 0 = désactivée. Une seule relance par élément.
  reminderQuoteNoAnswerDays: { key: 'reminderQuoteNoAnswerDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 3, label: 'Marque : devis sans réponse', description: 'Email à la marque quand des devis attendent une réponse depuis ce nombre de jours (un seul email par campagne). 0 = désactivé.' },
  reminderCreatorNoUploadDays: { key: 'reminderCreatorNoUploadDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 5, label: 'Créateur : mission sans aucune vidéo envoyée', description: 'Email au créateur sélectionné qui n\'a encore rien envoyé ce nombre de jours après la sélection (ou après la réception du produit). 0 = désactivé.' },
  reminderProductNotReceivedDays: { key: 'reminderProductNotReceivedDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 5, label: 'Créateur : produit expédié, réception non confirmée', description: 'Email au créateur ce nombre de jours après l\'expédition du produit si la réception n\'est pas confirmée. 0 = désactivé.' },
  reminderRevisionPendingDays: { key: 'reminderRevisionPendingDays', type: 'number', unit: 'jours', min: 0, max: 60, group: 'Relances automatiques', default: 3, label: 'Créateur : révision demandée sans nouvelle version', description: 'Email au créateur ce nombre de jours après une demande de révision restée sans nouvelle version. 0 = désactivé.' },

  // Révisions et refus définitif automatique
  maxRevisions: { key: 'maxRevisions', type: 'number', unit: 'révisions', min: 0, max: 10, group: 'Révisions et refus', default: config.business.maxRevisions, label: 'Nombre maximum de révisions par mission', description: 'Au-delà, la marque ne peut plus demander de révision : elle valide (ou la validation automatique s\'applique).' },
  maxLateWithdrawals: { key: 'maxLateWithdrawals', type: 'number', unit: 'retraits', min: 0, max: 20, group: 'Révisions et refus', default: 3, label: 'Créateur : missions retirées pour retard avant blocage des candidatures', description: 'Au-delà de ce nombre de missions retirées pour retard (garantie de remplacement ou refus automatique), le créateur ne peut plus envoyer de devis tant que l\'admin n\'a pas remis son compteur à zéro (fiche utilisateur). 0 = jamais bloqué.' },
  disputeCreatorSharePercent: { key: 'disputeCreatorSharePercent', type: 'number', unit: '%', min: 0, max: 100, group: 'Révisions et refus', default: 50, label: 'Litige : part du prix proposée au créateur en cas de partage', description: 'Valeur proposée par défaut à l\'admin qui tranche un litige avec l\'issue « partage » (le reste est remboursé à la marque). Modifiable au cas par cas.' },
  autoRejectAfterRevisionDays: { key: 'autoRejectAfterRevisionDays', type: 'number', unit: 'jours', min: 0, max: 90, group: 'Révisions et refus', default: 0, label: 'Refus définitif automatique : silence du créateur après une demande de révision', description: 'Si le créateur n\'a envoyé aucune nouvelle version ce nombre de jours après la demande de révision, la mission est refusée définitivement : montant bloqué libéré ou remboursé à la marque, place libérée sur la campagne, les deux parties prévenues. 0 = désactivé (la mission reste ouverte). Conseil : au moins le double du délai de relance ci-dessus.' },
};

/**
 * Valide une valeur selon la définition (booléen ou nombre borné)
 */
export function coerceSettingValue(def, value) {
  if (def.type === 'boolean') return !!value;
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

export default Setting;
