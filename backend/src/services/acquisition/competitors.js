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
 * « Concurrent » saisi à la main sur la fiche : un nom de page, ou un lien de la bibliothèque publicitaire (view_all_page_id=…). La page doit
 * avoir au moins une publicité active en France ; elle remplace celle de l'IA et n'est plus jamais recalculée. Nom vide : retour au calcul auto.
 */
export async function setManualCompetitor(lead, input) {
  const v = String(input || '').trim();
  if (!v) { lead.competitors = []; lead.competitor = undefined; return null; }
  if (!(await metaConfigured())) throw Object.assign(new Error('Bibliothèque publicitaire Meta non configurée sur le serveur'), { status: 503 });
  const { findPages, ensureScanForPage } = await import('../adScan.js');
  const id = (v.match(/view_all_page_id=(\d+)/) || v.match(/^(\d{6,})$/) || [])[1];
  let hit = null;
  if (id) {
    const scan = await ensureScanForPage({ pageId: id, pageName: '' }, { origin: 'auto_competitor' });
    if (scan?.totalActive) hit = { pageId: id, pageName: scan.pageName, ads: scan.totalActive };
  } else {
    const n = norm(v);
    const pages = (await findPages(v)).filter(p => p.match !== false && p.ads > 0);
    hit = pages.find(p => norm(p.pageName) === n) || pages.find(p => norm(p.pageName).startsWith(n)) || pages[0] || null;
  }
  if (!hit) throw Object.assign(new Error(`Aucune page avec des publicités actives en France pour « ${v.slice(0, 60)} ». Essayez le nom exact de sa page Facebook, ou collez le lien de ses publicités dans la bibliothèque Meta.`), { status: 404 });
  if (String(hit.pageId) === String(lead.externalId) || norm(hit.pageName) === norm(lead.name)) throw Object.assign(new Error('C\'est la page de la marque elle-même : indiquez un concurrent'), { status: 400 });
  const scan = await ensureScanForPage({ pageId: hit.pageId, pageName: hit.pageName });
  const starts = (scan?.ads || []).map(a => a.startedAt).filter(Boolean).map(d => new Date(d).getTime());
  lead.competitors = [hit.pageName];
  lead.competitor = { name: v.slice(0, 80), pageId: String(hit.pageId), pageName: scan?.pageName || hit.pageName, slug: scan?.slug || undefined, ads: scan?.totalActive || hit.ads, oldestAt: starts.length ? new Date(Math.min(...starts)) : undefined, checkedAt: new Date(), manual: true };
  return lead.competitor;
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
          const starts = (scan?.ads || []).map(a => a.startedAt).filter(Boolean).map(d => new Date(d).getTime());
          if (starts.length) l.competitor.oldestAt = new Date(Math.min(...starts));
          if (scan) ready++;
        }
        await Lead.updateOne({ _id: l._id }, { $set: { competitors: l.competitors || [], competitor: l.competitor } });
      } catch (err) { logger.warn(`prepareCompetitors ${l._id}: ${err.message}`); }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ready };
}

/** Fiches dont le concurrent est vérifié mais sans date de plus ancienne publicité (préparées avant le 14/10/2026) : complétée depuis le scan déjà en base, sans appel à Meta */
export async function fillCompetitorAge(leads) {
  const todo = leads.filter(l => l.kind === 'brand' && l.competitor?.slug && !l.competitor.oldestAt);
  if (!todo.length) return;
  const { default: AdScan } = await import('../../models/AdScan.js');
  const scans = await AdScan.find({ slug: { $in: [...new Set(todo.map(l => l.competitor.slug))] } }).select('slug ads.startedAt').lean();
  const oldest = new Map(scans.map(sc => { const t = (sc.ads || []).map(a => a.startedAt).filter(Boolean).map(d => new Date(d).getTime()); return [sc.slug, t.length ? new Date(Math.min(...t)) : null]; }));
  for (const l of todo) {
    const at = oldest.get(l.competitor.slug);
    if (!at) continue;
    l.competitor.oldestAt = at;
    await Lead.updateOne({ _id: l._id }, { $set: { 'competitor.oldestAt': at } }).catch(() => {});
  }
}
