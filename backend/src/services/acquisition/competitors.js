import { z } from 'zod';
import Lead from '../../models/Lead.js';
import { generateJsonText, aiConfig } from '../ai.js';
import { metaConfigured } from './meta.js';
import logger from '../../utils/logger.js';

/**
 * Concurrent montré dans l'email 1 : l'IA cite deux ou trois concurrents à la qualification (ou ici, pour les fiches plus anciennes), le premier
 * trouvé dans la bibliothèque publicitaire Meta avec au moins trois publicités actives est retenu, et son scan est préparé à l'avance.
 * Sans concurrent vérifié, l'email garde une phrase générique : jamais de variable vide.
 */
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const schema = z.object({ competitors: z.array(z.string().max(60)).max(3) });

export async function suggestCompetitors(lead) {
  if (!aiConfig().configured) return [];
  const prompt = `Marque française : « ${lead.name} »${lead.website ? ` (${lead.website})` : ''}. Secteur : ${lead.niche || 'inconnu'}. Ce qu'elle vend : ${lead.aiSummary || String(lead.description || '').slice(0, 400) || 'inconnu'}.
Cite deux ou trois marques concurrentes directes, qui vendent le même type de produit en France et font de la publicité sur Facebook et Instagram, de taille comparable ou un peu plus grandes. Le nom exact de la marque tel qu'il apparaît sur sa page. Jamais la marque elle-même, jamais un distributeur (Sephora, Amazon, Carrefour). Liste vide si tu n'es pas sûr.
Réponds uniquement en JSON : {"competitors": ["…", "…"]}`;
  const r = await generateJsonText({ system: 'Tu connais le marché français des marques grand public. Tu réponds en JSON.', prompt, schema, normalize: (o) => ({ competitors: (Array.isArray(o?.competitors) ? o.competitors : []).map(c => String(c).replace(/[«»"“”]/g, '').trim().slice(0, 60)).filter(Boolean).slice(0, 3) }) });
  return r.competitors;
}

/** Premier concurrent trouvé chez Meta (nom identique ou qui commence pareil, trois publicités actives au moins, autre page que la marque) */
export async function resolveCompetitor(lead) {
  if (lead.kind !== 'brand' || !(await metaConfigured())) return null;
  let names = (lead.competitors || []).filter(Boolean);
  if (!names.length) { names = await suggestCompetitors(lead).catch(err => { logger.warn(`suggestCompetitors ${lead._id}: ${err.message}`); return []; }); lead.competitors = names; }
  const { findPages, isBlockedPage, scanSettings } = await import('../adScan.js');
  const st = await scanSettings();
  let found = null;
  for (const name of names.slice(0, 3)) {
    const n = norm(name);
    if (!n || n === norm(lead.name)) continue;
    const pages = await findPages(name).catch(err => { logger.warn(`resolveCompetitor ${name}: ${err.message}`); return []; });
    const hit = pages.find(p => norm(p.pageName) === n) || pages.find(p => norm(p.pageName).startsWith(n));
    if (!hit || hit.ads < 3 || String(hit.pageId) === String(lead.externalId) || norm(hit.pageName) === norm(lead.name) || isBlockedPage(st.scanBlockedPages, hit)) continue;
    found = { name, pageId: String(hit.pageId), pageName: hit.pageName, ads: hit.ads };
    break;
  }
  lead.competitor = { ...(found || {}), checkedAt: new Date() };
  return found;
}

/**
 * Avant l'envoi au mailing : concurrent vérifié et scan préparé pour chaque marque, dans la limite de temps donnée (la recherche Meta prend
 * quelques secondes par nom) ; les fiches non traitées partent avec la phrase générique. Modifie les objets reçus et enregistre en base.
 */
export async function prepareCompetitors(leads, { budgetMs = 60000, concurrency = 4 } = {}) {
  const { ensureScanForPage } = await import('../adScan.js');
  const until = Date.now() + budgetMs;
  const queue = leads.filter(l => l.kind === 'brand');
  let ready = 0;
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) {
      try {
        if (!l.competitor?.checkedAt) { if (Date.now() > until) continue; await resolveCompetitor(l); }
        if (l.competitor?.pageId) {
          const scan = await ensureScanForPage({ pageId: l.competitor.pageId, pageName: l.competitor.pageName });
          l.competitor.slug = scan?.slug || undefined;
          if (scan) ready++;
        }
        await Lead.updateOne({ _id: l._id }, { $set: { competitors: l.competitors || [], competitor: l.competitor } });
      } catch (err) { logger.warn(`prepareCompetitors ${l._id}: ${err.message}`); }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ready };
}
