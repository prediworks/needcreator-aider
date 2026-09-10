import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { uploadFile } from './storage.js';
import logger from '../utils/logger.js';

const DURATIONS = { '6m': '6 mois', '1y': '1 an', '2y': '2 ans', '3y': '3 ans', unlimited: 'illimitée' };
const SUPPORTS = {
  social_organic: 'réseaux sociaux (publications organiques)', paid_ads: 'publicité payante (social ads)', website: 'site web de la marque',
  email: 'emailing', marketplace: 'marketplaces et fiches produit', tv: 'télévision / vidéo hors ligne', other: 'autres supports convenus',
};
const VIDEO_TYPES = { testimonial: 'témoignage', unboxing: 'unboxing', demo: 'démonstration', tutorial: 'tutoriel', review: 'avis', lifestyle: 'lifestyle', other: 'vidéo UGC' };
const STATUS = { micro: 'micro-entrepreneur', company: 'société', individual: 'particulier' };

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtEur = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`;

export function contractNumber(prefix = 'NC') {
  return `${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function creatorAddress(li) {
  const a = li?.address || {};
  return [a.line1, a.line2, `${a.postalCode || ''} ${a.city || ''}`.trim(), a.country].filter(Boolean).join(', ');
}

/**
 * Photographie des parties et du devis au moment de l'acceptation (stockée sur la livraison)
 */
export function buildContractData({ campaign, application, delivery, brand, creator }) {
  const bli = brand.legalInfo || {};
  const cli = creator.legalInfo || {};
  const q = application?.quote || {};
  return {
    number: contractNumber(),
    termsVersion: config.legal.termsVersion,
    parties: {
      brand: {
        legalName: brand.profile?.company?.legalName || brand.profile?.companyName,
        siret: brand.profile?.company?.siret || null,
        vatNumber: brand.profile?.company?.vatNumber || null,
        address: brand.profile?.company?.registryAddress || null,
        signatoryName: bli.signatoryName || null,
        signatoryTitle: bli.signatoryTitle || null,
        email: brand.email,
      },
      creator: {
        name: [cli.firstName, cli.lastName].filter(Boolean).join(' ') || creator.profile?.name,
        status: cli.status || null,
        companyName: cli.status === 'company' ? (cli.legalName || cli.companyName || null) : (cli.legalName || null),
        siret: cli.siret || null,
        address: creatorAddress(cli) || cli.registryAddress || null,
        email: creator.email,
      },
    },
    mission: {
      title: campaign.title,
      deliverables: campaign.brief?.deliverables || 1,
      videoType: campaign.brief?.videoType || null,
      estimatedDeliveryDays: application?.estimatedDeliveryDays || delivery.estimatedDeliveryDays || null,
      revisions: q.revisions ?? config.business.maxRevisions,
      terms: q.terms || null,
      // Photographie du brief au moment de l'acceptation (annexe du contrat)
      brief: {
        description: campaign.description || null,
        duration: campaign.brief?.duration || null,
        platforms: campaign.brief?.platforms || [],
        requirements: campaign.brief?.requirements || [],
        dos: campaign.brief?.dosDonts?.dos || [],
        donts: campaign.brief?.dosDonts?.donts || [],
        productDescription: campaign.brief?.productDescription || null,
        productShipping: !!campaign.brief?.productShipping,
        script: campaign.brief?.script || null,
        hashtags: campaign.brief?.hashtags || [],
        mentions: campaign.brief?.mentions || [],
        deliveryTypes: campaign.brief?.deliveryTypes || [],
      },
    },
    rights: {
      duration: q.rights?.duration || '1y',
      supports: q.rights?.supports?.length ? q.rights.supports : ['social_organic'],
      territories: q.rights?.territories || 'France',
      exclusivity: !!q.rights?.exclusivity,
      exclusivityMonths: q.rights?.exclusivityMonths || null,
    },
    price: delivery.payment?.quotePrice || application?.price || delivery.payment?.amount || 0,
    discountPercent: delivery.payment?.discountPercent || 0,
    discountAmount: delivery.payment?.discountAmount || 0,
    paidPrice: delivery.payment?.amount || application?.price || 0,
    isGifting: campaign.type === 'gifting',
    giftingProduct: campaign.gifting?.productName || null,
    acceptedAt: application?.quote?.acceptedAt || new Date(),
  };
}

function renderPdf(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: 'Contrat de mission NeedCreator', Author: 'NeedCreator' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

const H = (doc, t) => { doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor('#111').text(t); doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#222'); };
const P = (doc, t) => doc.font('Helvetica').fontSize(10).fillColor('#222').text(t, { align: 'justify', lineGap: 2 });
const KV = (doc, k, v) => { if (v === null || v === undefined || v === '') return; doc.font('Helvetica-Bold').fontSize(10).text(`${k} : `, { continued: true }).font('Helvetica').text(String(v)); };

function header(doc, title, number) {
  doc.rect(0, 0, doc.page.width, 6).fill('#05ddb2');
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#05a887').text('NEEDCREATOR', { characterSpacing: 1.5 });
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(18).fillColor('#111').text(title);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(`Référence ${number}`);
  doc.moveDown(0.5);
}

function footer(doc, number) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Écrire dans la marge basse sans déclencher de nouvelle page
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#888')
      .text(`${number} · Document généré par la plateforme NeedCreator (${config.cors.origin}), intermédiaire technique, non partie au contrat · page ${i + 1}/${range.count}`,
        56, doc.page.height - 40, { width: doc.page.width - 112, align: 'center', lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

function partiesBlock(doc, parties) {
  const b = parties.brand, c = parties.creator;
  H(doc, '1. Parties');
  doc.font('Helvetica-Bold').text('La Marque (le Client)');
  KV(doc, 'Dénomination', b.legalName);
  KV(doc, 'SIRET', b.siret); KV(doc, 'TVA intracommunautaire', b.vatNumber);
  KV(doc, 'Siège', b.address);
  KV(doc, 'Représentée par', [b.signatoryName, b.signatoryTitle].filter(Boolean).join(', '));
  KV(doc, 'Email', b.email);
  doc.moveDown(0.5).font('Helvetica-Bold').text('Le Créateur (le Prestataire)');
  KV(doc, 'Nom', c.name);
  KV(doc, 'Statut', STATUS[c.status] || c.status);
  KV(doc, 'Raison sociale', c.companyName);
  KV(doc, 'SIRET', c.siret);
  KV(doc, 'Adresse', c.address);
  KV(doc, 'Email', c.email);
  if (c.status === 'individual') P(doc, 'Le Créateur déclare agir à titre occasionnel et faire son affaire de la déclaration des revenus perçus.');
}

function rightsText(rights) {
  const dur = DURATIONS[rights.duration] || rights.duration;
  const supports = (rights.supports || []).map(s => SUPPORTS[s] || s).join(', ');
  let t = `Le Créateur cède à la Marque, à compter de la validation de la livraison, le droit de reproduire, représenter, diffuser et adapter (recadrage, sous-titrage, montage court) les contenus livrés, pour une durée ${dur === 'illimitée' ? 'illimitée' : `de ${dur}`}, sur les supports suivants : ${supports}, pour le territoire suivant : ${rights.territories || 'France'}.`;
  t += rights.exclusivity
    ? ` Le Créateur s'engage à une exclusivité de ${rights.exclusivityMonths || 12} mois : il ne produira pas de contenu pour une marque directement concurrente pendant cette période.`
    : ' Aucune exclusivité n\'est consentie : le Créateur reste libre de collaborer avec d\'autres marques.';
  t += ' Le Créateur conserve le droit de présenter les contenus dans son portfolio, sauf demande contraire de la Marque formulée via la plateforme. Toute utilisation au-delà de la durée, des supports ou du territoire convenus nécessite une prolongation acceptée par le Créateur.';
  return t;
}

/**
 * Génère le PDF du contrat de mission et de cession de droits
 */
export async function generateContractPdf(data) {
  return renderPdf((doc) => {
    header(doc, 'Contrat de mission et cession de droits', data.number);
    P(doc, `Établi le ${fmtDate(data.acceptedAt)} sur la plateforme NeedCreator, par acceptation en ligne du devis du Créateur par la Marque. Les deux parties ont accepté les conditions générales d'utilisation de la plateforme (version du ${data.termsVersion}), qui complètent le présent contrat.`);
    partiesBlock(doc, data.parties);

    H(doc, '2. Objet de la mission');
    KV(doc, 'Campagne', data.mission.title);
    KV(doc, 'Contenu attendu', `${data.mission.deliverables} vidéo(s) ${VIDEO_TYPES[data.mission.videoType] || 'UGC'}`);
    if (data.mission.estimatedDeliveryDays) KV(doc, 'Délai de livraison', `${data.mission.estimatedDeliveryDays} jours à compter de la sélection${data.isGifting ? ' (ou de la réception du produit)' : ''}`);
    KV(doc, 'Révisions incluses', data.mission.revisions);
    if (data.mission.terms) KV(doc, 'Conditions particulières du Créateur', data.mission.terms);
    P(doc, 'Le Créateur réalise les contenus conformément au brief de la campagne consultable sur la plateforme. La Marque dispose de 7 jours après chaque livraison pour la valider ou demander une révision ; sans réponse dans ce délai, la livraison est réputée acceptée.');

    H(doc, '3. Prix et paiement');
    if (data.isGifting) {
      P(doc, `Campagne gifting : la Marque remet au Créateur le produit « ${data.giftingProduct || 'produit offert'} » en contrepartie des contenus. Aucune rémunération monétaire n'est due au Créateur. La Marque règle à la plateforme les frais de service prévus par les conditions générales.`);
    } else {
      KV(doc, 'Prix de la mission (devis accepté)', fmtEur(data.price));
      if (data.discountAmount > 0) {
        KV(doc, `Remise parrainage NeedCreator (${data.discountPercent} %)`, `− ${fmtEur(data.discountAmount)}`);
        KV(doc, 'Prix payé par la Marque', fmtEur(data.paidPrice));
        P(doc, 'La remise est accordée par la plateforme sur sa commission ; la rémunération du Créateur reste calculée sur le prix du devis.');
      }
      P(doc, 'Le prix est bloqué par la Marque sur la plateforme à l\'acceptation du devis et débité à la validation de la livraison. Il est versé au Créateur, déduction faite de la commission de la plateforme prévue par les conditions générales, par virement sur son compte de paiement. Le Créateur établit, s\'il y est tenu, la facture correspondante à la Marque.');
    }

    H(doc, '4. Cession de droits d\'utilisation');
    P(doc, rightsText(data.rights));

    H(doc, '5. Garanties');
    P(doc, 'Le Créateur garantit être l\'auteur des contenus et disposer des autorisations nécessaires (personnes filmées, musiques, lieux). Il respecte les règles applicables à la publicité et aux partenariats commerciaux. La Marque garantit disposer des droits sur les produits et éléments de marque fournis. Chaque partie est responsable de ses obligations fiscales et sociales.');

    H(doc, '6. Litiges');
    P(doc, 'Les parties recherchent une solution amiable via la plateforme. À défaut, le droit français s\'applique et les tribunaux compétents sont ceux du siège de la Marque. La plateforme NeedCreator, intermédiaire technique, n\'est pas partie au présent contrat.');

    H(doc, '7. Acceptation');
    P(doc, `Contrat conclu par acceptation électronique du devis sur la plateforme le ${fmtDate(data.acceptedAt)} (horodatage et journal conservés par NeedCreator), valant signature des deux parties au sens de l'article 1367 du Code civil.`);
    briefAnnex(doc, data);
    footer(doc, data.number);
  });
}

const PLATFORM_LABELS = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X', website: 'site web', other: 'autre' };

/** Annexe : le brief de la campagne tel qu'accepté */
function briefAnnex(doc, data) {
  const b = data.mission?.brief;
  if (!b) return;
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111').text('Annexe : brief de la campagne');
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(`Contrat ${data.number} · brief tel qu'accepté le ${fmtDate(data.acceptedAt)}`);
  doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#222');
  KV(doc, 'Campagne', data.mission.title);
  KV(doc, 'Contenu attendu', `${data.mission.deliverables} vidéo(s) ${VIDEO_TYPES[data.mission.videoType] || 'UGC'}${b.duration ? `, environ ${b.duration} secondes` : ''}`);
  if (b.platforms?.length) KV(doc, 'Réseaux de diffusion', b.platforms.map(p => PLATFORM_LABELS[p] || p).join(', '));
  if (b.deliveryTypes?.length) KV(doc, 'Mode de livraison', b.deliveryTypes.map(t => (t === 'file' ? 'fichier vidéo' : 'lien publié')).join(' ou '));
  if (b.productShipping) KV(doc, 'Produit', `envoyé au Créateur avant la production${b.productDescription ? ` (${b.productDescription})` : ''}`);
  else if (b.productDescription) KV(doc, 'Produit / service', b.productDescription);
  if (b.description) { H(doc, 'Description'); P(doc, b.description); }
  const list = (title, items) => { if (items?.length) { H(doc, title); items.forEach(i => doc.font('Helvetica').fontSize(10).fillColor('#222').text(`• ${i}`, { indent: 8, lineGap: 2 })); } };
  list('Consignes', b.requirements);
  list('À faire', b.dos);
  list('À éviter', b.donts);
  if (b.script) { H(doc, 'Script proposé'); P(doc, b.script); }
  if (b.hashtags?.length || b.mentions?.length) {
    H(doc, 'Hashtags et mentions');
    P(doc, [...(b.hashtags || []).map(h => `#${h.replace(/^#/, '')}`), ...(b.mentions || []).map(m => `@${m.replace(/^@/, '')}`)].join(' '));
  }
}

/**
 * Avenant de prolongation des droits
 */
export async function generateAddendumPdf({ contract, addendum, parties }) {
  return renderPdf((doc) => {
    header(doc, 'Avenant : prolongation des droits d\'utilisation', addendum.number);
    P(doc, `Avenant au contrat ${contract.number} établi le ${fmtDate(addendum.generatedAt)} sur la plateforme NeedCreator.`);
    partiesBlock(doc, parties);
    H(doc, '2. Objet');
    P(doc, `Les droits d'utilisation cédés au titre du contrat ${contract.number} (${(contract.rights?.supports || []).map(s => SUPPORTS[s] || s).join(', ')} ; territoire : ${contract.rights?.territories || 'France'}) sont prolongés pour une durée ${addendum.duration === 'unlimited' ? 'illimitée' : `de ${DURATIONS[addendum.duration] || addendum.duration}`}, à compter du ${fmtDate(addendum.previousEndAt || addendum.generatedAt)}.${addendum.newEndAt ? ` Nouvelle date de fin des droits : ${fmtDate(addendum.newEndAt)}.` : ' Les droits deviennent illimités dans le temps.'}`);
    H(doc, '3. Prix');
    KV(doc, 'Prix de la prolongation', fmtEur(addendum.price));
    P(doc, 'Réglé par la Marque sur la plateforme à l\'acceptation de la proposition du Créateur, et versé au Créateur déduction faite de la commission de la plateforme.');
    H(doc, '4. Acceptation');
    P(doc, `Avenant conclu par acceptation électronique sur la plateforme le ${fmtDate(addendum.generatedAt)}, valant signature des deux parties. Les autres clauses du contrat ${contract.number} restent inchangées.`);
    footer(doc, addendum.number);
  });
}

/**
 * Génère, stocke et rattache le contrat à la livraison
 */
export async function attachContract(delivery, ctx) {
  const data = buildContractData({ ...ctx, delivery });
  const pdf = await generateContractPdf(data);
  const { url } = await uploadFile(pdf, `contrat-${data.number}.pdf`, 'application/pdf', `contracts/${delivery._id}`);
  delivery.contract = {
    number: data.number,
    url,
    generatedAt: new Date(),
    termsVersion: data.termsVersion,
    parties: data.parties,
    mission: data.mission,
    rights: data.rights,
    addenda: [],
  };
  logger.info(`Contrat ${data.number} généré pour la livraison ${delivery._id}`);
  return delivery.contract;
}
