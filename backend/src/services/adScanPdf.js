import PDFDocument from 'pdfkit';
import { config } from '../config/index.js';
import { countPhrase } from '../utils/adCount.js';

/**
 * PDF d'un scan (publicités d'une marque) ou de son audit, fabriqué à la volée depuis la lecture enregistrée : rien n'est redemandé à Meta
 * ni à l'IA. `view` est la lecture déjà filtrée selon le visiteur (serializeScan) : un visiteur sans compte obtient ce qu'il voit à l'écran,
 * un compte ou l'équipe obtient tout. Sert à transférer le rapport à un responsable, ou à le joindre à une relance personnelle.
 */
const GREEN = '#04b894';
const DARK = '#111111';
const GREY = '#555555';
const LIGHT = '#888888';
const VIDEO_TYPE = { testimonial: 'Témoignage', unboxing: 'Unboxing', demo: 'Démonstration', tutorial: 'Tutoriel', review: 'Avis', comparison: 'Comparatif', lifestyle: 'Lifestyle', 'behind-the-scenes': 'Coulisses' };
const GUARANTEE = 'Paiement bloqué jusqu\'à votre validation de la vidéo : révisions incluses, remboursé si le créateur ne livre pas.';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
// Police standard du PDF (WinAnsi) : émojis et symboles rares retirés, guillemets et tirets conservés
const clean = (t, max = 0) => {
  let s = String(t || '').replace(/[‘’]/g, '\'').replace(/[^\u0000-ÿ€“”–—…Œœ]/g, '').replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = `${s.slice(0, max - 1).trim()}…`;
  return s;
};

function verdictOf(over90, oldestDays) {
  if (over90 > 1) return `${over90} publicités tournent depuis plus de 90 jours : ce sont celles qui rapportent.`;
  if (over90 === 1) return 'Une publicité tourne depuis plus de 90 jours : c\'est celle qui rapporte.';
  return oldestDays != null ? `La plus ancienne tourne depuis ${oldestDays} jours : aucune ne passe encore les 90 jours.` : '';
}

