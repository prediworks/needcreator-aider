import CreatorContent from '../models/CreatorContent.js';
import Delivery from '../models/Delivery.js';
import ExternalQuote from '../models/ExternalQuote.js';
import User from '../models/User.js';
import { CONTRACT_TYPES, RIGHTS_SUPPORTS } from '../models/Content.js';
import { resolveUrl } from '../services/storage.js';
import { createQuoteInternal } from './externalQuotes.js';
import { sendCreatorRightsExpiring, sendCreatorExclusivityEnded } from '../services/email.js';
import { notify } from '../services/notifications.js';
import logger from '../utils/logger.js';

const idOf = (x) => (x && x._id ? x._id : x)?.toString();
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const exclusivityEnd = (r) => (r?.exclusivity && r?.exclusivityMonths && r?.startAt ? addMonths(r.startAt, r.exclusivityMonths) : null);

/** Synchronise le registre du créateur : missions validées NeedCreator + devis extérieurs acceptés en direct */
export async function syncForCreator(creatorId) {
  let created = 0;
  const known = new Set((await CreatorContent.find({ creatorId }).select('deliveryId externalQuoteId').lean()).flatMap(c => [c.deliveryId && `d:${c.deliveryId}`, c.externalQuoteId && `q:${c.externalQuoteId}`]).filter(Boolean));
  const deliveries = await Delivery.find({ creatorId, status: { $in: ['approved', 'auto_approved'] } }).select('campaignId brandId contract payment approvedAt files links').populate('campaignId', 'title externalQuoteId').populate('brandId', 'profile.companyName email').lean();
  for (const d of deliveries) {
    if (known.has(`d:${d._id}`)) continue;
    const r = d.contract?.rights || {};
    const startAt = d.contract?.rightsStartAt || d.approvedAt;
    const rights = { startAt, endAt: d.contract?.rightsEndAt || null, supports: (r.supports || []).filter(s => RIGHTS_SUPPORTS.includes(s)), territories: r.territories || 'France', exclusivity: !!r.exclusivity, exclusivityMonths: r.exclusivityMonths || null };
    rights.exclusivityEndAt = exclusivityEnd(rights);
    const first = (d.files || []).find(f => !f.superseded && f.type === 'video') || (d.links || []).find(l => !l.superseded);
    await CreatorContent.create({
      creatorId, source: 'needcreator', deliveryId: d._id, campaignId: idOf(d.campaignId), externalQuoteId: d.campaignId?.externalQuoteId || undefined,
      title: d.campaignId?.title || 'Mission', kind: 'video', url: first?.url || null,
      client: { name: d.brandId?.profile?.companyName, email: d.brandId?.email, platform: 'NeedCreator' },
      contractType: d.payment?.quotePrice === 0 ? 'gifting' : 'cession', rights, price: d.payment?.quotePrice ?? d.payment?.amountHT ?? null,
      documents: [d.contract?.url && { label: `Contrat ${d.contract.number || ''}`.trim(), url: d.contract.url }].filter(Boolean),
    });
    created++;
  }
  const quotes = await ExternalQuote.find({ creatorId, status: 'accepted_direct' }).lean();
  for (const q of quotes) {
    if (known.has(`q:${q._id}`)) continue;
    const rights = { startAt: q.acceptedAt || q.createdAt, endAt: null, supports: q.quote.rights?.supports || [], territories: q.quote.rights?.territories || 'France', exclusivity: !!q.quote.rights?.exclusivity, exclusivityMonths: q.quote.rights?.exclusivityMonths || null };
    const months = { '6m': 6, '1y': 12, '2y': 24, '3y': 36 }[q.quote.rights?.duration];
    if (months) rights.endAt = addMonths(rights.startAt, months);
    rights.exclusivityEndAt = exclusivityEnd(rights);
    await CreatorContent.create({ creatorId, source: 'quote', externalQuoteId: q._id, title: q.mission.title, kind: 'video', client: { name: q.client.companyName, email: q.client.email, platform: 'Devis NeedCreator, payé en direct' }, contractType: 'cession', rights, price: q.quote.price, documents: [q.pdf?.contractUrl && { label: 'Projet de contrat', url: q.pdf.contractUrl }, q.pdf?.quoteUrl && { label: `Devis ${q.pdf.number}`, url: q.pdf.quoteUrl }].filter(Boolean) });
    created++;
  }
  if (created) logger.info(`Creator rights registry synced for ${creatorId}: +${created}`);
  return created;
}

