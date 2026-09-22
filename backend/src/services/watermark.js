import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import { downloadFile, uploadFile, keyFromUrl } from './storage.js';
import logger from '../utils/logger.js';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const run = promisify(execFile);
const WATERMARK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/watermark.png');

/**
 * Filigrane sur les aperçus de portfolio : les marques voient une version marquée « NeedCreator · aperçu portfolio »,
 * l'original reste intact pour le créateur (et pour les livraisons, qui sont payées). ffmpeg embarqué, aucun service externe.
 */
export async function watermarkVideoBuffer(input, workDir) {
  const out = path.join(workDir, 'wm.mp4');
  // Largeur du logo ≈ 30 % de la vidéo (calculée depuis les dimensions réelles), en bas à droite avec un retrait de 3 % ; audio copié tel quel
  const { probe } = await import('./video.js');
  const info = await probe(input);
  const wmWidth = Math.max(120, Math.round((info.width || 720) * 0.30));
  const filter = `[1:v]scale=${wmWidth}:-1[wm];[0:v][wm]overlay=x='W-w-(W*0.03)':y='H-h-(H*0.03)':format=auto,format=yuv420p[v]`;
  await run(ffmpegPath, ['-y', '-i', input, '-i', WATERMARK, '-filter_complex', filter, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'copy', '-movflags', '+faststart', out], { maxBuffer: 64 * 1024 * 1024 });
  return out;
}

/** Codec vidéo du fichier (h264, hevc, vp9…) ; null si illisible */
export async function videoCodec(file) {
  try {
    const { ffprobePath } = await import('./video.js');
    const { stdout } = await run(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', file]);
    return String(stdout).trim().split('\n')[0] || null;
  } catch { return null; }
}

/** Réencode en H.264 + AAC sans filigrane : lisible dans tous les navigateurs (les originaux iPhone sont en HEVC, image noire sous Chrome et Edge) */
export async function transcodePlayable(input, workDir) {
  const out = path.join(workDir, 'playable.mp4');
  await run(ffmpegPath, ['-y', '-i', input, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { maxBuffer: 64 * 1024 * 1024 });
  return out;
}

const MAX_ATTEMPTS = 3;

/**
 * Traite une vidéo de portfolio : aperçu filigrané pour les visiteurs, et version H.264 lisible partout quand l'original ne l'est pas
 * (HEVC, MOV…). Les échecs sont mémorisés et réessayés au plus 3 fois par la tâche planifiée.
 */
export async function watermarkPortfolioVideo(userId, videoUrl) {
  const key = keyFromUrl(videoUrl);
  if (!key) return null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncwm-'));
  const match = { _id: userId, 'profile.portfolio.videoUrl': videoUrl };
  try {
    const input = path.join(workDir, 'input' + (path.extname(key) || '.mp4'));
    fs.writeFileSync(input, await downloadFile(key));
    const codec = await videoCodec(input);
    const base = path.basename(key, path.extname(key));
    const set = { 'profile.portfolio.$.sourceCodec': codec || 'inconnu' };
    // Original non lisible dans tous les navigateurs : version H.264 sans filigrane pour le créateur et l'admin
    if (codec !== 'h264') {
      const playable = await transcodePlayable(input, workDir);
      const up = await uploadFile(fs.readFileSync(playable), `play-${base}.mp4`, 'video/mp4', `videos/${userId}/playable`);
      set['profile.portfolio.$.playableUrl'] = up.url;
    }
    const out = await watermarkVideoBuffer(input, workDir);
    const { url } = await uploadFile(fs.readFileSync(out), `wm-${base}.mp4`, 'video/mp4', `videos/${userId}/previews`);
    Object.assign(set, { 'profile.portfolio.$.previewUrl': url, 'profile.portfolio.$.watermarkedAt': new Date(), 'profile.portfolio.$.watermarkError': null });
    const r = await User.updateOne(match, { $set: set });
    logger.info(`Portfolio video processed for ${userId}: ${key} (codec ${codec}, playable ${codec !== 'h264' ? 'oui' : 'inutile'}, matched ${r.matchedCount})`);
    return url;
  } catch (err) {
    const raw = [err?.message, err?.stderr].filter(Boolean).join(' | ') || String(err);
    const msg = raw.replace(/\s+/g, ' ').trim().slice(-400) || 'erreur inconnue';
    // watermarkedAt reste vide : la tâche planifiée réessaie, jusqu'à MAX_ATTEMPTS
    const r = await User.updateOne(match, { $set: { 'profile.portfolio.$.watermarkError': msg }, $inc: { 'profile.portfolio.$.watermarkAttempts': 1 } }).catch((e) => ({ error: e.message }));
    logger.warn(`Watermark failed for ${userId} ${key}: ${msg} (matched ${r?.matchedCount ?? r?.error})`);
    return null;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Tâche planifiée : filigrane les vidéos de portfolio qui n'en ont pas encore (anciennes ou après erreur transitoire) */
export async function watermarkBacklog(limit = 3) {
  const users = await User.find({ role: 'creator', 'profile.portfolio': { $elemMatch: { previewUrl: null, watermarkedAt: null, $or: [{ kind: 'video' }, { kind: { $exists: false } }], $and: [{ $or: [{ watermarkAttempts: { $exists: false } }, { watermarkAttempts: { $lt: MAX_ATTEMPTS } }] }] } } }).select('profile.portfolio').limit(limit).lean();
  let n = 0;
  for (const u of users) {
    for (const v of u.profile.portfolio || []) {
      if (v.previewUrl || v.watermarkedAt || (v.kind && v.kind !== 'video') || (v.watermarkAttempts || 0) >= MAX_ATTEMPTS) continue;
      await watermarkPortfolioVideo(u._id, v.videoUrl);
      n++;
      if (n >= limit) return n;
    }
  }
  return n;
}

/**
 * Version « visiteur » d'un portfolio : l'aperçu filigrané remplace l'original quand il existe.
 * Le propriétaire et l'admin gardent l'original.
 */
export function portfolioForViewer(portfolio = [], { owner = false } = {}) {
  return (portfolio || []).map((v) => {
    const o = typeof v.toObject === 'function' ? v.toObject() : { ...v };
    if (!owner && o.previewUrl) o.videoUrl = o.previewUrl;
    else if (o.playableUrl) o.videoUrl = o.playableUrl; // propriétaire (ou pas encore d'aperçu) : version H.264 lisible partout plutôt que l'original HEVC
    o.protected = !owner && !!o.previewUrl;
    delete o.previewUrl; delete o.playableUrl; delete o.watermarkError; delete o.watermarkAttempts;
    return o;
  });
}

/** Version « admin » : la vidéo lisible partout (H.264), sans filigrane, avec l'état du traitement pour diagnostiquer */
export function portfolioForAdmin(portfolio = []) {
  return (portfolio || []).map((v) => {
    const o = typeof v.toObject === 'function' ? v.toObject() : { ...v };
    o.originalUrl = o.videoUrl;
    if (o.playableUrl) o.videoUrl = o.playableUrl;
    else if (o.previewUrl && o.sourceCodec && o.sourceCodec !== 'h264') o.videoUrl = o.previewUrl;
    o.processing = o.previewUrl ? 'ok' : o.watermarkError ? ((o.watermarkAttempts || 0) >= MAX_ATTEMPTS ? 'failed' : 'retry') : 'pending';
    return o;
  });
}
