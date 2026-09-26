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
  fit: z.number().min(0).max(100),
  signals: z.array(z.string()).max(5),
  summary: z.string().max(300),
  message: z.string().max(480),
  emailParagraph: z.string().max(500),
});

/** Coupe un texte trop long à la dernière phrase complète (ou au dernier espace) avant la limite */
function clip(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)).trim();
}
const normalizeCommon = (o) => ({ ...o, fit: Number(o.fit) || 0, signals: (o.signals || []).map(String).slice(0, 5), summary: clip(o.summary, 300), message: clip(o.message, 420), emailParagraph: clip(o.emailParagraph, 500) });
/** Marques : la question finale est obligatoire ; si l'IA l'a oubliée ou si elle a été coupée, on la rétablit */
const BRAND_FINAL_QUESTION = 'À quelle adresse puis-je vous envoyer une proposition pour vos prochaines vidéos publicitaires ?';
const normalizeBrand = (o) => {
  const base = normalizeCommon(o);
  let msg = String(base.message || '').trim();
  if (!/À quelle adresse puis-je vous envoyer une proposition/i.test(msg)) {
    msg = msg.replace(/[\s.…]*$/, '').replace(/À quelle adresse[^.?!]*$/i, '').trim();
    msg = `${msg}${msg && !/[.!?]$/.test(msg) ? '.' : ''} ${BRAND_FINAL_QUESTION}`.trim();
  }
  return { ...base, message: msg.slice(0, 480) };
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
- message : message privé de 300 caractères maximum, personnalisé (cite un élément concret de ${ig ? 'sa publication' : 'sa chaîne'}), qui présente NeedCreator en une phrase et propose de s'inscrire ; pas d'emoji, pas de lien
- emailParagraph : paragraphe de 2 phrases pour un email, qui remplace « je suis tombé sur votre profil », personnalisé de la même façon`;
    return generateJson({ system: SYSTEM, prompt, schema: creatorSchema, normalize: normalizeCommon });
  }
  const prompt = `${common}
Marque française trouvée dans la bibliothèque publicitaire Meta avec le mot-clé « ${lead.keyword} » :
- Nom de page : ${lead.name}
- Site : ${lead.website || 'inconnu'}
- Annonces actives : ${lead.stats?.ads ?? '?'}
- Texte d'une annonce : """${(lead.description || '').slice(0, 800)}"""

Réponds avec :
- sector : secteur en un ou deux mots (ex. cosmétiques, compléments, mode, maison, food, tech, services)
- sellsProducts : true si la marque vend des produits physiques ou une application/service grand public (cible UGC), false si B2B pur, média, association, politique
- fit : 0 à 100, adéquation avec l'UGC (produit montrable en vidéo, publicité active, grand public)
- signals : 1 à 4 constats factuels courts
- summary : une phrase sur ce que vend la marque
- message : message privé (Instagram ou LinkedIn) de 300 caractères maximum, en trois phrases courtes, écrit à la première personne par la personne qui s'occupe de NeedCreator, sans prénom. Objectif : obtenir une RÉPONSE et le bon interlocuteur, pas une inscription. Constat de terrain : les marques lisent ces messages comme une demande de collaboration venant d'un créateur et répondent par un refus type ou une adresse « collab » ; il faut donc préciser en une phrase que ce n'est pas une demande de collaboration mais une plateforme où des créateurs vérifiés tournent des vidéos pour ses publicités, payées seulement si elles lui conviennent. Phrase 1 : « Bonjour, » puis UN SEUL élément concret vu chez la marque (un produit précis ou une publicité), jamais deux. Phrase 2, à imiter, formulée au positif (dire qui l'on est, pas ce que l'on n'est pas) : « Je ne suis pas créatrice : je m'occupe de NeedCreator, une plateforme où des créateurs vérifiés tournent des vidéos pour vos pubs, payées seulement si elles vous conviennent. » Phrase 3, OBLIGATOIRE et finale, mot pour mot : « À quelle adresse puis-je vous envoyer une proposition pour vos prochaines vidéos publicitaires ? ». Exemple complet : « Bonjour, j'ai vu vos publicités pour vos bougies parfumées. Je ne suis pas créatrice : je m'occupe de NeedCreator, une plateforme où des créateurs vérifiés tournent des vidéos pour vos pubs, payées seulement si elles vous conviennent. À quelle adresse puis-je vous envoyer une proposition pour vos prochaines vidéos publicitaires ? ». Pas d'emoji, pas de lien, pas de liste d'avantages, aucun texte entre accolades
- emailParagraph : paragraphe de 2 phrases pour un email, personnalisé de la même façon`;
  return generateJson({ system: SYSTEM, prompt, schema: brandSchema, normalize: normalizeBrand });
}
