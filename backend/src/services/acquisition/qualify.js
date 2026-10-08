import { z } from 'zod';
import { generateJson, aiConfig } from '../ai.js';
import { NICHE_KEYS } from './keywords.js';

const creatorSchema = z.object({
  niche: z.string(),
  isUgc: z.boolean(),
  fit: z.number().min(0).max(100),
  signals: z.array(z.string()).max(5),
  summary: z.string().max(300),
  message: z.string().max(480),
  emailParagraph: z.string().max(500),
  firstName: z.string().max(40).optional().nullable(),
});
const brandSchema = z.object({
  sector: z.string(),
  sellsProducts: z.boolean(),
  isBrand: z.boolean().default(true), // false : le compte est une personne (créateur, blogueur, particulier), pas une entreprise
  fit: z.number().min(0).max(100),
  signals: z.array(z.string()).max(5),
  summary: z.string().max(300),
  message: z.string().max(600),
  emailParagraph: z.string().max(900),
  hooks: z.array(z.string().max(160)).max(3).default([]),
  competitors: z.array(z.string().max(60)).max(3).default([]),
});

/** Coupe un texte trop long à la dernière phrase complète (ou au dernier espace) avant la limite */
function clip(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)).trim();
}
const normalizeCommon = (o, messageMax = 320) => ({ ...o, fit: Number(o.fit) || 0, signals: (o.signals || []).map(String).slice(0, 5), summary: clip(o.summary, 300), message: clip(o.message, messageMax), emailParagraph: clip(o.emailParagraph, 500) });
/** Marques : la question finale est obligatoire ; si l'IA l'a oubliée ou si elle a été coupée, on la rétablit */
const BRAND_FINAL_QUESTION = "J'en ai deux autres, tournables sous dix jours par un créateur vérifié : à quelle adresse puis-je vous les envoyer ?";
export const normalizeBrand = (o) => {
  if (o.isBrand === false) { o = { ...o, fit: 0, sellsProducts: false }; } else o = { ...o, isBrand: true };
  const base = normalizeCommon(o, 600); // marques : trois phrases complètes (accroche citée comprise), la phrase finale ne doit jamais être coupée
  let msg = String(base.message || '').trim();
  if (!/à quelle adresse puis-je vous les envoyer/i.test(msg)) {
    msg = msg.replace(/[\s.…]*$/, '').replace(/(Qui s'occupe|À quelle adresse|Même sans collaboration|J'en ai deux autres)[^.?!]*$/i, '').trim();
    msg = `${msg}${msg && !/[.!?]$/.test(msg) ? '.' : ''} ${BRAND_FINAL_QUESTION}`.trim();
  }
  const hooks = (Array.isArray(o.hooks) ? o.hooks : []).map(h => clip(String(h).replace(/^[\s"«»“”-]+|[\s"«»“”]+$/g, '').replace(/\s+/g, ' ').trim(), 100)).filter(h => h.length >= 12).slice(0, 3);
  // Paragraphe d'email reconstruit à partir des accroches (forme fixe, jamais coupé) ; la première ligne vient de l'IA
  let paragraph = String(o.emailParagraph || '').trim();
  if (hooks.length === 3) { const intro = paragraph.split('\n')[0].replace(/\s*1\).*$/, '').replace(/\s*[:.]?\s*$/, ' :'); paragraph = `${intro}\n1) ${hooks[0]}\n2) ${hooks[1]}\n3) ${hooks[2]}\nSi l'une vous parle, elle est prête à être tournée sous dix jours.`; }
  const self = String(o.name || '').toLowerCase();
  const competitors = (Array.isArray(o.competitors) ? o.competitors : []).map(c => String(c).replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(c => c.length >= 2 && c.toLowerCase() !== self).slice(0, 3);
  return { ...base, hooks, competitors, emailParagraph: paragraph.slice(0, 900), message: msg.slice(0, 600) };
};

const SYSTEM = `Tu aides NeedCreator, plateforme française qui met en relation des marques et des créateurs de vidéos UGC (témoignages, unboxings, démos diffusés sur les réseaux et les publicités des marques). Le créateur fixe son prix, le paiement est bloqué avant le tournage, un contrat de cession de droits est généré. Tu réponds en JSON, en français, sans flatterie ni superlatif, en tutoyant jamais : vouvoiement.`;

