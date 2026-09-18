import Lead from '../../models/Lead.js';
import User from '../../models/User.js';
import ExternalCreator from '../../models/ExternalCreator.js';
import { extractEmails, pickEmail, extractSocials, enrichLeadFromSite, findBareDomain } from './enrich.js';
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
    // Site avec ou sans « https:// » (« respire.co », « www.cabaia.fr ») : l'assistant Chrome écrit souvent le domaine seul
    const website = urls.find(u => !/instagram\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com/i.test(u)) || findBareDomain(line.replace(URL_RE, ' ')) || null;
    // Texte restant une fois les liens et emails retirés (un même champ peut mêler nom, bio et email)
    const bare = website && !urls.includes(website) ? new RegExp(`(?:www\\.)?${website.replace(/^https?:\/\/(www\.)?/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\/\\S*)?`, 'ig') : null;
    const texts = cells.map(c => (bare ? c.replace(bare, ' ') : c)).map(c => c.replace(URL_RE, ' ').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/\b(contact|mail|email|e-mail)\s*[:：]?\s*$/i, '').replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').replace(/^@/, '')).filter(Boolean);
    // Ligne qui commence par un lien (profil ou publication) : pas de colonne « nom », tout le texte est la bio et le nom sera le pseudo.
    // Sinon « Paul, vidéos food » : le nom s'arrête à la première virgule, la suite rejoint la description.
    // Un nom ressemble à « Paul » ou « Marie Dupont » ; une bio à « Créatrice UGC Paris » ou « Mode/beauté/lifestyle »
    const firstBit = (texts[0] || '').split(/,\s+/)[0];
    const looksLikeBio = firstBit.split(/\s+/).length > 4 || /[\/&+\d]/.test(firstBit) || /ugc|cr[ée]at|beaut|lifestyle|skincare|makeup|mode\b|famille|maman|bien-être|food|fitness|voyage/i.test(firstBit);
    const startsWithLink = /^https?:\/\//i.test(cells[0] || '') && !!profile && looksLikeBio;
    let name = startsWithLink ? '' : (texts[0] || '').split(/,\s+/)[0];
    if (startsWithLink) texts.unshift('');
    const rest = startsWithLink ? '' : (texts[0] || '').slice(name.length).replace(/^[\s,]+/, '');
    if (rest) texts.splice(1, 0, rest);
    const handleFromUrl = profile ? (profile.match(/(?:instagram\.com\/|tiktok\.com\/@|youtube\.com\/@|linkedin\.com\/(?:company|in)\/|facebook\.com\/)([^/?]+)/i) || [])[1] : null;
    if (!name) name = handleFromUrl || (email ? email.split('@')[0] : '') || (website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : '');
    if (!name) { rows.push({ line, error: 'ni nom, ni lien, ni email' }); continue; }
    // Lien d'une publication Instagram dans la ligne : sert à compléter la fiche « publication seule » trouvée par hashtag
    const postCode = (line.match(/instagram\.com\/(?:[^/\s]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i) || [])[1] || null;
    // « 1 416 abonnés », « 9,1 k abonnés » : audience relevée par l'assistant
    const subM = line.match(/(\d[\d\s\u00a0\u202f.,]*)(k)?\s*(?:abonn[ée]s?|followers)/i);
    const subscribers = subM ? Math.round(parseFloat(subM[1].replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')) * (subM[2] ? 1000 : 1)) || null : null;
    rows.push({ line, postCode, subscribers, name: name.slice(0, 120), handle: handleFromUrl ? `@${handleFromUrl}` : null, url: profile || website, website, email, socials, description: texts.slice(1).join(' · ').slice(0, 2000) });
  }
  return rows;
}

/** Enregistre les lignes valides comme prospects « manuel » (source importée), dédoublonnés ; qualification IA en arrière-plan */
export async function importLeads({ kind, text, niche, origin }) {
  const rows = parseLeadLines(text);
  const result = { total: rows.length, created: 0, updated: 0, twins: 0, duplicates: 0, invalid: 0, known: 0, suppressed: 0, ids: [], errors: [] };
  for (const r of rows) {
    if (r.error) { result.invalid++; result.errors.push(`${r.line.slice(0, 60)} : ${r.error}`); continue; }
    // Fiche existante trouvée par hashtag (lien de publication sans auteur) : on la complète au lieu de créer un doublon
    if (r.postCode) {
      const existing = await Lead.findOne({ source: 'instagram', url: { $regex: `/(?:p|reel|reels|tv)/${r.postCode}(?:/|$)`, $options: 'i' } });
      if (existing) {
        const handle = r.handle || (r.socials.instagram ? `@${(r.socials.instagram.match(/instagram\.com\/([^/?]+)/i) || [])[1]}` : null);
        if (handle && handle !== '@undefined') { existing.handle = handle; existing.name = handle; }
        const cur = existing.socials?.toObject?.() || existing.socials || {};
        existing.socials = { ...r.socials, ...Object.fromEntries(Object.entries(cur).filter(([, v]) => v)) , ...(r.socials.instagram ? { instagram: r.socials.instagram } : {}) };
        if (r.email && !existing.email) { existing.email = r.email; existing.emailSource = 'import'; }
        if (r.website && !existing.website) existing.website = r.website;
        if (r.subscribers != null) existing.stats = { ...(existing.stats?.toObject?.() || existing.stats || {}), subscribers: r.subscribers };
        if (r.description) existing.description = `${r.description}\n${existing.description || ''}`.slice(0, 2000);
        // Même créateur déjà présent (autre publication, second compte avec le même email) : une seule fiche reste active, pour ne pas lui écrire deux fois
        const twin = await Lead.findOne({ _id: { $ne: existing._id }, status: { $nin: ['excluded'] }, $or: [...(existing.email ? [{ email: existing.email }] : []), ...(existing.socials?.instagram ? [{ 'socials.instagram': existing.socials.instagram }] : [])] }).select('handle name').lean();
        if (twin && (existing.email || existing.socials?.instagram)) {
          existing.status = 'excluded'; existing.notes = [existing.notes, `Doublon de ${twin.handle || twin.name} (même créateur, autre publication ou second compte)`].filter(Boolean).join(' · ');
          await existing.save(); result.updated = (result.updated || 0) + 1; result.twins = (result.twins || 0) + 1;
          continue;
        }
        if (['rejected', 'qualified', 'new'].includes(existing.status)) existing.status = 'new'; // requalifié avec la bio et l'auteur
        await existing.save();
        result.updated = (result.updated || 0) + 1; result.ids.push(existing._id);
        continue;
      }
    }
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
    const lead = await Lead.create({ kind, source: 'manual', externalId, name: r.name, handle: r.handle, url: r.url, website: r.website, country: 'FR', description: r.description, email: r.email || null, emailSource: r.email ? 'import' : null, keyword: origin ? `import:${origin}`.slice(0, 60) : 'import', stats: r.subscribers != null ? { subscribers: r.subscribers } : undefined, niche: niche || undefined, socials: r.socials, status: 'new', ...known });
    result.created++; result.ids.push(lead._id);
  }
  // Qualification IA à la suite, sans bloquer la réponse
  const toQualify = result.ids.slice();
  if (toQualify.length) setImmediate(async () => {
    for (const id of toQualify) {
      const lead = await Lead.findById(id);
      if (!lead) continue;
      // Prospect importé sans email mais avec un site : l'email est cherché sur le site (contact, mentions légales) avant la qualification
      if (!lead.email) { await enrichLeadFromSite(lead).catch(() => false); lead.enrich = { ...(lead.enrich?.toObject?.() || lead.enrich || {}), emailSearchedAt: new Date(), noSite: !lead.website }; await lead.save(); } // déjà visité : la passe groupée ne le refera pas avant 30 jours
      if (lead.status === 'new') await qualifyOne(lead, []).catch(err => logger.warn(`import qualify ${id}: ${err.message}`));
    }
    logger.info(`Import : ${toQualify.length} prospect(s) qualifié(s)`);
  });
  logger.info(`Import prospects (${kind}) : ${result.created} créés, ${result.duplicates} doublons, ${result.invalid} invalides sur ${result.total}`);
  return result;
}
