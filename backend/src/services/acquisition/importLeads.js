import Lead from '../../models/Lead.js';
import User from '../../models/User.js';
import ExternalCreator from '../../models/ExternalCreator.js';
import { extractEmails, pickEmail, extractSocials } from './enrich.js';
import { qualifyOne } from './index.js';
import { isSuppressed } from '../../models/LeadSuppression.js';
import logger from '../../utils/logger.js';

const URL_RE = /https?:\/\/[^\s;,|"']+/gi;
const SEP = /\s*(?:;|\t|\|)\s*/;
const HEADER_WORDS = /^(nom|name|pseudo|handle|url|lien|profil|email|e-mail|bio|description|site|website|niche|secteur)$/i;

/**
 * Lit une liste collée (une ligne par prospect). Colonnes libres, séparées par « ; », tabulation ou « | » :
 * nom ; lien du profil ; email ; bio ou description ; site. L'ordre importe peu : l'email et les liens sont reconnus où qu'ils soient,
 * le premier champ texte restant est le nom, le reste devient la description. Une ligne d'en-tête est ignorée.
 */
export function parseLeadLines(text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const cells = line.split(SEP).map(c => c.trim()).filter(Boolean);
    if (i === 0 && cells.length > 1 && cells.every(c => HEADER_WORDS.test(c))) continue;
    const urls = [...line.matchAll(URL_RE)].map(m => m[0].replace(/[.,)]+$/, ''));
    const email = pickEmail(extractEmails(line));
    const socials = extractSocials(line);
    const profile = socials.instagram || socials.tiktok || socials.youtube || socials.linkedin || socials.facebook || null;
    const website = urls.find(u => !/instagram\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com/i.test(u)) || null;
    // Texte restant une fois les liens et emails retirés (un même champ peut mêler nom, bio et email)
    const texts = cells.map(c => c.replace(URL_RE, ' ').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/\b(contact|mail|email|e-mail)\s*[:：]?\s*$/i, '').replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').replace(/^@/, '')).filter(Boolean);
    // « Paul, vidéos food » : le nom s'arrête à la première virgule, la suite rejoint la description
    let name = (texts[0] || '').split(/,\s+/)[0];
    const rest = (texts[0] || '').slice(name.length).replace(/^[\s,]+/, '');
    if (rest) texts.splice(1, 0, rest);
    const handleFromUrl = profile ? (profile.match(/(?:instagram\.com\/|tiktok\.com\/@|youtube\.com\/@|linkedin\.com\/(?:company|in)\/|facebook\.com\/)([^/?]+)/i) || [])[1] : null;
    if (!name) name = handleFromUrl || (email ? email.split('@')[0] : '') || (website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '');
    if (!name) { rows.push({ line, error: 'ni nom, ni lien, ni email' }); continue; }
    rows.push({ line, name: name.slice(0, 120), handle: handleFromUrl ? `@${handleFromUrl}` : null, url: profile || website, website, email, socials, description: texts.slice(1).join(' · ').slice(0, 2000) });
  }
  return rows;
}

/** Enregistre les lignes valides comme prospects « manuel » (source importée), dédoublonnés ; qualification IA en arrière-plan */
export async function importLeads({ kind, text, niche, origin }) {
  const rows = parseLeadLines(text);
  const result = { total: rows.length, created: 0, duplicates: 0, invalid: 0, known: 0, suppressed: 0, ids: [], errors: [] };
  for (const r of rows) {
    if (r.error) { result.invalid++; result.errors.push(`${r.line.slice(0, 60)} : ${r.error}`); continue; }
    const externalId = String(r.url || r.email || r.name).trim().toLowerCase();
    const dup = await Lead.findOne({ $or: [{ externalId }, ...(r.email ? [{ email: r.email }] : []), ...(r.url ? [{ url: r.url }] : [])] }).select('_id').lean();
    if (dup) { result.duplicates++; continue; }
    if (await isSuppressed({ email: r.email, url: r.url, socials: r.socials })) { result.suppressed = (result.suppressed || 0) + 1; continue; }
    let known = null;
    if (r.email) {
      const u = await User.findOne({ email: r.email }).select('_id').lean();
      if (u) known = { registeredUserId: u._id, status: 'registered' };
      else { const ec = await ExternalCreator.findOne({ email: r.email }).select('_id').lean(); if (ec) known = { externalCreatorId: ec._id, status: 'excluded', notes: 'Déjà dans l\'annuaire des créateurs référencés' }; }
    }
    if (known) result.known++;
    const lead = await Lead.create({ kind, source: 'manual', externalId, name: r.name, handle: r.handle, url: r.url, website: r.website, country: 'FR', description: r.description, email: r.email || null, emailSource: r.email ? 'import' : null, keyword: origin ? `import:${origin}`.slice(0, 60) : 'import', niche: niche || undefined, socials: r.socials, status: 'new', ...known });
    result.created++; result.ids.push(lead._id);
  }
  // Qualification IA à la suite, sans bloquer la réponse
  const toQualify = result.ids.slice();
  if (toQualify.length) setImmediate(async () => {
    for (const id of toQualify) {
      const lead = await Lead.findById(id);
      if (lead && lead.status === 'new') await qualifyOne(lead, []).catch(err => logger.warn(`import qualify ${id}: ${err.message}`));
    }
    logger.info(`Import : ${toQualify.length} prospect(s) qualifié(s)`);
  });
  logger.info(`Import prospects (${kind}) : ${result.created} créés, ${result.duplicates} doublons, ${result.invalid} invalides sur ${result.total}`);
  return result;
}
