import XLSX from 'xlsx';
import Content, { CONTRACT_TYPES, USAGE_CHANNELS, RIGHTS_SUPPORTS } from '../models/Content.js';
import Delivery from '../models/Delivery.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { Invoice } from '../services/invoices.js';
import { resolveUrl } from '../services/storage.js';
import { sendContentRenewalRequest, sendContentExpiring } from '../services/email.js';
import { notify } from '../services/notifications.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const idOf = (x) => (x && x._id ? x._id : x)?.toString();

/**
 * Synchronise le registre avec les missions validées de la marque : une fiche par fichier ou lien livré,
 * droits repris du contrat, contrat et factures en documents. Idempotent (clé livraison + élément).
 */
export async function syncFromDeliveries(brandId) {
  const deliveries = await Delivery.find({ brandId, status: { $in: ['approved', 'auto_approved'] } })
    .select('campaignId creatorId files links contract payment approvedAt rightsExtension')
    .populate('campaignId', 'title brief.videoType')
    .populate('creatorId', 'profile.name email profile.slug')
    .lean();
  if (!deliveries.length) return 0;
  const existing = await Content.find({ brandId, source: 'needcreator' }).select('deliveryId itemId').lean();
  const known = new Set(existing.map(c => `${idOf(c.deliveryId)}:${c.itemId}`));
  let created = 0;
  for (const d of deliveries) {
    const invoices = await Invoice.find({ deliveryId: d._id, kind: { $in: ['mission', 'commission', 'platform'] } }).select('number pdfUrl kind').lean().catch(() => []);
    const docs = [];
    if (d.contract?.url) docs.push({ label: `Contrat ${d.contract.number || ''}`.trim(), url: d.contract.url });
    for (const a of d.contract?.addenda || []) if (a.url) docs.push({ label: `Avenant ${a.number || ''}`.trim(), url: a.url });
    for (const inv of invoices) if (inv.pdfUrl) docs.push({ label: `Facture ${inv.number}`, url: inv.pdfUrl });
    const items = [
      ...(d.files || []).filter(f => !f.superseded && f.type !== 'document').map(f => ({ id: String(f._id), kind: f.type === 'image' ? 'image' : 'video', url: f.url, thumbnail: f.thumbnail, title: f.filename })),
      ...(d.links || []).filter(l => !l.superseded).map(l => ({ id: String(l._id), kind: 'video', url: l.url, title: l.title || l.url })),
    ];
    const price = d.payment?.quotePrice ?? d.payment?.amountHT ?? d.payment?.amount ?? null;
    for (const [i, it] of items.entries()) {
      if (known.has(`${d._id}:${it.id}`)) continue;
      await Content.create({
        brandId, source: 'needcreator', deliveryId: d._id, campaignId: idOf(d.campaignId), itemId: it.id, creatorId: idOf(d.creatorId),
        title: `${d.campaignId?.title || 'Mission'}${items.length > 1 ? ` · ${i + 1}/${items.length}` : ''}`,
        kind: it.kind, url: it.url, thumbnail: it.thumbnail || null, product: d.campaignId?.title || null,
        creator: { name: d.creatorId?.profile?.name, email: d.creatorId?.email, handle: d.creatorId?.profile?.slug, platform: 'NeedCreator' },
        contractType: price === 0 ? 'gifting' : 'cession',
        rights: {
          startAt: d.contract?.rightsStartAt || d.approvedAt, endAt: d.contract?.rightsEndAt || null,
          supports: (d.contract?.rights?.supports || []).filter(s => RIGHTS_SUPPORTS.includes(s)), territories: d.contract?.rights?.territories || 'France',
          exclusivity: !!d.contract?.rights?.exclusivity, exclusivityMonths: d.contract?.rights?.exclusivityMonths,
        },
        price: items.length > 1 && price != null ? Math.round((price / items.length) * 100) / 100 : price,
        documents: docs,
      });
      created++;
    }
  }
  if (created) logger.info(`Contents synced for brand ${brandId}: +${created}`);
  return created;
}