function withStatus(c) {
  const end = c.rights?.endAt;
  const daysLeft = end ? Math.ceil((new Date(end) - Date.now()) / 86400000) : null;
  const status = !end ? 'unlimited' : daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'active';
  const ex = c.rights?.exclusivityEndAt;
  const exclusivityDaysLeft = ex ? Math.ceil((new Date(ex) - Date.now()) / 86400000) : null;
  const exclusivityStatus = !c.rights?.exclusivity ? 'none' : !ex ? 'undefined' : exclusivityDaysLeft < 0 ? 'ended' : 'active';
  return { ...c, status, daysLeft, exclusivityStatus, exclusivityDaysLeft };
}

export async function listCreatorContents(req, res) {
  try {
    await syncForCreator(req.user._id).catch(err => logger.warn(`Creator registry sync failed: ${err.message}`));
    let list = (await CreatorContent.find({ creatorId: req.user._id }).sort({ 'rights.endAt': 1, createdAt: -1 }).lean()).map(withStatus);
    const summary = { total: list.length, active: 0, expiring: 0, expired: 0, unlimited: 0, exclusivityActive: list.filter(c => c.exclusivityStatus === 'active').length };
    for (const c of list) summary[c.status] = (summary[c.status] || 0) + 1;
    if (req.query.status) list = list.filter(c => c.status === req.query.status);
    list = await Promise.all(list.map(async (c) => ({ ...c, url: c.source === 'needcreator' && c.url ? await resolveUrl(c.url) : c.url, documents: await Promise.all((c.documents || []).map(async (d) => ({ ...d, url: await resolveUrl(d.url) }))) })));
    res.json({ contents: list, summary, contractTypes: CONTRACT_TYPES });
  } catch (error) {
    logger.error('listCreatorContents failed:', error);
    res.status(500).json({ error: 'Registre indisponible' });
  }
}

function pickBody(b) {
  const out = {};
  if (b.title !== undefined) out.title = String(b.title).trim();
  if (b.kind !== undefined) out.kind = b.kind;
  if (b.url !== undefined) out.url = b.url || null;
  if (b.client !== undefined) out.client = { name: b.client?.name || '', email: (b.client?.email || '').toLowerCase(), platform: b.client?.platform || '' };
  if (b.contractType !== undefined) out.contractType = b.contractType;
  if (b.rights !== undefined) {
    out.rights = { startAt: b.rights?.startAt || null, endAt: b.rights?.endAt || null, supports: (b.rights?.supports || []).filter(s => RIGHTS_SUPPORTS.includes(s)), territories: b.rights?.territories || 'France', exclusivity: !!b.rights?.exclusivity, exclusivityMonths: b.rights?.exclusivityMonths || null, exclusivityScope: b.rights?.exclusivityScope || '' };
    out.rights.exclusivityEndAt = b.rights?.exclusivityEndAt || exclusivityEnd(out.rights);
  }
  if (b.price !== undefined) out.price = b.price === '' || b.price === null ? null : Number(b.price);
  if (b.documents !== undefined) out.documents = (b.documents || []).filter(d => d?.url).map(d => ({ label: d.label || 'Document', url: d.url })).slice(0, 20);
  if (b.notes !== undefined) out.notes = b.notes || '';
  return out;
}

export async function createCreatorContent(req, res) {
  try {
    const data = pickBody(req.body || {});
    if (!data.title) return res.status(400).json({ error: 'Le titre est obligatoire' });
    const c = await CreatorContent.create({ ...data, creatorId: req.user._id, source: 'external' });
    res.status(201).json({ message: 'Contenu ajouté à votre registre', content: withStatus(c.toObject()) });
  } catch (error) { res.status(400).json({ error: error.message || 'Ajout impossible' }); }
}
export async function updateCreatorContent(req, res) {
  const c = await CreatorContent.findOne({ _id: req.params.id, creatorId: req.user._id });
  if (!c) return res.status(404).json({ error: 'Contenu introuvable' });
  const data = pickBody(req.body || {});
  if (c.source !== 'external') for (const k of ['rights', 'price', 'client', 'contractType', 'url', 'kind', 'documents']) delete data[k];
  Object.assign(c, data);
  await c.save();
  res.json({ message: 'Contenu mis à jour', content: withStatus(c.toObject()) });
}
export async function deleteCreatorContent(req, res) {
  const c = await CreatorContent.findOne({ _id: req.params.id, creatorId: req.user._id });
  if (!c) return res.status(404).json({ error: 'Contenu introuvable' });
  if (c.source !== 'external') return res.status(400).json({ error: 'Un contenu issu d\'une mission ou d\'un devis NeedCreator ne se retire pas du registre' });
  await c.deleteOne();
  res.json({ message: 'Contenu retiré' });
}

