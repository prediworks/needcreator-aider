import { config } from '../../config/index.js';
import { safeFirstName } from './outreach.js';

/**
 * Brouillon de relance personnelle, joint à l'alerte « une marque a cliqué dans l'email » : l'équipe le relit, l'ajuste et l'envoie
 * depuis sa boîte. Rempli avec ce que la marque a regardé : sa publicité la plus ancienne (ou celle du concurrent), la vidéo proposée
 * par l'audit avec son prix, la garantie, le lien de la page (avec la référence de la fiche, pour suivre le clic). Ne dit jamais
 * « j'ai vu que vous avez regardé ».
 */
const DAY = 86400000;
const ageDays = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY)) : null);
const excerpt = (a, max = 90) => {
  const t = String(a?.title || a?.body || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
};

export function buildFollowUpDraft(lead, scan, { rates = {}, fromPrice = null } = {}) {
  if (!lead || !scan) return null;
  const own = !(lead.competitor?.slug && lead.competitor.slug === scan.slug);
  const first = safeFirstName(lead);
  const brand = lead.name || 'votre marque';
  const oldest = (scan.ads || [])[0];
  const days = ageDays(oldest?.startedAt);
  const brief = own ? (scan.audit?.briefs || [])[0] : null;
  const range = brief && rates[brief.videoType] ? `${rates[brief.videoType][0]} à ${rates[brief.videoType][1]} € HT` : (fromPrice ? `à partir de ${fromPrice} € HT` : '');
  const front = String(config.cors.origin || '').replace(/\/$/, '');
  const link = `${front}/publicites/${scan.slug}?${own ? 'vue=audit&' : ''}ref=${lead._id}`;

  const lines = [];
  lines.push(own ? `Objet : ${brand} : une idée de vidéo à partir de votre publicité qui marche` : `Objet : la publicité de ${scan.pageName} qui marche, en version ${brand}`);
  lines.push('');
  lines.push(first ? `Bonjour ${first},` : 'Bonjour,');
  lines.push('');
  if (oldest && days != null) {
    // Deux mois et plus : la durée vaut indice de rentabilité ; en deçà, on dit seulement que c'est la plus ancienne
    const why = days >= 60 ? (own ? 'c\'est sans doute celle qui vous rapporte le plus' : 'c\'est sans doute celle qui lui rapporte le plus') : 'c\'est la plus ancienne encore active';
    lines.push(own ? `Votre publicité « ${excerpt(oldest)} » tourne depuis ${days} jours : ${why}.` : `La publicité de ${scan.pageName} « ${excerpt(oldest)} » tourne depuis ${days} jours : ${why}.`);
  }
  if (brief) lines.push(`Un créateur vérifié peut en tourner une version vidéo pour vous : « ${brief.title} »${range ? `, ${range}` : ''}.`);
  else lines.push(`Un créateur vérifié peut en tourner la version vidéo pour ${brand}${range ? `, ${range}` : ''}.`);
  lines.push('Le paiement reste bloqué jusqu\'à ce que vous validiez la vidéo.');
  lines.push('');
  lines.push('Je vous prépare le brief ? C\'est gratuit, et vous le relisez avant de le publier.');
  lines.push(`Le détail est ici : ${link}`);
  lines.push('');
  lines.push('[Votre prénom]');
  lines.push('NeedCreator');
  return lines.join('\n');
}