function serialize(c) {
  const o = typeof c.toObject === 'function' ? c.toObject({ virtuals: true }) : c;
  return o;
}

/** Liste + résumé (actifs, expirent sous 30 j, expirés, illimités) */
export async function listContents(req, res) {
  try {
    const brandId = req.user._id;
    await syncFromDeliveries(brandId).catch(err => logger.warn(`Content sync failed: ${err.message}`));
    const { status, source, q } = req.query;
    const query = { brandId };
    if (source) query.source = source;
    if (q && String(q).trim()) {
      const re = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ title: re }, { product: re }, { 'creator.name': re }, { tags: re }];
    }
    let list = (await Content.find(query).sort({ 'rights.endAt': 1, createdAt: -1 }).lean()).map(withStatus);
    const summary = { total: list.length, active: 0, expiring: 0, expired: 0, unlimited: 0 };
    for (const c of list) summary[c.status] = (summary[c.status] || 0) + 1;
    if (status) list = list.filter(c => c.status === status);
    // Les contenus NeedCreator livrés en fichier sont en stockage privé : URL signée
    list = await Promise.all(list.map(async (c) => ({ ...c, url: c.source === 'needcreator' ? await resolveUrl(c.url) : c.url, thumbnail: c.thumbnail ? await resolveUrl(c.thumbnail) : null })));
    res.json({ contents: list, summary, contractTypes: CONTRACT_TYPES, usageChannels: USAGE_CHANNELS });
  } catch (error) {
    logger.error('listContents failed:', error);
    res.status(500).json({ error: 'Registre indisponible' });
  }
}

function pickBody(body) {
  const b = body || {};
  const out = {};
  if (b.title !== undefined) out.title = String(b.title).trim();
  if (b.kind !== undefined) out.kind = b.kind;
  if (b.url !== undefined) out.url = b.url || null;
  if (b.product !== undefined) out.product = b.product || null;
  if (b.tags !== undefined) out.tags = Array.isArray(b.tags) ? b.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 20) : [];
  if (b.creator !== undefined) out.creator = { name: b.creator?.name || '', handle: b.creator?.handle || '', email: (b.creator?.email || '').toLowerCase(), platform: b.creator?.platform || '' };
  if (b.contractType !== undefined) out.contractType = b.contractType;
  if (b.rights !== undefined) out.rights = {
    startAt: b.rights?.startAt || null, endAt: b.rights?.endAt || null,
    supports: (b.rights?.supports || []).filter(s => RIGHTS_SUPPORTS.includes(s)),
    territories: b.rights?.territories || 'France', exclusivity: !!b.rights?.exclusivity, exclusivityMonths: b.rights?.exclusivityMonths || null,
  };
  if (b.price !== undefined) out.price = b.price === '' || b.price === null ? null : Number(b.price);
  if (b.documents !== undefined) out.documents = (b.documents || []).filter(d => d?.url).map(d => ({ label: d.label || 'Document', url: d.url })).slice(0, 20);
  if (b.notes !== undefined) out.notes = b.notes || '';
  return out;
}

export async function createContent(req, res) {
  try {
    const data = pickBody(req.body);
    if (!data.title) return res.status(400).json({ error: 'Le titre est obligatoire' });
    const content = await Content.create({ ...data, brandId: req.user._id, source: 'external' });
    res.status(201).json({ message: 'Contenu ajouté au registre', content: serialize(content) });
  } catch (error) {
    logger.error('createContent failed:', error);
    res.status(400).json({ error: error.message || 'Ajout impossible' });
  }
}

