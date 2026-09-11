import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { uploadFile } from './storage.js';
import logger from '../utils/logger.js';

/**
 * Facturation.
 *  - creator_to_brand : facture du créateur à la marque, émise par NeedCreator au nom du créateur (mandat de facturation)
 *  - commission       : facture de commission NeedCreator → créateur (réglée par compensation sur le versement)
 *  - platform_to_brand: facture NeedCreator → marque (frais gifting, pack prêt à diffuser)
 * Numérotation continue par émetteur : NeedCreator (NC-F-AAAA-000001), chaque créateur (CR-XXXXXX-AAAA-0001).
 * Le prix des missions transite en compte de tiers ; seule la commission est du chiffre d'affaires NeedCreator.
 */

const PLATFORM = {
  name: process.env.COMPANY_LEGAL_NAME || 'PREDIWORKS SAS',
  brand: 'NeedCreator',
  address: process.env.COMPANY_ADDRESS || '17 Rue Coysevox, 75018 Paris, France',
  siren: process.env.COMPANY_SIREN || '100462530',
  vat: process.env.COMPANY_VAT || 'FR66100462530',
  rcs: process.env.COMPANY_RCS || 'RCS Paris',
  email: process.env.FROM_EMAIL || 'contact@needcreator.com',
};

const counterSchema = new mongoose.Schema({ key: { type: String, unique: true }, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const partySchema = new mongoose.Schema({
  name: String, legalName: String, address: String, siret: String, vatNumber: String, email: String,
  vatRegistered: Boolean, status: String,
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['creator_to_brand', 'commission', 'platform_to_brand', 'credit_note'], required: true },
  creditOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },   // avoir : facture annulée
  creditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, // facture : avoir qui l'annule
  originalKind: String, // avoir : nature de la facture annulée
  reason: String,
  issuedAt: { type: Date, default: Date.now },
  issuer: partySchema,
  recipient: partySchema,
  issuerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },     // créateur (creator_to_brand) ou null (NeedCreator)
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery', index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  source: { type: String, enum: ['mission', 'gifting', 'ready_pack', 'rights_extension', 'dispute'], default: 'mission' },
  lines: [{ label: String, quantity: { type: Number, default: 1 }, unitHT: Number, totalHT: Number, _id: false }],
  totals: { ht: Number, vatRate: Number, vat: Number, ttc: Number },
  vatNote: String,          // « TVA non applicable, art. 293 B du CGI » pour la franchise
  mandate: { type: Boolean, default: false }, // émise par NeedCreator au nom du créateur
  paymentNote: String,
  pdfUrl: String,
}, { timestamps: true });

