import fs from 'fs';
import os from 'os';
import path from 'path';
import Campaign from '../models/Campaign.js';
import { downloadFile, uploadFile, keyFromUrl, statObject, resolveUrl } from './storage.js';
import { watermarkVideoBuffer } from './watermark.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Candidature vidéo : 45 s au plus où le créateur montre son idée pour le produit de la campagne (accroche, façon de tourner).
 * Le fichier est envoyé comme une vidéo de portfolio (/portfolio/upload-url), puis joint au devis par sa clé. La marque ne voit
 * que l'aperçu filigrané, réencodé en H.264 (lisible partout) et coupé à 45 s ; l'original n'est jamais exposé.
 */
export const MAX_APPLICATION_VIDEO_SECONDS = 45;
const MAX_ATTEMPTS = 3;

/** Vérifie la clé envoyée avec le devis : un fichier du créateur, bien arrivé ; rend le sous-document à enregistrer */
export async function applicationVideoFromKey(creatorId, key, duration) {
  if (!key) return null;
  if (!String(key).startsWith(`videos/${creatorId}/`)) throw Object.assign(new Error('Vidéo invalide'), { status: 400 });
  if (!(await statObject(key))) throw Object.assign(new Error('Vidéo introuvable : l\'envoi n\'a pas abouti, réessayez'), { status: 400 });
  return { url: `${config.storage.cloudflare.publicUrl}/${key}`, duration: Number(duration) > 0 ? Math.round(Number(duration)) : null, uploadedAt: new Date(), watermarkAttempts: 0 };
}

/** Aperçu filigrané de la candidature vidéo d'un créateur sur une campagne */
export async function processApplicationVideo(campaignId, creatorId) {
  const campaign = await Campaign.findById(campaignId).select('applications.creatorId applications.video');
  const app = campaign?.applications.find(a => String(a.creatorId) === String(creatorId));
  if (!app?.video?.url || app.video.watermarkedAt) return null;
  const key = keyFromUrl(app.video.url);
  if (!key) return null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncav-'));
  const match = { _id: campaignId, 'applications.creatorId': creatorId };
  try {
    const input = path.join(workDir, 'input' + (path.extname(key) || '.mp4'));
    fs.writeFileSync(input, await downloadFile(key));
    const out = await watermarkVideoBuffer(input, workDir, { maxSeconds: MAX_APPLICATION_VIDEO_SECONDS });
    const { url } = await uploadFile(fs.readFileSync(out), `wm-${path.basename(key, path.extname(key))}.mp4`, 'video/mp4', `videos/${creatorId}/applications`);
    await Campaign.updateOne(match, { $set: { 'applications.$.video.previewUrl': url, 'applications.$.video.watermarkedAt': new Date(), 'applications.$.video.watermarkError': null } });
    logger.info(`Application video processed: campaign ${campaignId}, creator ${creatorId}`);
    return url;
  } catch (err) {
    const msg = [err?.message, err?.stderr].filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim().slice(-300) || 'erreur inconnue';
    await Campaign.updateOne(match, { $set: { 'applications.$.video.watermarkError': msg }, $inc: { 'applications.$.video.watermarkAttempts': 1 } }).catch(() => {});
    logger.warn(`Application video failed for campaign ${campaignId}, creator ${creatorId}: ${msg}`);
    return null;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Tâche planifiée : reprend les candidatures vidéo pas encore traitées (après une erreur passagère), 3 essais au plus */
export async function applicationVideoBacklog(limit = 3) {
  const campaigns = await Campaign.find({ applications: { $elemMatch: { 'video.url': { $exists: true, $ne: null }, 'video.watermarkedAt': null, 'video.watermarkAttempts': { $lt: MAX_ATTEMPTS } } } }).select('applications.creatorId applications.video').limit(limit).lean();
  let done = 0;
  for (const c of campaigns) for (const a of c.applications) {
    if (done >= limit) return done;
    if (a.video?.url && !a.video.watermarkedAt && (a.video.watermarkAttempts || 0) < MAX_ATTEMPTS) { await processApplicationVideo(c._id, a.creatorId); done++; }
  }
  return done;
}

/** Ce que voit la marque : l'aperçu seulement, ou « en préparation » tant qu'il n'est pas prêt */
export async function applicationVideoForBrand(video) {
  if (!video?.url) return null;
  if (!video.previewUrl) return { ready: false, failed: (video.watermarkAttempts || 0) >= MAX_ATTEMPTS, duration: video.duration || null };
  return { ready: true, url: await resolveUrl(video.previewUrl), duration: video.duration ? Math.min(video.duration, MAX_APPLICATION_VIDEO_SECONDS) : null };
}