export async function updateContent(req, res) {
  try {
    const content = await Content.findOne({ _id: req.params.id, brandId: req.user._id });
    if (!content) return res.status(404).json({ error: 'Contenu introuvable' });
    const data = pickBody(req.body);
    if (content.source === 'needcreator') {
      // Les droits, le prix et le créateur viennent du contrat : seuls les champs de suivi sont modifiables
      for (const k of ['rights', 'price', 'creator', 'contractType', 'url', 'kind', 'documents']) delete data[k];
    }
    Object.assign(content, data);
    await content.save();
    res.json({ message: 'Contenu mis à jour', content: serialize(content) });
  } catch (error) {
    logger.error('updateContent failed:', error);
    res.status(400).json({ error: error.message || 'Mise à jour impossible' });
  }
}

export async function deleteContent(req, res) {
  const content = await Content.findOne({ _id: req.params.id, brandId: req.user._id });
  if (!content) return res.status(404).json({ error: 'Contenu introuvable' });
  if (content.source === 'needcreator') return res.status(400).json({ error: 'Un contenu issu d\'une mission NeedCreator ne peut pas être retiré du registre' });
  await content.deleteOne();
  res.json({ message: 'Contenu retiré du registre' });
}

/** Utilisations : où le contenu est diffusé */
export async function addUsage(req, res) {
  const content = await Content.findOne({ _id: req.params.id, brandId: req.user._id });
  if (!content) return res.status(404).json({ error: 'Contenu introuvable' });
  const { channel, url, note } = req.body || {};
  if (!USAGE_CHANNELS.includes(channel)) return res.status(400).json({ error: 'Canal de diffusion invalide' });
  content.usages.push({ channel, url: url || '', note: note || '' });
  await content.save();
  res.json({ message: 'Utilisation ajoutée', content: serialize(content) });
}
export async function removeUsage(req, res) {
  const content = await Content.findOne({ _id: req.params.id, brandId: req.user._id });
  if (!content) return res.status(404).json({ error: 'Contenu introuvable' });
  content.usages = content.usages.filter(u => String(u._id) !== req.params.usageId);
  await content.save();
  res.json({ message: 'Utilisation retirée', content: serialize(content) });
}

/**
 * Relancer le créateur : mission NeedCreator → la prolongation payante se demande depuis la mission ;
 * contenu extérieur → email au créateur avec la demande de la marque.
 */
export async function requestRenewal(req, res) {
  try {
    const content = await Content.findOne({ _id: req.params.id, brandId: req.user._id });
    if (!content) return res.status(404).json({ error: 'Contenu introuvable' });
    if (content.source === 'needcreator') {
      return res.json({ message: 'Demandez la prolongation depuis la mission : le créateur fixe son prix et un avenant est généré.', href: `/deliveries/${content.deliveryId}` });
    }
    const email = content.creator?.email;
    if (!email) return res.status(400).json({ error: 'Renseignez l\'email du créateur sur la fiche pour le relancer' });
    const brandName = req.user.profile?.companyName || req.user.profile?.name;
    const message = String(req.body?.message || '').trim().slice(0, 1000);
    sendContentRenewalRequest(email, content.creator?.name, brandName, req.user.email, content.title, content.rights?.endAt, message).catch(err => logger.warn(`Content renewal email not sent: ${err.message}`));
    content.renewal.requestedAt = new Date();
    await content.save();
    res.json({ message: `Demande de renouvellement envoyée à ${email}`, content: serialize(content) });
  } catch (error) {
    logger.error('requestRenewal failed:', error);
    res.status(500).json({ error: 'Envoi impossible' });
  }
}

const pick = (row, ...keys) => { for (const k of keys) { const hit = Object.keys(row).find(c => c.trim().toLowerCase() === k); if (hit && row[hit] !== '') return row[hit]; } return ''; };
const parseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' || /^\d{4,6}(\.\d+)?$/.test(String(v).trim())) return new Date(Math.round((Number(v) - 25569) * 86400 * 1000)); // numéro de série Excel
  const s = String(v).trim();
  const fr = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); // jj/mm/aaaa
  const d = fr ? new Date(Date.UTC(+fr[3], +fr[2] - 1, +fr[1])) : new Date(s);
  return isNaN(d) ? null : d;
};
/** Statut calculé pour un document lean (les virtuals Mongoose ne s'appliquent pas à lean()) */
function withStatus(c) {
  const end = c.rights?.endAt;
  const daysLeft = end ? Math.ceil((new Date(end) - Date.now()) / 86400000) : null;
  const status = !end ? 'unlimited' : daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'active';
  return { ...c, status, daysLeft };
}

