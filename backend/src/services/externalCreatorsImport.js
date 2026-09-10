import XLSX from 'xlsx';
import ExternalCreator from '../models/ExternalCreator.js';
import logger from '../utils/logger.js';

/**
 * Import de listes de créateurs (xlsx ou csv) : colonnes Username, Name, Country, Email, Instagram, YouTube,
 * TikTok (optionnel), Followers, Posts, Likes, Niche. Rejouable : dédoublonnage par pseudo puis par email.
 */

const COUNTRY_ALIASES = {
  FRANCE: 'FR', BELGIQUE: 'BE', BELGIUM: 'BE', SUISSE: 'CH', SWITZERLAND: 'CH', LUXEMBOURG: 'LU', MONACO: 'MC',
  'UNITED STATES': 'US', USA: 'US', 'UNITED KINGDOM': 'GB', UK: 'GB', GERMANY: 'DE', ALLEMAGNE: 'DE', SPAIN: 'ES', ESPAGNE: 'ES',
  ITALY: 'IT', ITALIE: 'IT', CANADA: 'CA', NETHERLANDS: 'NL', PORTUGAL: 'PT', MAROC: 'MA', MOROCCO: 'MA', TUNISIE: 'TN', ALGERIE: 'DZ',
};
export const EUROPE = ['FR', 'BE', 'CH', 'LU', 'MC', 'DE', 'ES', 'IT', 'NL', 'PT', 'GB', 'IE', 'AT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'RO', 'HU', 'GR', 'HR', 'SK', 'SI', 'BG', 'LT', 'LV', 'EE', 'AD'];
export const SCOPES = {
  france: ['FR'],
  francophone: ['FR', 'BE', 'CH', 'LU', 'MC', 'MA', 'TN', 'DZ', 'CA'],
  europe: EUROPE,
  all: null,
};

const NICHE_MAP = {
  technology: 'tech', tech: 'tech', gaming: 'gaming', beauty: 'beauty', beaute: 'beauty', fashion: 'fashion', mode: 'fashion',
  food: 'food', cuisine: 'food', travel: 'travel', voyage: 'travel', fitness: 'fitness', sport: 'fitness', lifestyle: 'lifestyle',
  home: 'home', maison: 'home', parenting: 'parenting', famille: 'parenting', finance: 'finance', education: 'education', pets: 'pets', animaux: 'pets',
  health: 'health', sante: 'health', wellness: 'health', art: 'art', music: 'music', musique: 'music', entertainment: 'entertainment', comedy: 'entertainment', automotive: 'auto', auto: 'auto', business: 'business', diy: 'diy', photography: 'art',
};

export function normalizeCountry(raw) {
  const v = String(raw || '').trim().toUpperCase();
  if (!v) return '';
  if (COUNTRY_ALIASES[v]) return COUNTRY_ALIASES[v];
  return v.length === 2 ? v : v.slice(0, 2);
}

/** "16,903" → 16903 · "2.725.122" → 2725122 · 16.903 (xlsx ayant pris la virgule pour un séparateur décimal) → 16903 */
export function normalizeNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') {
    if (Number.isInteger(raw)) return raw;
    const [int, dec = ''] = String(raw).split('.');
    return dec.length === 3 ? parseInt(int + dec, 10) : Math.round(raw * 1000);
  }
  const s = String(raw).trim();
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return parseInt(digitsOnly, 10);
  if (/^\d+[.,]\d{1,2}$/.test(s)) return parseInt(s.replace(/[.,]/, '').padEnd(s.replace(/[.,]/, '').length + (3 - s.split(/[.,]/)[1].length), '0'), 10);
  return parseInt(digitsOnly || '0', 10);
}

export function normalizeNiche(raw) {
  const k = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return NICHE_MAP[k] || null;
}

function slugify(username) {
  return String(username).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `c-${Date.now().toString(36)}`;
}