export function renderScanPdf({ scan, view, examples, audit = false, link }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: clean(`${audit ? 'Audit publicitaire' : 'Publicités'} · ${scan.pageName}`), Author: 'NeedCreator' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 100;
    const h2 = (t) => { if (doc.y > doc.page.height - 140) doc.addPage(); doc.moveDown(0.9); doc.font('Helvetica-Bold').fontSize(12.5).fillColor(DARK).text(clean(t)); doc.moveDown(0.3); };
    const p = (t, { size = 10, color = GREY, font = 'Helvetica', gap = 0.25 } = {}) => { doc.font(font).fontSize(size).fillColor(color).text(clean(t), { width: W }); doc.moveDown(gap); };
    const bullet = (t, sub = '') => { doc.font('Helvetica').fontSize(10).fillColor(DARK).text(`•  ${clean(t)}`, { width: W, indent: 0 }); if (sub) doc.font('Helvetica').fontSize(9).fillColor(LIGHT).text(clean(sub), { width: W - 12, indent: 12 }); doc.moveDown(0.25); };

    // En-tête
    doc.font('Helvetica-Bold').fontSize(16).fillColor(GREEN).text('NeedCreator', 50, 45);
    doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT).text('Vidéos UGC tournées par des créateurs vérifiés · needcreator.com', 50, 64);
    doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT).text(`Édité le ${fmtDate(new Date())}`, 50, 45, { width: W, align: 'right' });
    doc.moveTo(50, 82).lineTo(50 + W, 82).strokeColor('#e5e5e5').lineWidth(1).stroke();
    doc.y = 98;

    doc.font('Helvetica-Bold').fontSize(21).fillColor(DARK).text(clean(audit ? `Audit publicitaire : ${scan.pageName}` : `Les publicités de ${scan.pageName}`), 50, doc.y, { width: W });
    p(`Publicités Meta actives en France, lues le ${fmtDate(view.fetchedAt)}${view.website ? ` · ${view.website.replace(/^https?:\/\/(www\.)?/, '')}` : ''}`, { size: 9, color: LIGHT, gap: 0.6 });

    // Chiffres
    const st = view.stats || {};
    const boxes = [
      ['Publicités', countPhrase(scan)],
      ['La plus ancienne', st.oldestDays != null ? `${st.oldestDays} jours` : '—'],
      ['Depuis plus de 90 jours', String(st.over90Days ?? 0)],
    ];
    const bw = (W - 20) / 3; const by = doc.y;
    boxes.forEach(([label, value], i) => {
      const x = 50 + i * (bw + 10);
      doc.roundedRect(x, by, bw, 52, 6).fillColor(i === 2 && (st.over90Days ?? 0) > 0 ? '#ecfdf5' : '#f6f7f8').fill();
      doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(label, x + 10, by + 8, { width: bw - 20 });
      doc.font('Helvetica-Bold').fontSize(i === 0 ? 10 : 15).fillColor(DARK).text(clean(value), x + 10, by + 22, { width: bw - 20 });
    });
    doc.y = by + 64; doc.x = 50;

    const verdict = verdictOf(st.over90Days ?? 0, st.oldestDays);
    if (verdict) p(verdict, { size: 11.5, color: DARK, font: 'Helvetica-Bold', gap: 0.3 });
    const diag = audit ? view.audit?.diagnosis : view.insights?.summary;
    if (diag) p(diag, { size: 10, color: GREY, gap: 0.2 });

    // Ce qui dure / lecture
    if (audit && view.audit?.lasting?.length) { h2('Ce qui marche dans la durée'); view.audit.lasting.forEach(l => bullet(typeof l === 'string' ? l : l.text || l.note || '')); }
    if (audit && view.audit?.overused?.length) { h2('Les angles que vous répétez'); view.audit.overused.forEach(o => bullet(`${o.angle} · ${o.count} publicité${o.count > 1 ? 's' : ''}`, o.note)); }
    if (audit && view.audit?.missing?.length) { h2('Les angles que vous n\'utilisez pas'); view.audit.missing.forEach(o => bullet(o.angle, o.why)); }
    if (audit && view.audit?.hooks?.length) { h2('Cinq accroches pour les trois premières secondes'); view.audit.hooks.forEach(hk => bullet(`« ${hk} »`)); }
    if (!audit && view.insights?.angles?.length) { h2('Les angles utilisés'); view.insights.angles.forEach(a => bullet(`${a.name} · ${a.count} publicité${a.count > 1 ? 's' : ''}`, a.example ? `« ${clean(a.example, 160)} »` : '')); }
    if (!audit && view.insights?.hooks?.length) { h2('Les accroches qui reviennent'); view.insights.hooks.forEach(hk => bullet(`« ${hk} »`)); }
    if (!audit && view.insights?.missing?.length) { h2('Les angles que personne n\'utilise'); view.insights.missing.forEach(m => bullet(m)); }

    // Les plus anciennes
    const ads = (view.ads || []).slice(0, 5);
    if (ads.length) {
      h2('Les publicités qui tournent depuis le plus longtemps');
      ads.forEach((a, i) => bullet(`#${i + 1} · depuis ${a.days ?? '?'} jours${a.variants > 1 ? ` · ${a.variants} versions` : ''}`, `« ${clean([a.title, a.body].filter(Boolean).join(' — '), 230)} »`));
    }

    // L'offre
    h2('Ce qu\'un créateur tournerait pour vous');
    const rates = examples?.rates || {};
    if (audit && view.audit?.briefs?.length) {
      view.audit.briefs.forEach(b => {
        if (doc.y > doc.page.height - 150) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(clean(b.title), { width: W });
        doc.font('Helvetica').fontSize(9).fillColor(LIGHT).text(clean(`${b.angle} · ${VIDEO_TYPE[b.videoType] || b.videoType} · ${b.duration} s`), { width: W });
        if (b.hook) doc.font('Helvetica-Oblique').fontSize(10).fillColor(GREY).text(clean(`« ${b.hook} »`), { width: W });
        if (b.why) doc.font('Helvetica').fontSize(9).fillColor(LIGHT).text(clean(b.why), { width: W });
        const r = rates[b.videoType];
        if (r) doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(`${r[0]} à ${r[1]} € HT la vidéo`, { width: W });
        doc.moveDown(0.6);
      });
      if (view.audit.locked?.includes('briefs')) p('Deux autres vidéos à commander, les angles répétés, les angles libres et les accroches : avec un compte gratuit, sur la page de l\'audit.', { size: 9, color: GREEN });
    } else {
      p('La version créateur de sa publicité la plus ancienne : même produit, même promesse, filmée par un créateur, avec un angle que ces publicités n\'utilisent pas.', { size: 10, color: DARK });
      if (examples?.fromPrice) p(`À partir de ${examples.fromPrice} € HT la vidéo.`, { size: 10, color: DARK, font: 'Helvetica-Bold' });
    }
    p('Le brief est préparé gratuitement ; des créateurs vérifiés vous envoient leur devis, vous choisissez.', { size: 9.5, color: GREY, gap: 0.5 });

    // Garantie et lien
    if (doc.y > doc.page.height - 130) doc.addPage();
    const gy = doc.y;
    doc.roundedRect(50, gy, W, 46, 6).fillColor('#ecfdf5').fill();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('Sans risque', 62, gy + 9, { width: W - 24 });
    doc.font('Helvetica').fontSize(9.5).fillColor(GREY).text(GUARANTEE, 62, gy + 24, { width: W - 24 });
    doc.y = gy + 58; doc.x = 50;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(GREEN).text('Préparer le brief gratuitement, voir les vidéos de nos créateurs :', { width: W });
    doc.font('Helvetica').fontSize(10).fillColor(GREEN).text(link, { width: W, link, underline: true });

    doc.moveDown(1.2);
    p('Données publiques de la bibliothèque publicitaire de Meta (transparence européenne) : texte, date de début, supports. Meta ne donne ni les dépenses ni les résultats ; la durée de diffusion est le meilleur indice disponible. Constats comptés, sans jugement.', { size: 8, color: LIGHT });
    doc.end();
  });
}

export const scanPageLink = (slug, { audit = false, ref = '' } = {}) => {
  const front = String(config.cors.origin || '').split(',')[0].trim().replace(/\/$/, '');
  const q = [audit ? 'vue=audit' : '', ref ? `ref=${ref}` : ''].filter(Boolean).join('&');
  return `${front}/publicites/${slug}${q ? `?${q}` : ''}`;
};
