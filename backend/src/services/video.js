import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { downloadFile, uploadFile, keyFromUrl } from './storage.js';
import logger from '../utils/logger.js';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const run = promisify(execFile);

/**
 * Pack "vidéo prête à diffuser" : déclinaisons de format, vignette, sous-titres.
 * ffmpeg est embarqué (ffmpeg-static) ; la transcription passe par le fournisseur IA (OpenAI) si configuré.
 */

export const FORMATS = {
  '9:16': { w: 1080, h: 1920, label: 'Vertical 9:16 (TikTok, Reels, Shorts)' },
  '1:1': { w: 1080, h: 1080, label: 'Carré 1:1 (feed Instagram, Facebook)' },
  '16:9': { w: 1920, h: 1080, label: 'Horizontal 16:9 (YouTube, site web)' },
};

export function transcriptionAvailable() {
  return !!process.env.OPENAI_API_KEY;
}

export async function probe(file) {
  const { stdout } = await run(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const info = JSON.parse(stdout);
  const video = (info.streams || []).find(s => s.codec_type === 'video');
  const audio = (info.streams || []).find(s => s.codec_type === 'audio');
  return { width: video?.width, height: video?.height, duration: parseFloat(info.format?.duration || '0'), hasAudio: !!audio };
}

/**
 * Transcrit l'audio en segments horodatés puis génère un fichier SRT
 */
export async function transcribeToSrt(inputFile, workDir) {
  if (!transcriptionAvailable()) return null;
  const audioFile = path.join(workDir, 'audio.mp3');
  await run(ffmpegPath, ['-y', '-i', inputFile, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', audioFile]);
  const { experimental_transcribe: transcribe } = await import('ai');
  const { createOpenAI } = await import('@ai-sdk/openai');
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const result = await transcribe({ model: openai.transcription(process.env.AI_TRANSCRIPTION_MODEL || 'whisper-1'), audio: fs.readFileSync(audioFile) });
  const segments = result.segments?.length ? result.segments : [{ text: result.text, startSecond: 0, endSecond: Math.max(2, result.durationInSeconds || 5) }];
  const ts = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  const srt = segments.map((seg, i) => `${i + 1}\n${ts(seg.startSecond)} --> ${ts(seg.endSecond)}\n${String(seg.text).trim()}\n`).join('\n');
  const srtFile = path.join(workDir, 'subtitles.srt');
  fs.writeFileSync(srtFile, srt, 'utf8');
  return { srtFile, text: result.text, language: result.language };
}

/**
 * Filtre ffmpeg : mise à l'échelle + bandes (pad) pour atteindre le format cible sans déformer
 */
function scaleFilter(w, h) {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}

/**
 * Traite une vidéo livrée : retourne la liste des fichiers produits (déjà envoyés sur R2)
 * @param {string} sourceUrl URL R2 stockée en base
 * @param {{formats: string[], subtitles: boolean, thumbnail: boolean}} options
 */
export async function processVideo(sourceUrl, options, folder = 'ready-pack') {
  const key = keyFromUrl(sourceUrl);
  if (!key) throw new Error('Fichier source introuvable dans le stockage');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncpack-'));
  const outputs = [];
  try {
    const input = path.join(workDir, 'input' + (path.extname(key) || '.mp4'));
    fs.writeFileSync(input, await downloadFile(key));
    const info = await probe(input);
    logger.info(`Ready pack: source ${info.width}x${info.height}, ${info.duration}s, audio=${info.hasAudio}`);

    let subs = null;
    if (options.subtitles && info.hasAudio) {
      try {
        subs = await transcribeToSrt(input, workDir);
        if (subs) {
          const up = await uploadFile(fs.readFileSync(subs.srtFile), 'sous-titres.srt', 'text/plain', folder);
          outputs.push({ kind: 'subtitles', format: 'srt', url: up.url, filename: 'sous-titres.srt', language: subs.language });
        }
      } catch (err) {
        logger.error('Transcription failed:', err.message);
        outputs.push({ kind: 'subtitles', format: 'srt', error: err.message });
      }
    }

    if (options.thumbnail !== false) {
      const thumb = path.join(workDir, 'thumb.jpg');
      await run(ffmpegPath, ['-y', '-ss', String(Math.min(1, Math.max(0, info.duration / 3))), '-i', input, '-frames:v', '1', '-q:v', '3', thumb]);
      const up = await uploadFile(fs.readFileSync(thumb), 'vignette.jpg', 'image/jpeg', folder);
      outputs.push({ kind: 'thumbnail', format: 'jpg', url: up.url, filename: 'vignette.jpg' });
    }

    for (const fmt of options.formats || []) {
      const spec = FORMATS[fmt];
      if (!spec) continue;
      const out = path.join(workDir, `out-${fmt.replace(':', 'x')}.mp4`);
      let vf = scaleFilter(spec.w, spec.h);
      if (subs?.srtFile) vf += `,subtitles='${subs.srtFile.replace(/'/g, "\\'")}':force_style='FontSize=22,Outline=1,MarginV=60'`;
      await run(ffmpegPath, ['-y', '-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { maxBuffer: 64 * 1024 * 1024 });
      const name = `video-${fmt.replace(':', 'x')}${subs ? '-sous-titree' : ''}.mp4`;
      const up = await uploadFile(fs.readFileSync(out), name, 'video/mp4', folder);
      outputs.push({ kind: 'video', format: fmt, url: up.url, filename: name, width: spec.w, height: spec.h, subtitled: !!subs });
    }
    return { outputs, source: info };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Génère une petite vidéo de test valide (mire + bip) — utilisée par les tests
 */
export async function makeSampleVideo(seconds = 2) {
  const file = path.join(os.tmpdir(), `nc-sample-${Date.now()}.mp4`);
  await run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', `testsrc=size=640x360:rate=25:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
  return file;
}