export const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => `${r2(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const shortId = (id) => String(id).slice(-6).toUpperCase();

async function nextNumber(key, prefix, pad = 6) {
  const year = new Date().getFullYear();
  const c = await Counter.findOneAndUpdate({ key: `${key}:${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}-${year}-${String(c.seq).padStart(pad, '0')}`;
}

function creatorParty(user) {
  const li = user.legalInfo || {};
  const a = li.address || {};
  const address = [a.line1, a.line2, `${a.postalCode || ''} ${a.city || ''}`.trim(), a.country].filter(Boolean).join(', ') || li.registryAddress || null;
  return {
    name: [li.firstName, li.lastName].filter(Boolean).join(' ') || user.profile?.name,
    legalName: li.status === 'company' ? (li.legalName || li.companyName || null) : (li.legalName || null),
    address, siret: li.siret || null,
    vatRegistered: !!li.vatRegistered, vatNumber: li.vatRegistered ? (li.vatNumber || null) : null,
    status: li.status || null, email: user.email,
  };
}

function brandParty(user) {
  const c = user.profile?.company || {};
  return {
    name: user.profile?.companyName || user.profile?.name,
    legalName: c.legalName || user.profile?.companyName || null,
    address: c.registryAddress || null, siret: c.siret || null, vatNumber: c.vatNumber || null,
    email: user.email, status: 'company', vatRegistered: !!c.vatNumber,
  };
}

const platformParty = () => ({ name: PLATFORM.brand, legalName: PLATFORM.name, address: PLATFORM.address, siret: PLATFORM.siren, vatNumber: PLATFORM.vat, email: PLATFORM.email, vatRegistered: true, status: 'company' });

/**
 * PDF d'une facture
 */
export function renderInvoicePdf(inv) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Facture ${inv.number}`, Author: PLATFORM.brand } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isCredit = inv.kind === 'credit_note';
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text(isCredit ? 'AVOIR' : 'FACTURE', { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`N° ${inv.number}`, { align: 'right' }).text(`Date : ${fmtDate(inv.issuedAt)}`, { align: 'right' });
    doc.moveDown(1.2);

    const party = (title, p, x, y) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(title, x, y);
      doc.font('Helvetica').fontSize(10).fillColor('#222');
      if (p.legalName && p.legalName !== p.name) doc.text(p.legalName, x);
      doc.text(p.name || '', x);
      if (p.address) doc.text(p.address, x, undefined, { width: 230 });
      if (p.siret) doc.text(`${String(p.siret).replace(/\s/g, '').length === 9 ? 'SIREN' : 'SIRET'} ${p.siret}`, x);
      if (p.vatNumber) doc.text(`TVA ${p.vatNumber}`, x);
      if (p.email) doc.text(p.email, x);
    };
    const top = doc.y;
    party('Émetteur', inv.issuer, 50, top);
    const yAfterIssuer = doc.y;
    party('Destinataire', inv.recipient, 320, top);
    doc.y = Math.max(yAfterIssuer, doc.y) + 12;
    doc.x = 50;

    if (isCredit && inv.creditNumber) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(`Annule et remplace la facture n° ${inv.creditNumber}${inv.reason ? ` — motif : ${inv.reason}` : ''}`, 50, doc.y, { width: 495 });
      doc.moveDown(0.6);
    }
    if (inv.mandate) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555').text(`Facture établie par ${PLATFORM.name} (${PLATFORM.brand}) au nom et pour le compte de l'émetteur, en vertu d'un mandat de facturation.`, 50, doc.y, { width: 495 });
      doc.moveDown(0.6);
    }

    // Tableau des lignes
    const cols = { label: 50, qty: 350, unit: 410, total: 480 };
    const rowY = doc.y + 6;
    doc.rect(50, rowY - 4, 495, 18).fill('#f1f5f4');
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(9);
    doc.text('Désignation', cols.label + 4, rowY); doc.text('Qté', cols.qty, rowY); doc.text('PU HT', cols.unit, rowY); doc.text('Total HT', cols.total, rowY);
    doc.font('Helvetica').fontSize(10).fillColor('#222');
    let y = rowY + 22;
    for (const l of inv.lines) {
      doc.text(l.label, cols.label + 4, y, { width: 290 });
      const h = doc.heightOfString(l.label, { width: 290 });
      doc.text(String(l.quantity), cols.qty, y); doc.text(fmt(l.unitHT), cols.unit, y); doc.text(fmt(l.totalHT), cols.total, y);
      y += Math.max(h, 12) + 6;
    }
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();
    y += 10;
    const totalLine = (k, v, bold = false) => { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111').text(k, 350, y, { width: 120 }).text(v, 480, y); y += 16; };
    totalLine('Total HT', fmt(inv.totals.ht));
    if (inv.totals.vatRate > 0) totalLine(`TVA ${inv.totals.vatRate} %`, fmt(inv.totals.vat));
    else totalLine('TVA', '0,00 €');
    totalLine('Total TTC', fmt(inv.totals.ttc), true);
    doc.y = y + 6; doc.x = 50;
    if (inv.vatNote) doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555').text(inv.vatNote, 50, doc.y, { width: 495 });
    if (inv.paymentNote) { doc.moveDown(0.4); doc.font('Helvetica').fontSize(9).fillColor('#444').text(inv.paymentNote, 50, doc.y, { width: 495 }); }

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor('#777').text(
      (inv.kind === 'creator_to_brand' || (isCredit && inv.originalKind === 'creator_to_brand'))
        ? `Document émis via la plateforme ${PLATFORM.brand}. En cas de retard de paiement : pénalités au taux légal et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 C. com.). Pas d'escompte pour paiement anticipé.`
        : `${PLATFORM.name} · ${PLATFORM.address} · SIREN ${PLATFORM.siren} · ${PLATFORM.rcs} · TVA ${PLATFORM.vat}. Pas d'escompte pour paiement anticipé ; pénalités de retard au taux légal, indemnité forfaitaire de recouvrement 40 €.`,
      50, 760, { width: 495, align: 'center' });
    doc.end();
  });
}

