import { z } from 'zod';
import { generateJson, generateBrief, aiConfig } from '../ai.js';
import Campaign from '../../models/Campaign.js';
import Lead from '../../models/Lead.js';
import { getFeePercents } from '../../models/Setting.js';
import { notify } from '../notifications.js';
import { config } from '../../config/index.js';
import { buildProductBrief, findProductPage } from '../productBrief.js';
import ProductBrief from '../../models/ProductBrief.js';
import logger from '../../utils/logger.js';

export const REPLY_INTENTS = ['interested', 'question', 'redirect', 'not_now', 'refusal', 'unsubscribe', 'out_of_office', 'other'];
const schema = z.object({ intent: z.enum(REPLY_INTENTS), summary: z.string().max(200), reply: z.string().max(1200), needsHuman: z.boolean() });

const SYSTEM = `Tu aides NeedCreator (plateforme française qui met en relation marques et créateurs de vidéos UGC : le créateur fixe son prix, le paiement est bloqué avant tournage, contrat de cession de droits, commission uniquement sur les missions payées via la plateforme, inscription gratuite). Tu lis la réponse d'un prospect à un email de prospection et tu proposes une réponse courte, en français, vouvoiement, sans emoji, signée « L'équipe NeedCreator ». Réponds en JSON.`;

/** Classe une réponse et propose un texte : intent, résumé, réponse (texte brut), besoin d'un humain */
export async function classifyReply(lead, text) {
  if (!aiConfig().configured) return null;
  const signup = lead.kind === 'creator' ? `${config.cors.origin}/register?role=creator&from=${encodeURIComponent((lead.handle || '').replace(/^@/, ''))}` : `${config.cors.origin}/register?role=brand&lead=${lead._id}&email=${encodeURIComponent(lead.email || '')}&company=${encodeURIComponent(lead.name || '')}`;
  const prompt = `Prospect : ${lead.kind === 'creator' ? 'créateur' : 'marque'} « ${lead.name} »${lead.niche ? ` (${lead.niche})` : ''}. Résumé : ${lead.aiSummary || 'inconnu'}.
Il a reçu un email présentant NeedCreator${lead.kind === 'creator' ? ' (vendre ses vidéos aux marques, outils gratuits pour ses clients directs)' : ' (trouver des créateurs UGC vérifiés pour ses publicités, au prix du devis, ou en offrant son produit)'}.
Sa réponse : """${String(text || '').slice(0, 3000)}"""

Réponds avec :
- intent : interested (veut en savoir plus, s'inscrire, discuter), question (pose une question précise), redirect (renvoie vers une adresse email, un formulaire ou une autre personne pour ce type de demande, y compris par réponse automatique : c'est une porte ouverte, pas un refus), not_now (pas maintenant, plus tard), refusal (non), unsubscribe (demande de ne plus écrire), out_of_office (réponse automatique d'absence), other
- summary : une phrase
- reply : texte brut (pas de HTML, sauts de ligne autorisés), 3 à 6 phrases, qui répond précisément ; si intent = redirect, remercie en une phrase et confirme qu'on écrit à l'adresse ou remplit le formulaire indiqué (ne pas réexpliquer NeedCreator) ; si intent = interested, invite à s'inscrire avec ce lien exact : ${signup} ; si question, réponds à la question avec ce que tu sais de NeedCreator et propose le même lien ; si refusal ou unsubscribe, remercie en une phrase et confirme qu'on ne réécrira pas ; si not_now, propose de reprendre contact plus tard ; si out_of_office, reply vide
- needsHuman : true si la question dépasse ce que tu sais (tarifs précis d'un créateur, juridique, partenariat spécial) ou si le ton demande une réponse humaine`;
  return generateJson({ system: SYSTEM, prompt, schema, normalize: (o) => ({ ...o, summary: String(o.summary || '').slice(0, 200), reply: String(o.reply || '').slice(0, 1200), needsHuman: !!o.needsHuman }) });
}

/**
 * Onboarding d'une marque venue d'un prospect : campagne brouillon rédigée par l'IA à partir de ce qu'on sait d'elle,
 * pour qu'elle n'ait qu'à relire et publier. Retourne la campagne ou null.
 */
