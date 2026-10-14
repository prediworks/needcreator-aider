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
 * Test du message privé aux marques (depuis le 08/10/2026) : une fiche sur deux (identifiant impair) reçoit la version « outil » à la place
 * de la version « accroches ». Depuis le 14/10/2026, la version « outil » part d'un fait sur le concurrent (âge de sa plus ancienne publicité)
 * et propose l'analyse gratuite, sans lien ni « un de nos créateurs » (lu comme une demande de collaboration). Sans concurrent vérifié :
 * l'audit gratuit des publicités de la marque. Concurrent pas encore cherché : version « accroches » en attendant.
 */
export const inCompetitorGroup = (lead) => lead?.kind === 'brand' && parseInt(String(lead._id || '').slice(-1), 16) % 2 === 1;

const WHO = "Je m'occupe de NeedCreator, ce n'est pas une demande de collaboration : nous repérons les publicités qui marchent dans votre secteur et les faisons tourner par des créateurs vérifiés, payées seulement si elles vous conviennent.";

export function competitorMessage(lead, now = Date.now()) {
  const name = lead?.competitor?.pageId ? clip(String(lead.competitor.pageName || '').trim(), 50) : '';
  if (!name) return null;
  const days = lead.competitor.oldestAt ? Math.floor((now - new Date(lead.competitor.oldestAt).getTime()) / 86400000) : 0;
  const fact = days >= 30
    ? `Bonjour, la plus ancienne publicité de ${name} tourne depuis ${days} jours sur Facebook et Instagram : c'est souvent le signe qu'elle rapporte.`
    : `Bonjour, j'ai relevé les publicités de ${name} qui tournent depuis le plus longtemps sur Facebook et Instagram.`;
  return `${fact} ${WHO} Je peux vous envoyer l'analyse gratuite de ses publicités et des vôtres ?`;
}

export function auditMessage(lead) {
  return `Bonjour, j'ai regardé les publicités que ${clip(String(lead?.name || 'votre marque').trim(), 40)} fait tourner sur Facebook et Instagram. ${WHO} Je peux vous envoyer l'analyse gratuite de vos publicités : celles qui tournent depuis le plus longtemps, et ce qu'il serait utile de tester ?`;
}

/** Message privé à envoyer depuis la file du jour, et sa version (enregistrée sur la fiche au clic « Contacté ») */
export function dmFor(lead) {
  const f = followUpMessage(lead);
  if (f) return { text: f, variant: lead.kind === 'brand' ? 'followup' : undefined };
  if (inCompetitorGroup(lead) && lead.competitor?.checkedAt) {
    const c = competitorMessage(lead);
    return c ? { text: c, variant: 'competitor' } : { text: auditMessage(lead), variant: 'audit' };
  }
  return { text: lead.message || '', variant: lead.kind === 'brand' ? 'hooks' : undefined };
}
