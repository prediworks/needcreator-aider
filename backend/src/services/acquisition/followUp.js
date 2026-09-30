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
