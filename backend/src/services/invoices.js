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
  kind: { type: String, enum: ['creator_to_brand', 'commission', 'platform_to_brand'], required: true },
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

    const isCredit = false;
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
      inv.kind === 'creator_to_brand'
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

export async function listInvoicesFor(user, { limit = 200 } = {}) {
  const q = user.role === 'admin' ? {} : user.role === 'brand' ? { brandId: user._id, kind: { $in: ['creator_to_brand', 'platform_to_brand'] } } : { creatorId: user._id, kind: { $in: ['creator_to_brand', 'commission'] } };
  return Invoice.find(q).sort({ issuedAt: -1 }).limit(limit).populate('campaignId', 'title').lean();
}