/** Qualifie un prospect : niche/secteur, score d'adéquation, signaux, message court (réseaux) et paragraphe email personnalisés */
export async function qualifyLead(lead, { openNiches = [] } = {}) {
  if (!aiConfig().configured) return null;
  const common = `Campagnes actuellement ouvertes sur NeedCreator (niches) : ${openNiches.join(', ') || 'aucune information'}.`;
  if (lead.kind === 'creator') {
    const ig = lead.source === 'instagram';
    const prompt = `${common}
${ig ? `Publication Instagram trouvée avec le hashtag ${lead.keyword} (l'auteur n'est pas fourni : déduis ce que tu peux de la légende, prénom compris)` : `Profil YouTube trouvé avec le mot-clé « ${lead.keyword} »`} :
- Nom : ${lead.name}
- Pseudo : ${lead.handle || 'inconnu'}
${ig ? `- J'aime : ${lead.stats?.likes ?? '?'}, commentaires : ${lead.stats?.comments ?? '?'}` : `- Abonnés : ${lead.stats?.subscribers ?? '?'}, vidéos : ${lead.stats?.videos ?? '?'}`}
- Pays : ${lead.country || 'inconnu'}
- ${ig ? 'Légende' : 'Description'} : """${(lead.description || '').slice(0, 1500)}"""

Réponds avec :
- niche : une seule parmi ${NICHE_KEYS.join(', ')} (la plus proche)
- isUgc : true si ce créateur produit déjà du contenu pour des marques (UGC, collaborations, partenariats)
- fit : 0 à 100, adéquation avec NeedCreator (créateur individuel francophone, contenu vidéo produit/lifestyle, pas une entreprise, pas une agence, pas un média, pas un coach qui vend des formations UGC, pas une publication de marque ou d'agence qui cherche des créateurs). Une publication qui donne des conseils aux créateurs, parle stratégie ou vend un accompagnement vient d'un coach ou d'une agence : fit inférieur à 30. Un faible nombre d'abonnés est normal : les créateurs UGC utilisent YouTube comme portfolio, ne pénalise pas pour ça
- signals : 1 à 4 constats factuels courts tirés de la description
- summary : une phrase sur ce qu'il fait
- firstName : son prénom s'il apparaît, sinon null
- message : message privé de 300 caractères maximum, personnalisé (cite un élément concret de ${ig ? 'sa publication' : 'sa chaîne'}), qui présente NeedCreator en une phrase (des créateurs vendent leurs vidéos aux marques ; on peut proposer une vidéo déjà tournée d'un produit qu'on possède, à son prix, sans attendre une campagne) et propose de s'inscrire ; pas d'emoji, pas de lien
- emailParagraph : paragraphe de 2 phrases pour un email, qui remplace « je suis tombé sur votre profil », personnalisé de la même façon`;
    return generateJson({ system: SYSTEM, prompt, schema: creatorSchema, normalize: normalizeCommon });
  }
  // D'où vient la fiche : l'IA ne doit pas tenir pour acquis qu'un compte cité par un créateur est une marque
  const tagged = /\(tag\)/i.test(String(lead.keyword || ''));
  const suggested = !!lead.suggestedBy;
  const intro = tagged
    ? `Compte Instagram cité par un créateur dans une publication (hashtag de partenariat). Ce peut être une marque, mais aussi une personne : un autre créateur, un ami, un blogueur. Son profil a été lu :`
    : suggested ? `Marque suggérée par un créateur qui possède l'un de ses produits :`
    : lead.source === 'meta' ? `Marque française trouvée dans la bibliothèque publicitaire Meta avec le mot-clé « ${lead.keyword} » :`
    : `Marque ajoutée à la prospection (${lead.keyword || 'saisie à la main'}) :`;
  const prompt = `${common}
${intro}
- Nom de page : ${lead.name}
- Site : ${lead.website || 'inconnu'}
- Abonnés Instagram : ${lead.stats?.subscribers ?? '?'}
- Annonces actives : ${lead.stats?.ads ?? '?'}
- Texte d'une annonce : """${(lead.description || '').slice(0, 800)}"""

Réponds avec :
- sector : secteur en un ou deux mots (ex. cosmétiques, compléments, mode, maison, food, tech, services)
- isBrand : true si c'est une entreprise ou une marque ; false si le compte est celui d'une personne (créateur de contenu, influenceur, blogueur, lecteur, particulier, artiste), même très suivie, même si elle recommande des produits
- sellsProducts : true si la marque vend des produits physiques ou une application/service grand public (cible UGC), false si B2B pur, média, association, politique
- fit : 0 à 100, adéquation avec l'UGC (produit montrable en vidéo, publicité active, grand public). Si les informations ne permettent pas de dire ce que vend la marque, fit ≤ 30 : ne suppose rien. Si isBrand = false, fit = 0
- signals : 1 à 4 constats factuels courts
- summary : une phrase sur ce que vend la marque
- hooks : TROIS accroches de vidéo UGC pour ce produit précis, chacune ≤ 90 caractères, écrites comme la première phrase que dirait un créateur face caméra dans les trois premières secondes (à la première personne, concrètes, sans point d'exclamation, sans emoji, sans nom de marque), inspirées du texte de l'annonce ; trois angles différents : le problème vécu, la promesse ou le résultat, la curiosité
- message : message privé (Instagram ou LinkedIn) de 480 caractères maximum, en trois phrases, écrit à la première personne par la personne qui s'occupe de NeedCreator, sans prénom. Objectif : obtenir une RÉPONSE et le bon interlocuteur, pas une inscription. Constat de terrain : les marques lisent ces messages comme une demande de collaboration venant d'un créateur et répondent par un refus type ou une adresse « collab » ; il faut donc préciser en une phrase que ce n'est pas une demande de collaboration mais NeedCreator, qui repère les publicités qui marchent dans son secteur et les fait tourner par des créateurs vérifiés, payées seulement si elles lui conviennent. Phrase 1 : « Bonjour, » puis la publicité ou le produit vu chez la marque, suivi de la meilleure des trois accroches entre guillemets français, sous la forme « j'ai vu votre publicité pour X. Un de nos créateurs l'ouvrirait ainsi : « … » ». Phrase 2, à imiter, formulée au positif (dire qui l'on est, pas ce que l'on n'est pas) : « Je ne suis pas créatrice : je m'occupe de NeedCreator, qui repère les publicités qui marchent dans votre secteur et les fait tourner par des créateurs vérifiés, payées seulement si elles vous conviennent. » Phrase 3, OBLIGATOIRE et finale, mot pour mot (un outil gratuit utile même sans collaboration, qui appelle une réponse) : « J'en ai deux autres, tournables sous dix jours par un créateur vérifié : à quelle adresse puis-je vous les envoyer ? ». Exemple complet : « Bonjour, j'ai vu votre publicité pour vos bougies parfumées. Un de nos créateurs l'ouvrirait ainsi : « J'ai arrêté d'acheter des bougies qui sentent bon trois jours ». Je ne suis pas créatrice : je m'occupe de NeedCreator, qui repère les publicités qui marchent dans votre secteur et les fait tourner par des créateurs vérifiés, payées seulement si elles vous conviennent. J'en ai deux autres, tournables sous dix jours par un créateur vérifié : à quelle adresse puis-je vous les envoyer ? ». Pas d'emoji, pas de lien, pas de liste d'avantages, aucun texte entre accolades
- emailParagraph : pour l'email d'ouverture, 4 lignes séparées par des retours à la ligne : une phrase « Nous avons vu votre publicité pour X. Trois accroches que nos créateurs tourneraient pour ce produit : », puis les trois accroches précédées de « 1) », « 2) », « 3) », puis « Si l'une vous parle, elle est prête à être tournée sous dix jours. »
- competitors : deux ou trois marques concurrentes directes, qui vendent le même type de produit en France et font de la publicité sur Facebook et Instagram, de taille comparable ou un peu plus grandes ; le nom exact de la marque tel qu'il apparaît sur sa page (ex. « Typology », « Respire ») ; jamais la marque elle-même, jamais un distributeur (Sephora, Amazon) ; [] si tu n'es pas sûr`;
  return generateJson({ system: SYSTEM, prompt, schema: brandSchema, normalize: normalizeBrand });
}
