import mongoose from 'mongoose';
import User from '../models/User.js';
import Campaign from '../models/Campaign.js';
import { notify } from './notifications.js';
import { sendNewCampaignNotification, sendCampaignDigest, campaignSummary } from './email.js';
import logger from '../utils/logger.js';

/**
 * Alertes « nouvelle campagne » aux créateurs : cloche immédiate, email regroupé.
 * - Ciblage : niches en commun, puis réseaux (si la campagne vise des réseaux et que le créateur a déclaré les siens, il en faut un en commun)
 *   et pays (seulement si la campagne indique des pays cibles).
 * - Pas de plafond : les créateurs sont parcourus par lots.
 * - Email : un par créateur et par vague ; s'il a plusieurs campagnes en attente, un seul email récapitulatif.
 */
const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  wave: { type: String, enum: ['ambassadors', 'all'], default: 'all' },
  sentAt: { type: Date, default: null, index: true },
}, { timestamps: true });
alertSchema.index({ userId: 1, campaignId: 1 }, { unique: true });
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });
export const CampaignAlert = mongoose.models.CampaignAlert || mongoose.model('CampaignAlert', alertSchema);

const COUNTRY_CODES = { france: 'FR', belgique: 'BE', belgium: 'BE', suisse: 'CH', switzerland: 'CH', luxembourg: 'LU', canada: 'CA', québec: 'CA', quebec: 'CA', espagne: 'ES', spain: 'ES', italie: 'IT', italy: 'IT', allemagne: 'DE', germany: 'DE', 'royaume-uni': 'GB', uk: 'GB', 'états-unis': 'US', usa: 'US', portugal: 'PT', 'pays-bas': 'NL' };
/** Pays cibles d'une campagne en codes ISO, à partir de ce que la marque a saisi (codes ou noms) ; vide = pas de filtre */
export function campaignCountries(campaign) {
  const out = new Set();
  for (const raw of campaign.matching?.targetAudience?.location || []) {
    const v = String(raw || '').trim();
    if (!v) continue;
    if (/^[A-Za-z]{2}$/.test(v)) out.add(v.toUpperCase());
    else if (COUNTRY_CODES[v.toLowerCase()]) out.add(COUNTRY_CODES[v.toLowerCase()]);
  }
  return [...out];
}

/** Le créateur correspond-il aux réseaux et pays de la campagne ? (souple : un créateur sans réseau déclaré passe) */
export function creatorMatchesCampaign(creator, campaign) {
  const platforms = (campaign.brief?.platforms || []).filter(p => !['website', 'other'].includes(p));
  const nets = (creator.profile?.socials || []).map(s => s.network).filter(Boolean);
  if (platforms.length && nets.length && !platforms.some(p => nets.includes(p))) return false;
  const countries = campaignCountries(campaign);
  if (countries.length && creator.country && !countries.includes(String(creator.country).toUpperCase())) return false;
  return true;
}

/**
 * Cible les créateurs d'une campagne, crée la notification dans l'application et met l'email en attente.
 * wave = 'ambassadors' (à la publication, avant-première) ou 'all' (les autres, après l'avant-première).
 */
export async function queueCampaignAlerts(campaign, brandName, { wave = 'all' } = {}) {
  if (campaign.visibility === 'private') return { queued: 0, userIds: [] };
  const query = { role: 'creator', status: 'active', 'preferences.emailNotifications': { $ne: false }, 'profile.niches': { $in: campaign.matching?.niches || [] } };
  if (wave === 'ambassadors') query['profile.ambassador.status'] = 'approved';
  else query['profile.ambassador.status'] = { $ne: 'approved' };
  const { short } = campaignSummary(campaign, brandName);
  const title = wave === 'ambassadors' ? `Avant-première Ambassadeur : ${campaign.title}` : `Nouvelle campagne : ${campaign.title}`;
  const userIds = [];
  const cursor = User.find(query).select('_id country profile.socials').lean().cursor({ batchSize: 200 });
  for await (const creator of cursor) {
    if (!creatorMatchesCampaign(creator, campaign)) continue;
    userIds.push(creator._id);
    await notify(creator._id, { type: 'campaign', title, text: short, href: `/campaigns/${campaign._id}` });
    await CampaignAlert.updateOne({ userId: creator._id, campaignId: campaign._id }, { $setOnInsert: { wave } }, { upsert: true }).catch(() => {});
  }
  return { queued: userIds.length, userIds };
}

