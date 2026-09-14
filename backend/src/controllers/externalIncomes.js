import ExternalIncome from '../models/ExternalIncome.js';
import ExternalQuote from '../models/ExternalQuote.js';
import logger from '../utils/logger.js';

/** Les devis « payés en direct » comptent automatiquement comme revenus extérieurs (une fois) */
export async function syncExternalIncomes(creatorId) {
  const quotes = await ExternalQuote.find({ creatorId, status: 'accepted_direct' }).select('_id client mission quote acceptedAt createdAt').lean();
  if (!quotes.length) return 0;
  const known = new Set((await ExternalIncome.find({ creatorId, externalQuoteId: { $in: quotes.map(q => q._id) } }).select('externalQuoteId').lean()).map(i => String(i.externalQuoteId)));
  let created = 0;
  for (const q of quotes) {
    if (known.has(String(q._id))) continue;
    await ExternalIncome.create({ creatorId, label: q.mission.title, client: q.client.companyName, amountHT: q.quote.price, date: q.acceptedAt || q.createdAt, source: 'quote', externalQuoteId: q._id });
    created++;
  }
  return created;
}

/** Total HT des revenus extérieurs sur une année civile */
export async function externalIncomeYtd(creatorId, year) {
  const agg = await ExternalIncome.aggregate([
    { $match: { creatorId, date: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) } } },
    { $group: { _id: null, ht: { $sum: '$amountHT' } } },
  ]);
  return Math.round((agg[0]?.ht || 0) * 100) / 100;
}

export async function listExternalIncomes(req, res) {
  try {
    await syncExternalIncomes(req.user._id).catch(err => logger.warn(`External incomes sync failed: ${err.message}`));
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const incomes = await ExternalIncome.find({ creatorId: req.user._id, date: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) } }).sort({ date: -1 }).lean();
    res.json({ year, incomes, total: Math.round(incomes.reduce((s, i) => s + i.amountHT, 0) * 100) / 100 });
  } catch (error) {
    logger.error('listExternalIncomes failed:', error);
    res.status(500).json({ error: 'Revenus extérieurs indisponibles' });
  }
}

export async function createExternalIncome(req, res) {
  const b = req.body || {};
  const label = String(b.label || '').trim();
  const amountHT = Number(b.amountHT);
  const date = b.date ? new Date(b.date) : new Date();
  const missing = [!label && 'un libellé', !(amountHT > 0) && 'un montant HT', Number.isNaN(date.getTime()) && 'une date valide'].filter(Boolean);
  if (missing.length) return res.status(400).json({ error: `Il manque : ${missing.join(', ')}` });
  const income = await ExternalIncome.create({ creatorId: req.user._id, label, client: String(b.client || '').trim(), amountHT: Math.round(amountHT * 100) / 100, date, notes: String(b.notes || '').slice(0, 1000) });
  res.status(201).json({ message: 'Revenu ajouté', income });
}

export async function deleteExternalIncome(req, res) {
  const income = await ExternalIncome.findOne({ _id: req.params.id, creatorId: req.user._id });
  if (!income) return res.status(404).json({ error: 'Revenu introuvable' });
  await income.deleteOne();
  res.json({ message: 'Revenu retiré' });
}