/** Import Excel / CSV de contenus extérieurs (colonnes : titre, créateur, email, type de contrat, début, fin, supports, territoire, prix, lien, produit) */
export async function importContents(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
    let wb;
    if (/\.csv$/i.test(req.file.originalname || '') || /csv/.test(req.file.mimetype || '')) {
      // CSV : UTF-8, séparateur ; ou , détecté sur la première ligne
      const text = req.file.buffer.toString('utf8').replace(/^\ufeff/, '');
      const first = text.split(/\r?\n/)[0] || '';
      const FS = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
      wb = XLSX.read(text, { type: 'string', FS, raw: false });
    } else {
      wb = XLSX.read(req.file.buffer, { type: 'buffer', raw: false, cellDates: true });
    }
    let created = 0, skipped = 0;
    for (const name of wb.SheetNames) {
      for (const r of XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })) {
        const title = String(pick(r, 'titre', 'title', 'contenu')).trim();
        if (!title) { skipped++; continue; }
        const supports = String(pick(r, 'supports', 'usages autorisés')).split(/[,;]/).map(s => s.trim().toLowerCase()).map(s => ({ 'réseaux sociaux': 'social_organic', 'social': 'social_organic', 'organique': 'social_organic', 'publicité': 'paid_ads', 'ads': 'paid_ads', 'pub': 'paid_ads', 'site': 'website', 'site web': 'website', 'web': 'website', 'email': 'email', 'emailing': 'email', 'marketplace': 'marketplace', 'amazon': 'marketplace', 'tv': 'tv', 'affichage': 'tv' }[s] || (RIGHTS_SUPPORTS.includes(s) ? s : null))).filter(Boolean);
        const ct = String(pick(r, 'type de contrat', 'contrat', 'contract')).trim().toLowerCase();
        const contractType = CONTRACT_TYPES.includes(ct) ? ct : ({ 'cession de droits': 'cession', 'licence': 'licence', 'license': 'licence', 'gifting': 'gifting', 'influence': 'influence' }[ct] || 'other');
        const kindRaw = String(pick(r, 'type', 'kind', 'format')).trim().toLowerCase();
        const kind = ['video', 'image', 'audio'].includes(kindRaw) ? kindRaw : ({ 'vidéo': 'video', 'photo': 'image' }[kindRaw] || 'video');
        const priceRaw = String(pick(r, 'prix', 'price', 'montant')).replace(/[^\d.,-]/g, '').replace(',', '.');
        await Content.create({
          brandId: req.user._id, source: 'external', title, kind,
          url: String(pick(r, 'lien', 'url', 'fichier')).trim() || null,
          product: String(pick(r, 'produit', 'product', 'campagne')).trim() || null,
          creator: { name: String(pick(r, 'créateur', 'createur', 'creator', 'nom')).trim(), handle: String(pick(r, 'pseudo', 'handle')).trim(), email: String(pick(r, 'email', 'e-mail', 'mail')).trim().toLowerCase(), platform: String(pick(r, 'plateforme', 'source', 'agence')).trim() },
          contractType,
          rights: { startAt: parseDate(pick(r, 'début', 'debut', 'start', 'date de début')), endAt: parseDate(pick(r, 'fin', 'end', 'expiration', 'date de fin')), supports, territories: String(pick(r, 'territoire', 'territoires', 'territory')).trim() || 'France', exclusivity: /oui|yes|true|1/i.test(String(pick(r, 'exclusivité', 'exclusivite', 'exclusivity'))) },
          price: priceRaw ? Number(priceRaw) : null,
          documents: [String(pick(r, 'contrat (lien)', 'contrat lien', 'contract url')).trim(), String(pick(r, 'facture (lien)', 'facture lien', 'invoice url')).trim()].filter(Boolean).map((u, i) => ({ label: i === 0 ? 'Contrat' : 'Facture', url: u })),
          notes: String(pick(r, 'notes', 'remarques')).trim(),
        });
        created++;
      }
    }
    res.json({ message: `${created} contenu(s) importé(s)${skipped ? `, ${skipped} ligne(s) sans titre ignorée(s)` : ''}`, created, skipped });
  } catch (error) {
    logger.error('importContents failed:', error);
    res.status(400).json({ error: `Import impossible : ${error.message}` });
  }
}

