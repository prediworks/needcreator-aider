import mongoose from 'mongoose';

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

export const SETTINGS = {
  // Interroge le registre national des entreprises (annuaire-entreprises.data.gouv.fr) pour valider le SIRET
  businessRegistryCheck: { key: 'businessRegistryCheck', default: process.env.BUSINESS_REGISTRY_CHECK !== 'false', label: 'Vérification des SIRET au registre national des entreprises', description: 'Si désactivé, seul le format du SIRET / TVA est contrôlé (moins de friction, moins de sécurité).' },
};

export default Setting;