async function persist(data) {
  const inv = new Invoice(data);
  const pdf = await renderInvoicePdf(inv);
  const { url } = await uploadFile(pdf, `facture-${inv.number}.pdf`, 'application/pdf', `invoices/${inv.deliveryId || 'divers'}`);
  inv.pdfUrl = url;
  await inv.save();
  logger.info(`Invoice ${inv.number} (${inv.kind}) issued`);
  return inv;
}

const platformVat = () => config.vat.rate;

/**
 * Facture créateur → marque + facture de commission, pour un montant HT donné (mission, prolongation, litige tranché).
 * amounts : { ht, vatRate, vat, ttc, feeHT, feeVat, feeTTC }
 */
export async function issueCreatorInvoices({ delivery, creator, brand, campaignTitle, label, amounts, source = 'mission' }) {
  const out = [];
  if (!(amounts.ht > 0)) return out;
  const cParty = creatorParty(creator);
  const bParty = brandParty(brand);
  const franchise = !cParty.vatRegistered;
  const key = `creator:${creator._id}`;
  const number = await nextNumber(key, `CR-${shortId(creator._id)}`, 4);
  out.push(await persist({
    number, kind: 'creator_to_brand', issuer: cParty, recipient: bParty,
    issuerUserId: creator._id, recipientUserId: brand._id, brandId: brand._id, creatorId: creator._id,
    deliveryId: delivery._id, campaignId: delivery.campaignId?._id || delivery.campaignId, source,
    lines: [{ label, quantity: 1, unitHT: r2(amounts.ht), totalHT: r2(amounts.ht) }],
    totals: { ht: r2(amounts.ht), vatRate: franchise ? 0 : amounts.vatRate, vat: r2(amounts.vat), ttc: r2(amounts.ttc) },
    vatNote: franchise ? 'TVA non applicable, art. 293 B du CGI.' : null,
    mandate: true,
    paymentNote: `Réglée via ${PLATFORM.brand} (paiement bloqué à la commande, versé à la validation). ${campaignTitle ? `Campagne : ${campaignTitle}.` : ''}`,
  }));
  if (amounts.feeTTC > 0) {
    const cnumber = await nextNumber('platform', 'NC-F');
    out.push(await persist({
      number: cnumber, kind: 'commission', issuer: platformParty(), recipient: cParty,
      issuerUserId: null, recipientUserId: creator._id, brandId: brand._id, creatorId: creator._id,
      deliveryId: delivery._id, campaignId: delivery.campaignId?._id || delivery.campaignId, source,
      lines: [{ label: `Commission d'intermédiation ${PLATFORM.brand} — ${label}`, quantity: 1, unitHT: r2(amounts.feeHT), totalHT: r2(amounts.feeHT) }],
      totals: { ht: r2(amounts.feeHT), vatRate: platformVat(), vat: r2(amounts.feeVat), ttc: r2(amounts.feeTTC) },
      vatNote: null, mandate: false,
      paymentNote: 'Réglée par compensation sur le montant versé au créateur.',
    }));
  }
  return out;
}