/**
 * Proposer un renouvellement : mission NeedCreator → la prolongation se propose depuis la mission ;
 * contenu extérieur → un devis NeedCreator pré-rempli est créé (le client accepte et paie via la plateforme)
 */
export async function proposeRenewal(req, res) {
  try {
    const c = await CreatorContent.findOne({ _id: req.params.id, creatorId: req.user._id });
    if (!c) return res.status(404).json({ error: 'Contenu introuvable' });
    if (c.source === 'needcreator' && c.deliveryId) return res.json({ message: 'Proposez la prolongation depuis la mission : vous fixez votre prix, un avenant est généré et payé par la marque.', href: `/deliveries/${c.deliveryId}#contrat` });
    const duration = ['6m', '1y', '2y', '3y', 'unlimited'].includes(req.body?.duration) ? req.body.duration : '1y';
    const price = Number(req.body?.price) || Math.round((c.price || 100) * 0.5);
    const q = await createQuoteInternal(req.user, {
      client: { companyName: c.client?.name || 'Client', email: c.client?.email || '' },
      title: `Renouvellement des droits : ${c.title}`, description: `Prolongation des droits d'utilisation du contenu « ${c.title} »${c.rights?.endAt ? ` (fin actuelle le ${new Date(c.rights.endAt).toLocaleDateString('fr-FR')})` : ''} pour ${duration === 'unlimited' ? 'une durée illimitée' : ({ '6m': '6 mois', '1y': '1 an', '2y': '2 ans', '3y': '3 ans' })[duration]}. Aucune nouvelle vidéo à produire.`,
      videoType: 'other', deliverables: 1, duration: 0, platforms: [], price, estimatedDeliveryDays: 1, revisions: 0,
      rights: { duration, supports: c.rights?.supports?.length ? c.rights.supports : ['social_organic'], territories: c.rights?.territories || 'France', exclusivity: false }, terms: 'Renouvellement de droits sur un contenu déjà livré.',
    });
    c.reminders.renewalProposedAt = new Date();
    await c.save();
    res.status(201).json({ message: 'Devis de renouvellement créé : envoyez-le au client depuis « Mes devis clients »', quote: { id: q._id, link: q.link }, href: '/quotes' });
  } catch (error) {
    logger.error('proposeRenewal failed:', error);
    res.status(400).json({ error: error.message || 'Proposition impossible' });
  }
}

/** Tâche planifiée : rappels au créateur (droits extérieurs à 30 et 7 jours, fin d'exclusivité pour tous) */
export async function sendCreatorRightsReminders() {
  const now = Date.now();
  let sent = 0;
  const in30 = new Date(now + 30 * 86400000), in7 = new Date(now + 7 * 86400000);
  const due = await CreatorContent.find({ source: { $ne: 'needcreator' }, 'rights.endAt': { $gt: new Date(now), $lte: in30 } }).lean();
  for (const c of due) {
    const stage = new Date(c.rights.endAt) <= in7 ? 7 : 30;
    if (stage === 7 ? c.reminders?.rights7At : c.reminders?.rights30At) continue;
    const u = await User.findById(c.creatorId).select('email profile.name');
    if (!u) continue;
    const days = Math.ceil((new Date(c.rights.endAt) - now) / 86400000);
    await sendCreatorRightsExpiring(u.email, u.profile?.name, c.title, c.client?.name, c.rights.endAt, days).catch(() => {});
    notify(u._id, { type: 'rights', title: `Droits de « ${c.title} » : fin dans ${days} jour${days > 1 ? 's' : ''}`, text: 'Proposez un renouvellement à votre client depuis votre registre.', href: '/rights' }).catch(() => {});
    await CreatorContent.updateOne({ _id: c._id }, { $set: { [`reminders.${stage === 7 ? 'rights7At' : 'rights30At'}`]: new Date() } });
    sent++;
  }
  const ended = await CreatorContent.find({ 'rights.exclusivity': true, 'rights.exclusivityEndAt': { $lte: new Date(now) }, 'reminders.exclusivityEndAt': null }).lean();
  for (const c of ended) {
    const u = await User.findById(c.creatorId).select('email profile.name');
    if (!u) continue;
    await sendCreatorExclusivityEnded(u.email, u.profile?.name, c.title, c.client?.name, c.rights.exclusivityEndAt).catch(() => {});
    notify(u._id, { type: 'rights', title: `Exclusivité terminée : « ${c.title} »`, text: `Vous êtes libre de travailler pour d'autres marques du secteur de ${c.client?.name || 'ce client'}.`, href: '/rights' }).catch(() => {});
    await CreatorContent.updateOne({ _id: c._id }, { $set: { 'reminders.exclusivityEndAt': new Date() } });
    sent++;
  }
  return sent;
}
