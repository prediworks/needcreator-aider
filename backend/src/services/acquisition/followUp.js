/**
 * Message privé de relance pour un prospect déjà joint par email (mailing) et resté sans réponse : court, il rappelle l'email
 * et pose une question, sans réexpliquer NeedCreator. Construit à partir de ce que la fiche sait déjà (accroche, nom), sans appel à l'IA.
 */
const when = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'il y a quelques jours');
const clip = (t, n) => { const s = String(t || '').trim(); return s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; };

/** Texte de relance (≤ 320 caractères) ou null quand la fiche n'est pas concernée (jamais envoyée au mailing, ou a répondu) */
export function followUpMessage(lead) {
  if (!lead?.mailing?.pushedAt || lead.mailing?.replyAt) return null;
  const date = when(lead.mailing.pushedAt);
  if (lead.kind === 'brand') {
    const hook = Array.isArray(lead.hooks) && lead.hooks[0] ? clip(lead.hooks[0], 90) : '';
    return hook
      ? `Bonjour, je vous ai écrit par email le ${date} au sujet de vidéos pour ${clip(lead.name, 40)}. Avez-vous eu le temps d'y jeter un œil ? Un créateur peut tourner « ${hook} » sous dix jours : si cela vous parle, je vous envoie la vidéo, à regarder avant de payer.`
      : `Bonjour, je vous ai écrit par email le ${date} au sujet de vidéos pour ${clip(lead.name, 40)}. Avez-vous eu le temps d'y jeter un œil ? Si un de vos produits vous vient à l'esprit, un créateur peut le tourner sous dix jours : vous regardez la vidéo avant de payer.`;
  }
  const first = lead.firstName ? ` ${lead.firstName}` : '';
  return `Bonjour${first}, je vous ai écrit par email le ${date} au sujet de NeedCreator. Avez-vous eu le temps de regarder ? Si vous avez chez vous un produit d'une marque, vous pouvez déjà lui proposer une vidéo à votre prix, sans attendre une campagne. Je peux vous montrer comment en deux minutes.`;
}

/**
 * Test du 08/10/2026 sur le message privé aux marques : une fiche sur deux (identifiant impair) reçoit, à la place de l'offre de deux autres
 * accroches, les publicités de son concurrent qui tournent depuis le plus longtemps. Sans concurrent vérifié, elle garde le message actuel.
 */
export const inCompetitorGroup = (lead) => lead?.kind === 'brand' && parseInt(String(lead._id || '').slice(-1), 16) % 2 === 1;

export function competitorMessage(lead) {
  const name = lead?.competitor?.pageId ? String(lead.competitor.pageName || '').trim() : '';
  if (!name) return null;
  // Première phrase du message de l'IA : la publicité vue et l'accroche entre guillemets
  const msg = String(lead.message || '');
  const m = msg.match(/^([\s\S]*?ainsi\s*:\s*«[^»]*»)/) || msg.match(/^([\s\S]*?»)/);
  const first = m ? `${m[1].trim()}.` : (Array.isArray(lead.hooks) && lead.hooks[0] ? `Bonjour, j'ai vu votre publicité. Un de nos créateurs l'ouvrirait ainsi : « ${clip(lead.hooks[0], 90)} ».` : 'Bonjour, j\'ai vu vos publicités.');
  return `${first} Je m'occupe de NeedCreator, qui repère les publicités qui marchent dans votre secteur et les fait tourner par des créateurs vérifiés. J'ai relevé les publicités de ${clip(name, 50)} qui tournent depuis le plus longtemps : à quelle adresse puis-je vous les envoyer ?`;
}

/** Message privé à envoyer depuis la file du jour, et sa version (enregistrée sur la fiche au clic « Contacté ») */
export function dmFor(lead) {
  const f = followUpMessage(lead);
  if (f) return { text: f, variant: lead.kind === 'brand' ? 'followup' : undefined };
  if (inCompetitorGroup(lead)) { const c = competitorMessage(lead); if (c) return { text: c, variant: 'competitor' }; }
  return { text: lead.message || '', variant: lead.kind === 'brand' ? 'hooks' : undefined };
}
