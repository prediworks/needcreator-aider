import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { transcriptionConfig, transcribeToSrt } from '../src/services/video.js';

/**
 * Vérifie la transcription (TRANSCRIPTION_*) : `npm run check:transcription [-- chemin/video.mp4]`
 * Sans fichier, génère une vidéo de 3 s avec une voix synthétique (ffmpeg) : la transcription doit renvoyer un texte non vide.
 */
const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const run = promisify(execFile);

const cfg = transcriptionConfig();
if (!cfg) { console.log('❌ Aucune configuration : renseignez TRANSCRIPTION_PROVIDER + TRANSCRIPTION_API_KEY (ou GROQ_API_KEY / OPENAI_API_KEY / MISTRAL_API_KEY)'); process.exit(1); }
if (cfg.error) { console.log(`❌ ${cfg.error}`); process.exit(1); }
if (cfg.missing) { console.log(`❌ Variable manquante : ${cfg.missing}`); process.exit(1); }
console.log(`Fournisseur : ${cfg.provider} · modèle : ${cfg.model} · URL : ${cfg.baseURL}`);

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-transcription-'));
let input = process.argv[2];
if (!input) {
  // Vidéo de test : mire + tonalité (pas de parole) → on vérifie surtout que l'API répond correctement
  input = path.join(workDir, 'sample.mp4');
  await run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input]);
  console.log('Vidéo de test générée (3 s, sans parole) : l\'API doit répondre sans erreur, le texte peut être vide.');
}
const t0 = Date.now();
try {
  const r = await transcribeToSrt(input, workDir);
  console.log(`✅ Réponse en ${((Date.now() - t0) / 1000).toFixed(1)} s · langue : ${r?.language || '?'} · segments : ${fs.readFileSync(r.srtFile, 'utf8').split('\n\n').filter(Boolean).length}`);
  console.log(`Texte : ${JSON.stringify((r?.text || '').slice(0, 300))}`);
} catch (e) {
  console.log(`❌ ${e.message}`);
  process.exit(1);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