/** Facture NeedCreator → marque (frais gifting, pack prêt à diffuser) */
export async function issuePlatformInvoice({ delivery, brand, label, ht, ttc, source }) {
  if (!(ttc > 0)) return null;
  const number = await nextNumber('platform', 'NC-F');
  return persist({
    number, kind: 'platform_to_brand', issuer: platformParty(), recipient: brandParty(brand),
    issuerUserId: null, recipientUserId: brand._id, brandId: brand._id, creatorId: delivery.creatorId?._id || delivery.creatorId,
    deliveryId: delivery._id, campaignId: delivery.campaignId?._id || delivery.campaignId, source,
    lines: [{ label, quantity: 1, unitHT: r2(ht), totalHT: r2(ht) }],
    totals: { ht: r2(ht), vatRate: platformVat(), vat: r2(ttc - ht), ttc: r2(ttc) },
    vatNote: null, mandate: false, paymentNote: 'Réglée par carte via Stripe.',
  });
}

/**
 * Factures d'une mission validée (appelée après capture du paiement). Idempotent par mission et source.
 */
export async function issueMissionInvoices(delivery, { source = 'mission' } = {}) {
  try {
    const exists = await Invoice.exists({ deliveryId: delivery._id, source });
    if (exists) return [];
    const [creator, brand, campaign] = await Promise.all([
      mongoose.model('User').findById(delivery.creatorId?._id || delivery.creatorId).select('email profile legalInfo'),
      mongoose.model('User').findById(delivery.brandId?._id || delivery.brandId).select('email profile'),
      mongoose.model('Campaign').findById(delivery.campaignId?._id || delivery.campaignId).select('title type'),
    ]);
    if (!creator || !brand) return [];
    const p = delivery.payment || {};
    const title = campaign?.title || 'Mission';
    if (campaign?.type === 'gifting' || !(p.creatorAmount > 0)) {
      const inv = await issuePlatformInvoice({ delivery, brand, label: `Frais de service campagne gifting — ${title}`, ht: p.amountHT ?? p.platformFeeHT ?? p.amount, ttc: p.amount, source: 'gifting' });
      return inv ? [inv] : [];
    }
    return issueCreatorInvoices({
      delivery, creator, brand, campaignTitle: title, source,
      label: `Création de contenu vidéo UGC — ${title}`,
      amounts: { ht: p.amountHT ?? p.amount, vatRate: p.vatRate || 0, vat: p.vatAmount || 0, ttc: p.amount, feeHT: p.platformFeeHT || 0, feeVat: p.platformFeeVat || 0, feeTTC: p.platformFee || 0 },
    });
  } catch (err) {
    logger.error(`issueMissionInvoices failed for ${delivery._id}: ${err?.message || err}`);
    return [];
  }
}

/** Natures visibles par un rôle (les avoirs suivent la facture qu'ils annulent) */
export function kindsFor(role) {
  return role === 'brand' ? ['creator_to_brand', 'platform_to_brand'] : role === 'creator' ? ['creator_to_brand', 'commission'] : ['creator_to_brand', 'commission', 'platform_to_brand'];
}
export function kindFilter(role) {
  const kinds = kindsFor(role);
  return { $or: [{ kind: { $in: kinds } }, { kind: 'credit_note', originalKind: { $in: kinds } }] };
}

export async function listInvoicesFor(user, { limit = 200 } = {}) {
  const who = user.role === 'admin' ? {} : user.role === 'brand' ? { brandId: user._id } : { creatorId: user._id };
  const q = user.role === 'admin' ? {} : { ...who, ...kindFilter(user.role) };
  return Invoice.find(q).sort({ issuedAt: -1 }).limit(limit).populate('campaignId', 'title').lean();
}


/**
 * Avoir : annule intégralement une facture (montants négatifs), même émetteur, même destinataire.
 * Numérotation : NC-A-AAAA-NNNNNN (NeedCreator) ou AV-XXXXXX-AAAA-NNNN (créateur, par mandat).
 */
