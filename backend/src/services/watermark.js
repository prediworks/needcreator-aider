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

/** Génère et enregistre l'aperçu filigrané d'une vidéo de portfolio */
export async function watermarkPortfolioVideo(userId, videoUrl) {
  const key = keyFromUrl(videoUrl);
  if (!key) return null;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncwm-'));
  try {
    const input = path.join(workDir, 'input' + (path.extname(key) || '.mp4'));
    fs.writeFileSync(input, await downloadFile(key));
    const out = await watermarkVideoBuffer(input, workDir);
    const base = path.basename(key, path.extname(key));
    const { url } = await uploadFile(fs.readFileSync(out), `wm-${base}.mp4`, 'video/mp4', `videos/${userId}/previews`);
    const r = await User.updateOne({ _id: userId, 'profile.portfolio.videoUrl': videoUrl }, { $set: { 'profile.portfolio.$.previewUrl': url, 'profile.portfolio.$.watermarkedAt': new Date(), 'profile.portfolio.$.watermarkError': null } });
    logger.info(`Watermarked portfolio video for ${userId}: ${key} (matched ${r.matchedCount}, modified ${r.modifiedCount})`);
    return url;
  } catch (err) {
    const raw = [err?.message, err?.stderr].filter(Boolean).join(' | ') || String(err);
    const msg = raw.replace(/\s+/g, ' ').trim().slice(-400) || 'erreur inconnue';
    const r = await User.updateOne({ _id: userId, 'profile.portfolio.videoUrl': videoUrl }, { $set: { 'profile.portfolio.$.watermarkError': msg, 'profile.portfolio.$.watermarkedAt': new Date() } }).catch((e) => ({ error: e.message }));
    logger.warn(`Watermark failed for ${userId} ${key}: ${msg} (matched ${r?.matchedCount ?? r?.error})`);
    return null;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Tâche planifiée : filigrane les vidéos de portfolio qui n'en ont pas encore (anciennes ou après erreur transitoire) */
export async function watermarkBacklog(limit = 3) {
  const users = await User.find({ role: 'creator', 'profile.portfolio': { $elemMatch: { previewUrl: null, watermarkedAt: null } } }).select('profile.portfolio').limit(limit).lean();
  let n = 0;
  for (const u of users) {
    for (const v of u.profile.portfolio || []) {
      if (v.previewUrl || v.watermarkedAt) continue;
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
    o.protected = !owner && !!o.previewUrl;
    delete o.previewUrl; delete o.watermarkError;
    return o;
  });
}