const pick = (row, ...keys) => {
  for (const k of keys) {
    const found = Object.keys(row).find(c => c.trim().toLowerCase() === k);
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') return row[found];
  }
  return '';
};

/** Lit un fichier xlsx/csv (Buffer) et retourne des lignes normalisées */
export function parseCreatorsFile(buffer, filename = 'import') {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const rows = [];
  for (const name of wb.SheetNames) {
    for (const r of XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })) {
      const username = String(pick(r, 'username', 'handle', 'pseudo')).trim().replace(/^@/, '').toLowerCase();
      if (!username) continue;
      rows.push({
        username,
        name: String(pick(r, 'name', 'nom')).trim() || username,
        country: normalizeCountry(pick(r, 'country', 'pays')),
        email: String(pick(r, 'email', 'e-mail', 'mail')).trim().toLowerCase(),
        instagram: String(pick(r, 'instagram')).trim(),
        youtube: String(pick(r, 'youtube')).trim(),
        tiktok: String(pick(r, 'tiktok')).trim(),
        followers: normalizeNumber(pick(r, 'followers', 'abonnes', 'abonnés')),
        posts: normalizeNumber(pick(r, 'posts', 'publications')),
        likes: normalizeNumber(pick(r, 'likes')),
        sourceNiche: String(pick(r, 'niche', 'category', 'categorie', 'catégorie')).trim(),
        source: filename,
      });
    }
  }
  return rows;
}

/**
 * Importe (upsert) les lignes. scope : france | francophone | europe | all
 */
export async function importCreators(rows, { scope = 'europe', source = 'import' } = {}) {
  const allowed = SCOPES[scope] === undefined ? SCOPES.europe : SCOPES[scope];
  const stats = { rows: rows.length, created: 0, updated: 0, skippedCountry: 0, duplicatesInFile: 0, invalid: 0, byCountry: {} };
  const seen = new Set();
  for (const r of rows) {
    if (!r.username || !/^[a-z0-9._\-]{1,60}$/.test(r.username)) { stats.invalid++; continue; }
    if (seen.has(r.username)) { stats.duplicatesInFile++; continue; }
    seen.add(r.username);
    if (allowed && !allowed.includes(r.country)) { stats.skippedCountry++; continue; }
    const niche = normalizeNiche(r.sourceNiche);
    // Dédoublonnage : pseudo, puis email
    let doc = await ExternalCreator.findOne({ username: r.username }).select('+email');
    if (!doc && r.email) doc = await ExternalCreator.findOne({ email: r.email }).select('+email');
    const fields = {
      name: r.name, country: r.country || doc?.country || '', instagram: r.instagram || doc?.instagram || '', youtube: r.youtube || doc?.youtube || '', tiktok: r.tiktok || doc?.tiktok || '',
      followers: r.followers || doc?.followers || 0, posts: r.posts || doc?.posts || 0, likes: r.likes || doc?.likes || 0,
      sourceNiche: r.sourceNiche || doc?.sourceNiche || '', source,
    };
    if (doc) {
      if (doc.status === 'optout') continue; // ne jamais réimporter quelqu'un qui a demandé le retrait
      Object.assign(doc, fields);
      if (r.email && !doc.email) doc.email = r.email;
      if (niche && !doc.niches.includes(niche)) doc.niches.push(niche);
      doc.updatedFromImportAt = new Date();
      await doc.save();
      stats.updated++;
    } else {
      let slug = slugify(r.username);
      if (await ExternalCreator.exists({ slug })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      await ExternalCreator.create({ username: r.username, slug, email: r.email || undefined, ...fields, niches: niche ? [niche] : [], importedAt: new Date() });
      stats.created++;
    }
    stats.byCountry[r.country || '??'] = (stats.byCountry[r.country || '??'] || 0) + 1;
  }
  logger.info(`Import créateurs référencés (${source}, ${scope}) : ${JSON.stringify({ ...stats, byCountry: undefined })}`);
  return stats;
}