/** Un Ambassadeur au moins est concerné par la campagne (mêmes règles que l'alerte) : sinon l'avant-première ne sert à rien */
export async function hasAmbassadorFor(campaign) {
  const cursor = User.find({ role: 'creator', status: 'active', 'preferences.emailNotifications': { $ne: false }, 'profile.niches': { $in: campaign.matching?.niches || [] }, 'profile.ambassador.status': 'approved' })
    .select('_id country profile.socials').lean().cursor({ batchSize: 200 });
  for await (const creator of cursor) if (creatorMatchesCampaign(creator, campaign)) return true;
  return false;
}

/**
 * Prévient tout de suite les créateurs non Ambassadeurs (fin anticipée de l'avant-première, depuis l'admin) : cloche, puis email envoyé sans attendre.
 * Une seule fois par campagne : refusé si cette vague est déjà partie, si la campagne n'est pas ouverte ou si elle est privée.
 */
export async function notifyAllCreatorsNow(campaign) {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  if (campaign.visibility === 'private') throw fail(400, 'Campagne privée : seuls les créateurs invités sont prévenus');
  if (campaign.status !== 'active') throw fail(400, 'La campagne n\'est pas ouverte aux candidatures');
  if (campaign.notifications?.allNotifiedAt) throw fail(409, 'Les créateurs ont déjà été prévenus');
  campaign.set('notifications.allNotifiedAt', new Date()); // posé avant l'envoi : la tâche planifiée ne repasse pas derrière
  await campaign.save();
  await campaign.populate('brandId', 'profile.companyName profile.name');
  const brandName = campaign.brandId?.profile?.companyName || campaign.brandId?.profile?.name || '';
  const { queued, userIds } = await queueCampaignAlerts(campaign, brandName, { wave: 'all' });
  if (userIds.length) await flushCampaignAlerts({ userIds }).catch(err => logger.error('flushCampaignAlerts:', err.message));
  return { queued };
}

/**
 * Envoie les emails en attente : un email par créateur, récapitulatif s'il a plusieurs campagnes.
 * userIds : restreindre à ces créateurs (vague immédiate) ; sinon tous les emails en attente.
 */
export async function flushCampaignAlerts({ userIds = null } = {}) {
  const filter = { sentAt: null };
  if (userIds) filter.userId = { $in: userIds };
  const pending = await CampaignAlert.find(filter).lean();
  if (!pending.length) return { emails: 0, digests: 0 };
  const byUser = new Map();
  for (const a of pending) { if (!byUser.has(String(a.userId))) byUser.set(String(a.userId), []); byUser.get(String(a.userId)).push(a); }
  const campaignIds = [...new Set(pending.map(a => String(a.campaignId)))];
  const campaigns = await Campaign.find({ _id: { $in: campaignIds }, status: 'active' }).populate('brandId', 'profile.companyName profile.name').lean();
  const byCampaign = new Map(campaigns.map(c => [String(c._id), c]));
  const users = await User.find({ _id: { $in: [...byUser.keys()] } }).select('email profile.name').lean();
  let emails = 0, digests = 0;
  for (const u of users) {
    const items = (byUser.get(String(u._id)) || []).map(a => byCampaign.get(String(a.campaignId))).filter(Boolean);
    try {
      if (items.length === 1) {
        const c = items[0]; const brandName = c.brandId?.profile?.companyName || c.brandId?.profile?.name || '';
        await sendNewCampaignNotification(u.email, u.profile?.name, c.title, c._id, c, brandName);
        emails++;
      } else if (items.length > 1) {
        await sendCampaignDigest(u.email, u.profile?.name, items.map(c => ({ campaign: c, brandName: c.brandId?.profile?.companyName || c.brandId?.profile?.name || '' })));
        emails++; digests++;
      }
    } catch (err) { logger.error(`Campaign alert email failed for ${u.email}: ${err.message}`); }
    await CampaignAlert.updateMany({ userId: u._id, sentAt: null }, { $set: { sentAt: new Date() } });
  }
  return { emails, digests };
}