export async function createDraftCampaignFromLead(brand, lead) {
  try {
    const fees = await getFeePercents();
    let brief = null;
    if (aiConfig().configured) {
      brief = await generateBrief({
        productDescription: `Marque : ${lead.name}${lead.website ? ` (${lead.website})` : ''}. Ce qu'on sait : ${lead.aiSummary || lead.description || 'marque grand public'}. Propose une première campagne UGC simple et réaliste pour cette marque (1 à 2 vidéos).`,
        brandName: lead.name, industry: lead.niche || '', videoType: 'testimonial', videoTypeLabel: 'Témoignage', platforms: 'tiktok, instagram', niches: lead.niche || 'lifestyle',
        goal: 'notoriété et ventes', tone: 'authentique', duration: 30, deliverables: 1,
      }).catch(err => { logger.warn(`Draft campaign brief failed: ${err.message}`); return null; });
    }
    const campaign = await Campaign.create({
      brandId: brand._id, platformFeePercent: fees.standard, type: 'paid', status: 'draft', visibility: 'public',
      title: brief?.title || `Première campagne ${lead.name}`,
      description: brief?.description || `Campagne préparée à partir de votre échange avec NeedCreator. Décrivez votre produit, ce que vous attendez de la vidéo et le ton souhaité.`,
      brief: { videoType: 'testimonial', duration: brief?.suggestedDuration || 30, deliverables: brief?.suggestedDeliverables || 1, requirements: brief?.requirements?.slice(0, 6) || [], deliveryTypes: ['file', 'link'], platforms: ['tiktok', 'instagram'], productShipping: true, productDescription: '' },
      matching: { niches: lead.niche && /^[a-z]+$/.test(lead.niche) ? [lead.niche] : ['lifestyle'], creatorsWanted: 1 },
      timeline: { applicationDeadline: new Date(Date.now() + 14 * 86400000) },
    });
    await Lead.updateOne({ _id: lead._id }, { $set: { draftCampaignId: campaign._id } });
    notify(brand._id, { type: 'system', title: 'Votre première campagne est prête à relire', text: 'Nous l\'avons préparée d\'après notre échange : vérifiez le brief, ajustez le budget et publiez.', href: `/campaigns/${campaign._id}` }).catch(() => {});
    logger.info(`Draft campaign ${campaign._id} created for lead ${lead._id} (brand ${brand._id})`);
    return campaign;
  } catch (err) {
    logger.warn(`createDraftCampaignFromLead failed: ${err.message}`);
    return null;
  }
}

/**
 * Brief offert (troisième email de la séquence marques : « répondez oui, je vous prépare un brief ») : généré depuis une fiche produit du site
 * de la marque. Retourne { brief, text } où text est le paragraphe à ajouter à la réponse, ou null si le site est illisible ou inconnu.
 * Une seule génération par prospect : le brief existant est réutilisé.
 */
export async function prepareOfferedBrief(lead) {
  if (lead.kind !== 'brand' || !aiConfig().configured) return null;
  let pb = lead.offeredBriefId ? await ProductBrief.findById(lead.offeredBriefId).catch(() => null) : null;
  if (!pb) {
    if (!lead.website) return null;
    try {
      const page = await findProductPage(lead.website);
      pb = await buildProductBrief(page, { ip: 'prospection' });
      lead.offeredBriefId = pb._id;
    } catch (err) { logger.warn(`Offered brief for lead ${lead._id}: ${err.message}`); return null; }
  }
  const view = `${config.cors.origin}/brief-depuis-url?id=${pb._id}`;
  const signup = `${config.cors.origin}/register?role=brand&lead=${lead._id}&brief=${pb._id}&email=${encodeURIComponent(lead.email || '')}&company=${encodeURIComponent(lead.name || '')}`;
  const text = `Comme promis, voici le brief que j'ai préparé${pb.product?.name ? ` pour « ${pb.product.name} »` : ''} : trois angles créatifs avec leur accroche, un format recommandé, un budget estimé et les consignes détaillées.\n${view}\n\nIl est à vous, que vous l'utilisiez chez nous ou ailleurs. Pour le publier auprès de nos créateurs, ce lien crée votre compte avec la campagne déjà prête en brouillon : ${signup}\n\nPour une première campagne, vous pouvez ne payer que le produit : vous l'expédiez au créateur, il tourne, nous ne prenons rien. Contrat et droits identiques.`;
  return { brief: pb, text };
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE = /https?:\/\/[^\s)>\]]+/g;
/**
 * Réponse reçue sur un réseau (collée à la main) ou par email : enregistre le texte, la classe, et exploite une redirection
 * (adresse email « collab » ou formulaire donnés par la marque) : l'email devient celui du prospect, qui passe alors dans le circuit mailing.
 */
export async function recordReply(lead, text, { via = 'instagram' } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return { lead, extracted: {} };
  lead.mailing = { ...(lead.mailing?.toObject?.() || lead.mailing || {}), replyText: clean.slice(0, 4000), replyAt: new Date(), replyVia: via };
  lead.status = 'replied';
  const c = await classifyReply(lead, clean).catch(() => null);
  if (c) { lead.mailing.replyIntent = c.intent; lead.mailing.replySummary = c.summary; lead.mailing.replySuggestion = c.reply; }
  const extracted = {};
  const emails = (clean.match(EMAIL_RE) || []).map(e => e.toLowerCase()).filter(e => !/noreply|no-reply|@needcreator\./.test(e));
  const forms = (clean.match(URL_RE) || []).filter(u => !/instagram\.com|tiktok\.com|facebook\.com|linkedin\.com/.test(u));
  if (emails.length && !lead.email) { lead.email = emails[0]; lead.emailSource = `réponse ${via}`; extracted.email = emails[0]; }
  else if (emails.length) extracted.email = emails[0];
  if (forms.length) { extracted.form = forms[0]; lead.notes = [lead.notes, `Formulaire de collaboration : ${forms[0]}`].filter(Boolean).join(' · '); }
  if (c?.intent === 'refusal' || c?.intent === 'unsubscribe') { lead.status = 'rejected'; lead.notes = [lead.notes, c.intent === 'unsubscribe' ? 'Demande de ne plus écrire' : 'A refusé'].filter(Boolean).join(' · '); }
  await lead.save();
  return { lead, extracted, intent: c?.intent || null };
}
