import Prospect, { PROSPECT_STATUSES } from '../models/Prospect.js';
import ExternalQuote from '../models/ExternalQuote.js';
import User from '../models/User.js';
import { notify } from '../services/notifications.js';
import { sendProspectFollowUpDue } from '../services/email.js';
import logger from '../utils/logger.js';

function pick(b) {
  const out = {};
  for (const k of ['company', 'contactName', 'phone', 'website', 'source']) if (b[k] !== undefined) out[k] = String(b[k] || '').trim();
  if (b.email !== undefined) out.email = String(b.email || '').trim().toLowerCase();
  if (b.status !== undefined && PROSPECT_STATUSES.includes(b.status)) out.status = b.status;
  if (b.nextFollowUpAt !== undefined) out.nextFollowUpAt = b.nextFollowUpAt ? new Date(b.nextFollowUpAt) : null;
  if (b.lastContactAt !== undefined) out.lastContactAt = b.lastContactAt ? new Date(b.lastContactAt) : null;
  return out;
}

/** Statut à jour selon les devis liés (envoyé → quote_sent, accepté → won, décliné → lost) */
async function syncWithQuotes(creatorId, prospects) {
  const ids = prospects.filter(p => p.externalQuoteId).map(p => p.externalQuoteId);
  if (!ids.length) return;
  const quotes = await ExternalQuote.find({ _id: { $in: ids }, creatorId }).select('status brandId').lean();
  const byId = new Map(quotes.map(q => [String(q._id), q]));
  for (const p of prospects) {
    const q = byId.get(String(p.externalQuoteId));
    if (!q) continue;
    const next = q.status === 'sent' ? 'quote_sent' : ['accepted_needcreator', 'accepted_direct'].includes(q.status) ? 'won' : q.status === 'declined' ? 'lost' : null;
    if (next && next !== p.status && !['won', 'lost'].includes(p.status)) {
      p.status = next;
      await Prospect.updateOne({ _id: p._id }, { $set: { status: next, ...(q.brandId ? { brandId: q.brandId } : {}) } });
    }
  }
}

export async function listProspects(req, res) {
  try {
    const prospects = await Prospect.find({ creatorId: req.user._id }).sort({ nextFollowUpAt: 1, updatedAt: -1 }).lean();
    await syncWithQuotes(req.user._id, prospects).catch(err => logger.warn(`Prospect sync failed: ${err.message}`));
    const now = Date.now();
    const summary = { total: prospects.length, dueToday: prospects.filter(p => p.nextFollowUpAt && new Date(p.nextFollowUpAt) <= now && !['won', 'lost'].includes(p.status)).length };
    for (const s of PROSPECT_STATUSES) summary[s] = prospects.filter(p => p.status === s).length;
    res.json({ prospects, summary, statuses: PROSPECT_STATUSES });
  } catch (error) {
    logger.error('listProspects failed:', error);
    res.status(500).json({ error: 'Suivi de prospection indisponible' });
  }
}

export async function createProspect(req, res) {
  const data = pick(req.body || {});
  if (!data.company) return res.status(400).json({ error: 'Il manque : le nom de la marque' });
  const note = String(req.body?.note || '').trim();
  const p = await Prospect.create({ ...data, creatorId: req.user._id, notes: note ? [{ text: note.slice(0, 2000) }] : [] });
  res.status(201).json({ message: 'Prospect ajouté', prospect: p });
}

export async function updateProspect(req, res) {
  const p = await Prospect.findOne({ _id: req.params.id, creatorId: req.user._id });
  if (!p) return res.status(404).json({ error: 'Prospect introuvable' });
  const data = pick(req.body || {});
  if (data.company === '') delete data.company;
  Object.assign(p, data);
  if (req.body?.note) { p.notes.push({ text: String(req.body.note).trim().slice(0, 2000) }); p.lastContactAt = p.lastContactAt || new Date(); }
  if (data.status && ['contacted', 'replied', 'quote_sent'].includes(data.status) && req.body.lastContactAt === undefined) p.lastContactAt = new Date();
  if (data.nextFollowUpAt !== undefined) p.followUpNotifiedAt = null;
  await p.save();
  res.json({ message: 'Prospect mis à jour', prospect: p });
}

export async function deleteProspect(req, res) {
  const r = await Prospect.deleteOne({ _id: req.params.id, creatorId: req.user._id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Prospect introuvable' });
  res.json({ message: 'Prospect retiré' });
}

/** Rattache un devis extérieur au prospect (appelé après création d'un devis avec prospectId) */
export async function attachQuoteToProspect(creatorId, prospectId, quote) {
  if (!prospectId) return;
  await Prospect.updateOne({ _id: prospectId, creatorId }, { $set: { externalQuoteId: quote._id, status: 'quote_sent', lastContactAt: new Date() }, $push: { notes: { text: `Devis ${quote.pdf?.number || ''} créé (${quote.quote?.price} € HT)`.replace('  ', ' '), at: new Date() } } }).catch(() => {});
}

/** Tâche planifiée : relances à date → notification + email, une fois par échéance */
export async function sendProspectFollowUpReminders() {
  const due = await Prospect.find({ nextFollowUpAt: { $lte: new Date() }, followUpNotifiedAt: null, status: { $nin: ['won', 'lost'] } }).lean();
  const byCreator = new Map();
  for (const p of due) { if (!byCreator.has(String(p.creatorId))) byCreator.set(String(p.creatorId), []); byCreator.get(String(p.creatorId)).push(p); }
  let sent = 0;
  for (const [creatorId, list] of byCreator) {
    const u = await User.findById(creatorId).select('email profile.name');
    if (!u) continue;
    const names = list.map(p => p.company);
    await sendProspectFollowUpDue(u.email, u.profile?.name, names).catch(() => {});
    notify(u._id, { type: 'reminder', title: list.length === 1 ? `Relance prévue aujourd'hui : ${names[0]}` : `${list.length} relances prévues aujourd'hui`, text: names.join(', '), href: '/prospects' }).catch(() => {});
    await Prospect.updateMany({ _id: { $in: list.map(p => p._id) } }, { $set: { followUpNotifiedAt: new Date() } });
    sent += list.length;
  }
  return sent;
}