/** Export CSV (séparateur ;) pour le juridique ou le comptable */
export async function exportContents(req, res) {
  await syncFromDeliveries(req.user._id).catch(() => {});
  const list = (await Content.find({ brandId: req.user._id }).sort({ 'rights.endAt': 1 }).lean()).map(withStatus);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
  const statusLabel = { active: 'Actif', expiring: 'Expire sous 30 j', expired: 'Expiré', unlimited: 'Illimité' };
  const rows = [
    ['Titre', 'Source', 'Type', 'Créateur', 'Email créateur', 'Type de contrat', 'Début', 'Fin', 'Statut', 'Supports', 'Territoire', 'Exclusivité', 'Prix HT', 'Produit', 'Utilisations', 'Lien', 'Documents'].map(esc).join(';'),
    ...list.map(c => [c.title, c.source === 'needcreator' ? 'NeedCreator' : (c.creator?.platform || 'Extérieur'), c.kind, c.creator?.name, c.creator?.email, c.contractType, fmt(c.rights?.startAt), fmt(c.rights?.endAt), statusLabel[c.status], (c.rights?.supports || []).join(', '), c.rights?.territories, c.rights?.exclusivity ? 'oui' : 'non', c.price ?? '', c.product, (c.usages || []).map(u => `${u.channel}${u.url ? ' ' + u.url : ''}`).join(' | '), c.url, (c.documents || []).map(d => d.url).join(' | ')].map(esc).join(';')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contenus-et-droits-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + rows.join('\n'));
}

/** Tâche planifiée : rappels d'expiration des contenus extérieurs (30 puis 7 jours), à la marque */
export async function sendContentExpiryReminders() {
  const now = Date.now();
  const in30 = new Date(now + 30 * 86400000), in7 = new Date(now + 7 * 86400000);
  const due = await Content.find({ source: 'external', 'rights.endAt': { $gt: new Date(now), $lte: in30 } }).lean();
  let sent = 0;
  for (const c of due) {
    const days = Math.ceil((new Date(c.rights.endAt) - now) / 86400000);
    const stage = c.rights.endAt <= in7 ? 7 : 30;
    const already = stage === 7 ? c.renewal?.reminded7At : c.renewal?.reminded30At;
    if (already) continue;
    const brand = await User.findById(c.brandId).select('email profile.companyName profile.name');
    if (!brand) continue;
    await sendContentExpiring(brand.email, brand.profile?.companyName || brand.profile?.name, c.title, c.creator?.name, c.rights.endAt, days).catch(() => {});
    notify(brand._id, { type: 'rights', title: `Droits de « ${c.title} » : fin dans ${days} jour${days > 1 ? 's' : ''}`, text: c.creator?.name ? `Créateur : ${c.creator.name}. Relancez-le depuis Contenus & droits.` : 'Relancez le créateur depuis Contenus & droits.', href: '/contents' }).catch(() => {});
    await Content.updateOne({ _id: c._id }, { $set: { [`renewal.${stage === 7 ? 'reminded7At' : 'reminded30At'}`]: new Date() } });
    sent++;
  }
  return sent;
}