export async function issueCreditNote(invoiceId, { reason = '', userId = null } = {}) {
  const original = await Invoice.findById(invoiceId);
  if (!original) throw new Error('Facture introuvable');
  if (original.kind === 'credit_note') throw new Error('Un avoir ne peut pas être annulé par un avoir');
  if (original.creditedBy) throw new Error('Cette facture a déjà été annulée par un avoir');
  const byCreator = original.kind === 'creator_to_brand';
  const number = byCreator
    ? await nextNumber(`creator:${original.creatorId}:credit`, `AV-${shortId(original.creatorId)}`, 4)
    : await nextNumber('platform:credit', 'NC-A');
  const neg = (n) => -r2(n);
  const credit = new Invoice({
    number, kind: 'credit_note', originalKind: original.kind, creditOf: original._id, reason,
    issuer: original.issuer, recipient: original.recipient,
    issuerUserId: original.issuerUserId, recipientUserId: original.recipientUserId,
    brandId: original.brandId, creatorId: original.creatorId, deliveryId: original.deliveryId, campaignId: original.campaignId, source: original.source,
    lines: original.lines.map(l => ({ label: `Annulation — ${l.label}`, quantity: l.quantity, unitHT: neg(l.unitHT), totalHT: neg(l.totalHT) })),
    totals: { ht: neg(original.totals.ht), vatRate: original.totals.vatRate, vat: neg(original.totals.vat), ttc: neg(original.totals.ttc) },
    vatNote: original.vatNote, mandate: original.mandate, paymentNote: 'Avoir : montant restitué ou compensé selon le remboursement effectué.',
  });
  credit.creditNumber = original.number; // utilisé par le PDF (non persisté)
  const pdf = await renderInvoicePdf(credit);
  const { url } = await uploadFile(pdf, `avoir-${credit.number}.pdf`, 'application/pdf', `invoices/${credit.deliveryId || 'divers'}`);
  credit.pdfUrl = url;
  await credit.save();
  original.creditedBy = credit._id;
  await original.save();
  logger.info(`Credit note ${credit.number} issued for ${original.number} (${reason || 'sans motif'}) by ${userId || 'system'}`);
  return credit;
}

/** Avoirs automatiques sur toutes les factures d'une mission (remboursement après encaissement) */
export async function creditDeliveryInvoices(deliveryId, reason) {
  const invoices = await Invoice.find({ deliveryId, kind: { $ne: 'credit_note' }, creditedBy: null });
  const out = [];
  for (const inv of invoices) {
    try { out.push(await issueCreditNote(inv._id, { reason })); } catch (err) { logger.warn(`Avoir non émis pour ${inv.number}: ${err.message}`); }
  }
  return out;
}

/**
 * Relevé mensuel (PDF généré à la volée) : factures du mois de l'utilisateur, totaux, net.
 * month = 'AAAA-MM'
 */
