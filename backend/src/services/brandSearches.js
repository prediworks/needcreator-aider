import BrandSearch from '../models/BrandSearch.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { notify } from './notifications.js';
import logger from '../utils/logger.js';

/**
 * Recherches sans résultat dans « Candidature vidéo » : enregistrées, regroupées par marque, et transformées en fiche de prospection
 * sur un clic de l'équipe, jamais toutes seules (une recherche n'est pas une suggestion). Le créateur est prévenu quand la marque
 * devient proposable, et elle lui est réservée dix jours s'il est le seul à l'avoir cherchée.
 */
const RESERVED_DAYS = 10;
const TYPING_WINDOW_MS = 2 * 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });
export const normBrand = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Une recherche qui n'a rien rendu. La saisie arrive lettre à lettre (« Fil », « Filo », « Filorga ») : seule la forme la plus longue
 * d'une même frappe est gardée ; un retour en arrière (« Filorg » après « Filorga ») est ignoré. Quatre caractères au moins.
 */
export async function recordEmptySearch(creatorId, q) {
  const query = String(q || '').trim().slice(0, 80);
  const norm = normBrand(query);
  if (!creatorId || norm.length < 4) return null;
  const since = new Date(Date.now() - TYPING_WINDOW_MS);
  const recent = await BrandSearch.find({ creatorId, status: 'open', lastAt: { $gte: since } }).sort({ lastAt: -1 }).limit(5);
  for (const r of recent) {
    if (r.norm === norm) { r.lastAt = new Date(); r.query = query; await r.save(); return r; }
    if (r.norm.startsWith(norm)) return r; // le créateur efface des lettres : la forme longue reste
    if (norm.startsWith(r.norm)) {
      // suite de la même frappe : la forme longue remplace la courte (sauf si elle existe déjà pour ce créateur)
      const dup = await BrandSearch.findOne({ creatorId, norm });
      if (dup) { dup.lastAt = new Date(); dup.query = query; await dup.save(); await r.deleteOne(); return dup; }
      r.query = query; r.norm = norm; r.lastAt = new Date(); await r.save(); return r;
    }
  }
  const existing = await BrandSearch.findOne({ creatorId, norm });
  if (existing) { existing.count += 1; existing.lastAt = new Date(); existing.query = query; if (existing.status === 'dismissed') existing.status = 'open'; await existing.save(); return existing; }
  return BrandSearch.create({ creatorId, query, norm });
}

