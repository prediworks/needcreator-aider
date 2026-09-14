import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';

const RIGHTS_DURATION = { '6m': '6 mois', '1y': '1 an', '2y': '2 ans', '3y': '3 ans', unlimited: 'illimitée' };
const SUPPORTS = { social_organic: 'réseaux sociaux (organique)', paid_ads: 'publicité payante', website: 'site web / page produit', email: 'emailing', marketplace: 'marketplaces', tv: 'TV / affichage', other: 'autre' };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => `${r2(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/** Devis PDF d'un créateur pour un client extérieur (devis, pas facture : aucune obligation de numérotation continue) */
export function renderQuotePdf({ number, creator, creatorLegal, client, mission, quote, payLink }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Devis ${number}`, Author: creator.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text('DEVIS', { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`N° ${number}`, { align: 'right' }).text(`Date : ${fmtDate(new Date())}`, { align: 'right' }).text(`Valable jusqu'au ${fmtDate(quote.validUntil)}`, { align: 'right' });
    doc.moveDown(1.2);
    const top = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Prestataire', 50, top);
    doc.font('Helvetica').fontSize(10).fillColor('#222');
    [creatorLegal.name, creatorLegal.companyName, creatorLegal.address, creatorLegal.siret ? `SIRET ${creatorLegal.siret}` : null, creatorLegal.vatNumber ? `TVA ${creatorLegal.vatNumber}` : (creatorLegal.vatRegistered ? null : 'TVA non applicable, art. 293 B du CGI'), creator.email].filter(Boolean).forEach(l => doc.text(l, 50, undefined, { width: 230 }));
    const y1 = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Client', 320, top);
    doc.font('Helvetica').fontSize(10).fillColor('#222');
    [client.companyName, client.contactName, client.address, client.siret ? `SIRET ${client.siret}` : null, client.email].filter(Boolean).forEach(l => doc.text(l, 320, undefined, { width: 230 }));
    doc.y = Math.max(y1, doc.y) + 14; doc.x = 50;

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(mission.title, 50, doc.y, { width: 495 });
    if (mission.description) { doc.moveDown(0.3); doc.font('Helvetica').fontSize(10).fillColor('#333').text(mission.description, { width: 495 }); }
    doc.moveDown(0.8);
    const rows = [
      ['Livrable', `${mission.deliverables} vidéo${mission.deliverables > 1 ? 's' : ''} · ${mission.videoType || 'vidéo'} · ${mission.duration || 30} s${mission.platforms?.length ? ` · ${mission.platforms.join(', ')}` : ''}`],
      ['Délai de livraison', `${quote.estimatedDeliveryDays} jour${quote.estimatedDeliveryDays > 1 ? 's' : ''} après acceptation${mission.productShipping ? ' et réception du produit' : ''}`],
      ['Révisions incluses', String(quote.revisions ?? 0)],
      ['Droits cédés', `${RIGHTS_DURATION[quote.rights?.duration] || '1 an'} · ${(quote.rights?.supports || []).map(s => SUPPORTS[s] || s).join(', ') || 'réseaux sociaux'} · ${quote.rights?.territories || 'France'}${quote.rights?.exclusivity ? ` · exclusivité ${quote.rights.exclusivityMonths || ''} mois` : ''}`],
    ];
    if (quote.terms) rows.push(['Conditions', quote.terms]);
    rows.forEach(([k, v]) => { doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(`${k} : `, 50, doc.y, { continued: true }); doc.font('Helvetica').fillColor('#222').text(v, { width: 495 }); doc.moveDown(0.2); });
    doc.moveDown(0.8);
    const vat = r2(quote.price * (quote.vatRate || 0) / 100);
    doc.font('Helvetica').fontSize(10).fillColor('#222').text(`Prix HT : ${fmt(quote.price)}`, 320, doc.y, { align: 'right', width: 225 });
    if (quote.vatRate) { doc.text(`TVA ${quote.vatRate} % : ${fmt(vat)}`, 320, undefined, { align: 'right', width: 225 }); }
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(`Total ${quote.vatRate ? 'TTC' : ''} : ${fmt(quote.price + vat)}`, 320, undefined, { align: 'right', width: 225 });
    doc.moveDown(1.2); doc.x = 50;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Règlement', 50, doc.y);
    doc.font('Helvetica').fontSize(10).fillColor('#222').text(`Paiement sécurisé via NeedCreator : le montant est bloqué à l'acceptation et versé au prestataire après validation des vidéos, un contrat de cession de droits est généré automatiquement. Lien : ${payLink}`, { width: 495 });
    doc.moveDown(0.4);
    doc.fillColor('#555').fontSize(9).text(`Devis établi avec NeedCreator (${config.cors.origin}). Ce document n'est pas une facture.`, { width: 495 });
    doc.end();
  });
}