export async function renderStatementPdf(user, month) {
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1), to = new Date(y, m, 1);
  const kinds = user.role === 'brand' ? ['creator_to_brand', 'platform_to_brand', 'credit_note'] : ['creator_to_brand', 'commission', 'credit_note'];
  const q = user.role === 'brand' ? { brandId: user._id } : { creatorId: user._id };
  const invoices = await Invoice.find({ ...q, kind: { $in: kinds }, issuedAt: { $gte: from, $lt: to } }).sort({ issuedAt: 1 }).populate('campaignId', 'title').lean();
  const isBrand = user.role === 'brand';
  const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const sum = (arr, f) => r2(arr.reduce((a, i) => a + (f(i) || 0), 0));
  const sales = invoices.filter(i => i.kind === 'creator_to_brand' || (i.kind === 'credit_note' && i.originalKind === 'creator_to_brand'));
  const fees = invoices.filter(i => i.kind === 'commission' || (i.kind === 'credit_note' && i.originalKind === 'commission'));
  const services = invoices.filter(i => i.kind === 'platform_to_brand' || (i.kind === 'credit_note' && i.originalKind === 'platform_to_brand'));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Relevé ${month}`, Author: PLATFORM.brand } });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111').text(`Relevé ${isBrand ? 'de factures' : "d'activité"} — ${label}`);
    const party = isBrand ? brandParty(user) : creatorParty(user);
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`${party.legalName && party.legalName !== party.name ? party.legalName + ' · ' : ''}${party.name}${party.siret ? ` · SIRET ${party.siret}` : ''}${party.vatNumber ? ` · TVA ${party.vatNumber}` : ''}`);
    doc.text(`Établi le ${fmtDate(new Date())} par ${PLATFORM.brand} (${PLATFORM.name}). Document récapitulatif, sans valeur de facture : les factures listées font foi.`);
    doc.moveDown(1);

    const table = (title, rows) => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(title); doc.moveDown(0.3);
      if (!rows.length) { doc.font('Helvetica').fontSize(10).fillColor('#666').text('Aucune.'); doc.moveDown(0.8); return; }
      const cols = { date: 50, num: 120, camp: 250, ht: 400, vat: 450, ttc: 500 };
      let y = doc.y;
      doc.rect(50, y - 3, 495, 16).fill('#f1f5f4'); doc.fillColor('#111').font('Helvetica-Bold').fontSize(8);
      doc.text('Date', cols.date, y); doc.text('Numéro', cols.num, y); doc.text('Campagne', cols.camp, y); doc.text('HT', cols.ht, y); doc.text('TVA', cols.vat, y); doc.text('TTC', cols.ttc, y);
      y += 18; doc.font('Helvetica').fontSize(8.5).fillColor('#222');
      for (const i of rows) {
        if (y > 740) { doc.addPage(); y = 50; }
        doc.text(new Date(i.issuedAt).toLocaleDateString('fr-FR'), cols.date, y); doc.text(i.number, cols.num, y, { width: 125 });
        doc.text((i.campaignId?.title || '—').slice(0, 34), cols.camp, y, { width: 145 });
        doc.text(fmt(i.totals.ht), cols.ht, y); doc.text(fmt(i.totals.vat), cols.vat, y); doc.text(fmt(i.totals.ttc), cols.ttc, y);
        y += 14;
      }
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke(); y += 6;
      doc.font('Helvetica-Bold').fontSize(9).text('Total', cols.camp, y); doc.text(fmt(sum(rows, r => r.totals.ht)), cols.ht, y); doc.text(fmt(sum(rows, r => r.totals.vat)), cols.vat, y); doc.text(fmt(sum(rows, r => r.totals.ttc)), cols.ttc, y);
      doc.y = y + 20; doc.x = 50;
    };
    if (isBrand) {
      table('Factures des créateurs (missions)', sales);
      table('Factures NeedCreator (services)', services);
      doc.font('Helvetica-Bold').fontSize(11).text(`Total du mois : ${fmt(sum(invoices, i => i.totals.ttc))} TTC (${fmt(sum(invoices, i => i.totals.ht))} HT, TVA ${fmt(sum(invoices, i => i.totals.vat))})`);
    } else {
      table('Vos factures aux marques (émises en votre nom)', sales);
      table('Commissions NeedCreator (réglées par compensation)', fees);
      const ca = sum(sales, i => i.totals.ht), vat = sum(sales, i => i.totals.vat), feeTTC = sum(fees, i => i.totals.ttc), net = r2(sum(sales, i => i.totals.ttc) - feeTTC);
      doc.font('Helvetica-Bold').fontSize(11).text(`Chiffre d'affaires facturé : ${fmt(ca)} HT${vat ? ` · TVA collectée : ${fmt(vat)}` : ''}`);
      doc.text(`Commissions NeedCreator : ${fmt(feeTTC)} TTC · Net versé sur votre compte Stripe : ${fmt(net)}`);
      if (!party.vatRegistered) { doc.moveDown(0.4); doc.font('Helvetica').fontSize(9).fillColor('#555').text('Franchise en base de TVA (art. 293 B du CGI) : à déclarer dans vos recettes selon votre régime. La TVA figurant sur les commissions NeedCreator est un coût, non récupérable.'); }
    }
    doc.end();
  });
}
