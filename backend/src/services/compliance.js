import fs from 'fs';
import os from 'os';
import path from 'path';
import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { downloadFile, keyFromUrl } from './storage.js';
import { probe, transcribeToSrt, transcriptionAvailable } from './video.js';
import logger from '../utils/logger.js';

/**
 * Score de conformité : vérifie automatiquement les points objectifs du brief sur les vidéos livrées
 * (nombre, durée, orientation, résolution, son, mention du produit / de la marque dans la transcription).
 * Aide la marque à valider vite ; ne remplace pas son jugement.
 */

const VERTICAL_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook'];
const STOP = new Set(['les', 'des', 'une', 'pour', 'avec', 'dans', 'sur', 'par', 'the', 'and', 'notre', 'votre', 'vos', 'nos', 'est', 'sont', 'qui', 'que', 'pas', 'plus', 'sans']);

function keywordsFor(campaign, brand) {
  const words = new Set();
  const add = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).forEach(w => words.add(w));
  add(brand?.profile?.companyName);
  add(campaign.gifting?.productName);
  (campaign.brief?.mentions || []).forEach(add);
  (campaign.brief?.hashtags || []).forEach(add);
  // Premiers mots significatifs de la description produit (nom du produit en général)
  String(campaign.brief?.productDescription || '').split(/[.\n]/)[0].split(/\s+/).slice(0, 6).forEach(add);
  return [...words].slice(0, 12);
}

function scoreOf(items) {
  const scored = items.filter(i => i.status !== 'skip');
  if (!scored.length) return null;
  const pts = scored.reduce((a, i) => a + (i.status === 'ok' ? 1 : i.status === 'warn' ? 0.5 : 0), 0);
  return Math.round((pts / scored.length) * 100);
}

export async function runComplianceCheck(deliveryId) {
  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) return;
  const campaign = await Campaign.findById(delivery.campaignId).select('brief gifting title');
  const brand = await User.findById(delivery.brandId).select('profile.companyName');
  const items = [];
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nccheck-'));
  let transcriptAll = '';
  try {
    const expected = campaign?.brief?.deliverables || 1;
    const videos = (delivery.files || []).filter(f => !f.superseded && f.type === 'video');
    const links = (delivery.links || []).filter(l => !l.superseded);
    const total = videos.length + links.length;
    items.push({ key: 'count', label: 'Nombre de vidéos', status: total === expected ? 'ok' : total > expected ? 'fail' : 'warn', detail: `${total} livrée(s) pour ${expected} attendue(s)${links.length ? ` (dont ${links.length} lien(s))` : ''}` });

    const target = campaign?.brief?.duration || 30;
    const wantsVertical = (campaign?.brief?.platforms || []).some(p => VERTICAL_PLATFORMS.includes(p));
    const keywords = keywordsFor(campaign, brand);
    const canTranscribe = transcriptionAvailable();

    for (const v of videos) {
      const key = keyFromUrl(v.url);
      const name = v.filename || key;
      if (!key) { items.push({ key: 'file', label: 'Fichier', status: 'skip', detail: 'Fichier hors stockage, non analysé', file: name }); continue; }
      const input = path.join(workDir, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(key) || '.mp4'}`);
      let info;
      try {
        fs.writeFileSync(input, await downloadFile(key));
        info = await probe(input);
      } catch (err) {
        items.push({ key: 'file', label: 'Lecture du fichier', status: 'fail', detail: `Fichier illisible (${err.message.split('\n')[0]})`, file: name });
        continue;
      }
      // Durée
      const d = info.duration || 0;
      const ratio = d / target;
      items.push({ key: 'duration', label: 'Durée', status: ratio >= 0.7 && ratio <= 1.3 ? 'ok' : ratio >= 0.4 && ratio <= 1.8 ? 'warn' : 'fail', detail: `${Math.round(d)} s (brief : ${target} s)`, file: name });
      // Orientation
      if (info.width && info.height) {
        const vertical = info.height > info.width;
        items.push({ key: 'orientation', label: 'Format', status: !wantsVertical ? 'skip' : vertical ? 'ok' : 'warn', detail: `${info.width}×${info.height} ${vertical ? 'vertical' : 'horizontal'}${wantsVertical ? ' (vertical attendu pour TikTok / Reels)' : ''}`, file: name });
        const short = Math.min(info.width, info.height);
        items.push({ key: 'resolution', label: 'Résolution', status: short >= 720 ? 'ok' : short >= 540 ? 'warn' : 'fail', detail: short >= 1080 ? 'Full HD ou plus' : short >= 720 ? 'HD' : `${short}p, insuffisant pour la diffusion`, file: name });
      }
      // Son
      items.push({ key: 'audio', label: 'Son', status: info.hasAudio ? 'ok' : 'fail', detail: info.hasAudio ? 'Piste audio présente' : 'Aucune piste audio', file: name });
      // Transcription et mentions
      if (canTranscribe && keywords.length) {
        try {
          const t = await transcribeToSrt(input, workDir);
          const text = (t?.text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
          transcriptAll += (transcriptAll ? '\n\n' : '') + `[${name}] ${t?.text || ''}`;
          const found = keywords.filter(k => text.includes(k));
          items.push({ key: 'mentions', label: 'Mention du produit / de la marque', status: found.length ? 'ok' : 'warn', detail: found.length ? `Mots entendus : ${found.join(', ')}` : `Aucun des mots-clés (${keywords.slice(0, 5).join(', ')}) n'a été entendu`, file: name });
        } catch (err) {
          items.push({ key: 'mentions', label: 'Mention du produit / de la marque', status: 'skip', detail: `Transcription indisponible (${err.message.split('\n')[0]})`, file: name });
        }
      } else if (videos.length) {
        items.push({ key: 'mentions', label: 'Mention du produit / de la marque', status: 'skip', detail: canTranscribe ? 'Aucun mot-clé dans le brief' : 'Transcription non configurée (clé OpenAI)', file: name });
      }
    }
    if (!videos.length && links.length) {
      items.push({ key: 'links', label: 'Livraison par lien', status: 'skip', detail: 'Les vidéos publiées en ligne ne sont pas analysées automatiquement' });
    }

    const score = scoreOf(items);
    const fails = items.filter(i => i.status === 'fail').length;
    const warns = items.filter(i => i.status === 'warn').length;
    delivery.compliance = {
      status: 'done', checkedAt: new Date(), score, items, transcript: transcriptAll.slice(0, 20000) || undefined,
      summary: score === null ? 'Aucun point vérifiable automatiquement' : fails ? `${fails} point(s) non conforme(s), ${warns} à vérifier` : warns ? `${warns} point(s) à vérifier` : 'Tous les points vérifiés sont conformes',
    };
    await delivery.save();
    logger.info(`Conformité calculée pour ${deliveryId} : ${score ?? 'n/a'} (${items.length} points)`);
  } catch (err) {
    logger.error(`Compliance check failed for ${deliveryId}:`, err);
    delivery.compliance = { status: 'unavailable', checkedAt: new Date(), items, summary: `Analyse impossible : ${err.message}` };
    await delivery.save().catch(() => {});
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