/** Marques cherchées, regroupées : combien de créateurs, quand, et si une fiche existe déjà */
export async function listBrandSearches() {
  const rows = await BrandSearch.find({ status: { $in: ['open', 'created'] } }).sort({ lastAt: -1 }).lean();
  const groups = new Map();
  for (const r of rows) {
    const g = groups.get(r.norm) || { norm: r.norm, query: r.query, creators: new Set(), searches: 0, lastAt: r.lastAt, firstAt: r.firstAt, status: 'created', leadId: r.leadId || null };
    g.creators.add(String(r.creatorId)); g.searches += r.count;
    if (r.lastAt > g.lastAt) { g.lastAt = r.lastAt; g.query = r.query; }
    if (r.firstAt < g.firstAt) g.firstAt = r.firstAt;
    if (r.status === 'open') g.status = 'open';
    if (r.leadId) g.leadId = r.leadId;
    groups.set(r.norm, g);
  }
  const out = [...groups.values()].map(g => ({ ...g, creators: g.creators.size }));
  // Une marque déjà en prospection sous ce nom : signalée, pour la relier plutôt que la recréer
  const leads = await Lead.find({ kind: 'brand', name: { $in: out.map(g => new RegExp(`^${g.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } }).select('name status').lean();
  for (const g of out) { const l = leads.find(x => normBrand(x.name) === g.norm); if (l && !g.leadId) { g.existingLeadId = l._id; g.existingStatus = l.status; } }
  return out.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.creators - a.creators || new Date(b.lastAt) - new Date(a.lastAt));
}

/** « Créer la fiche marque » : la marque entre dans la prospection, les créateurs qui l'ont cherchée sont prévenus et, s'il n'y en a qu'un, elle lui est réservée */
export async function createLeadFromSearch(norm, { createdBy, name: chosenName } = {}) {
  const rows = await BrandSearch.find({ norm, status: 'open' });
  if (!rows.length) throw fail(404, 'Aucune recherche en attente pour cette marque');
  // Nom corrigé par l'équipe (faute de frappe du créateur), sinon la forme la plus longue tapée
  const typed = rows.map(r => r.query).sort((a, b) => b.length - a.length)[0].replace(/\s+/g, ' ').trim();
  const fixed = String(chosenName || '').replace(/\s+/g, ' ').trim();
  if (chosenName !== undefined && (fixed.length < 2 || fixed.length > 80)) throw fail(400, 'Nom de marque : 2 à 80 caractères');
  const name = fixed || typed;
  const { estimateSize } = await import('./brandSuggestions.js');
  const { size, tier } = await estimateSize({ name }); // liste des marques refusées, annonces Meta, connaissance de l'IA
  if (tier === 'huge') throw fail(400, `${name} est une très grande marque (${size.blocked ? 'liste des marques refusées' : size.reason || `${size.ads} annonces actives`}) : agences et créateurs sous contrat, nous ne la démarchons pas. Ignorez cette recherche.`);
  const creatorIds = [...new Set(rows.map(r => String(r.creatorId)))];
  const single = creatorIds.length === 1 ? rows[0].creatorId : null;
  const reservedUntil = new Date(Date.now() + RESERVED_DAYS * 86400000);
  let lead = await Lead.findOne({ kind: 'brand', name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  const note = `Cherchée dans « Candidature vidéo » par ${creatorIds.length} créateur(s) qui possèdent le produit (${rows.reduce((n, r) => n + r.count, 0)} recherche(s))${fixed && normBrand(fixed) !== normBrand(typed) ? `, tapée « ${typed} »` : ''}`;
  if (lead) {
    if (['new', 'rejected', 'excluded'].includes(lead.status)) lead.status = 'qualified';
    if (single) { lead.suggestedBy = lead.suggestedBy || single; lead.reservedUntil = reservedUntil; }
    lead.notes = [lead.notes, note].filter(Boolean).join(' · ').slice(0, 2000);
    await lead.save();
  } else {
    lead = await Lead.create({
      kind: 'brand', source: 'manual', externalId: `search:${norm}`, name, country: 'FR', status: 'qualified', score: 50,
      description: `Marque cherchée par ${creatorIds.length} créateur(s) NeedCreator dans « Candidature vidéo » : ils possèdent le produit et veulent tourner.`,
      notes: note, keyword: 'recherche créateur', sizeTier: tier, stats: size.ads != null ? { ads: size.ads } : undefined,
      ...(single ? { suggestedBy: single, reservedUntil } : {}), createdBy,
    });
    // Qualification (secteur, accroches, message), site et email : en arrière-plan ; l'équipe a décidé, la note de l'IA n'écarte pas la marque
    const leadId = lead._id;
    setImmediate(async () => {
      try {
        const l = await Lead.findById(leadId); if (!l) return;
        const { qualifyOne } = await import('./acquisition/index.js');
        await qualifyOne(l, []);
        if (l.status === 'rejected') { l.status = 'qualified'; await l.save(); }
        if (!l.email && l.website) { const { enrichLeadFromSite } = await import('./acquisition/enrich.js'); await enrichLeadFromSite(l).catch(() => false); await l.save(); }
      } catch (err) { logger.warn(`Searched brand ${leadId} not enriched: ${err.message}`); }
    });
  }
  await BrandSearch.updateMany({ norm, status: 'open' }, { $set: { status: 'created', leadId: lead._id } });
  const href = `/vitrine?marque=${lead._id}`;
  for (const creatorId of creatorIds) {
    const text = single ? `Vous l'aviez cherchée : elle vous est réservée jusqu'au ${reservedUntil.toLocaleDateString('fr-FR')}. Tournez 15 à 30 secondes avec le produit, fixez votre prix.` : 'Vous l\'aviez cherchée : vous pouvez maintenant tourner une vidéo avec le produit et fixer votre prix.';
    await notify(creatorId, { type: 'application', title: `${name} est maintenant dans la liste des marques à filmer`, text, href }).catch(() => null);
  }
  // Email en plus de la cloche : un créateur qui ne se reconnecte pas saurait trop tard que la marque lui est réservée
  const creators = await User.find({ _id: { $in: creatorIds } }).select('email profile.name preferences').lean();
  const { config } = await import('../config/index.js');
  setImmediate(async () => {
    const { sendSearchedBrandAvailable } = await import('./email.js');
    for (const c of creators.filter(u => u.email && u.preferences?.emailNotifications !== false)) {
      await sendSearchedBrandAvailable(c.email, c.profile?.name || '', name, `${config.cors.origin}${href}`, single ? reservedUntil : null, c.preferences?.language === 'en' ? 'en' : 'fr').catch(err => logger.warn(`Searched brand email ${c._id}: ${err.message}`));
    }
  });
  return { lead, creators: creatorIds.length, tier, reserved: !!single };
}

export async function dismissSearch(norm) {
  const r = await BrandSearch.updateMany({ norm, status: 'open' }, { $set: { status: 'dismissed' } });
  if (!r.matchedCount) throw fail(404, 'Aucune recherche en attente pour cette marque');
  return r.modifiedCount;
}

/** Nom affiché des créateurs qui ont cherché une marque, pour l'équipe */
export async function searchersOf(norm) {
  const rows = await BrandSearch.find({ norm }).select('creatorId').lean();
  const users = await User.find({ _id: { $in: rows.map(r => r.creatorId) } }).select('profile.name email').lean();
  return users.map(u => u.profile?.name || u.email);
}
