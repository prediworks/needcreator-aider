import crypto from 'crypto';
import { z } from 'zod';
import FacebookGroup, { GroupPost, GROUP_AUDIENCES, GROUP_POST_KINDS } from '../models/GroupWatch.js';
import Lead from '../models/Lead.js';
import { extractEmails, pickEmail } from './acquisition/enrich.js';
import { generateJson, aiConfig } from './ai.js';
import logger from '../utils/logger.js';

/**
 * Groupes Facebook : on n'y prospecte pas des membres, on y répond à des demandes. L'extension lit les publications récentes des
 * groupes suivis, l'IA ne garde que celles qui expriment un besoin et propose un commentaire ; la réponse reste un geste humain.
 * Rien n'est publié, rejoint ni envoyé par l'outil.
 */
export const MAX_GROUPS = 40;         // groupes suivis
export const GROUPS_PER_LOT = 15;     // pages de groupe lues par lot : une lecture par groupe et par jour
const REREAD_HOURS = 20;

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Adresse d'un groupe, quelle que soit la forme collée (« facebook.com/groups/123/ », lien de publication, lien mobile) */
export function cleanGroupUrl(v) {
  const m = String(v || '').trim().match(/facebook\.com\/groups\/([A-Za-z0-9._-]{3,80})/i);
  if (!m || /^(feed|discover|joins|search|create|notifications)$/i.test(m[1])) return null;
  return { key: m[1].toLowerCase(), url: `https://www.facebook.com/groups/${m[1]}/` };
}

export async function addGroup({ url, audience = 'creators', name = '', createdBy, workspaceId = 'default' }) {
  const g = cleanGroupUrl(url);
  if (!g) throw fail(400, 'Adresse non reconnue. Collez l\'adresse du groupe, par exemple https://www.facebook.com/groups/123456789/');
  if (!GROUP_AUDIENCES.includes(audience)) throw fail(400, 'Public du groupe inconnu');
  if (await FacebookGroup.findOne({ workspaceId, key: g.key })) throw fail(409, 'Ce groupe est déjà suivi');
  if (await FacebookGroup.countDocuments({ workspaceId }) >= MAX_GROUPS) throw fail(400, `${MAX_GROUPS} groupes suivis au plus : retirez-en un avant d'en ajouter`);
  return FacebookGroup.create({ workspaceId, key: g.key, url: g.url, audience, name: String(name || '').trim().slice(0, 160) || undefined, createdBy });
}

export async function updateGroup(id, { active, audience, name }) {
  const g = await FacebookGroup.findById(id);
  if (!g) throw fail(404, 'Groupe introuvable');
  if (typeof active === 'boolean') g.active = active;
  if (audience && GROUP_AUDIENCES.includes(audience)) g.audience = audience;
  if (name !== undefined) g.name = String(name || '').trim().slice(0, 160) || undefined;
  await g.save();
  return g;
}

export async function removeGroup(id) {
  const g = await FacebookGroup.findByIdAndDelete(id);
  if (!g) throw fail(404, 'Groupe introuvable');
  await GroupPost.deleteMany({ groupId: g._id });
  return g;
}

/** Groupes à lire maintenant : actifs, pas lus depuis vingt heures, les plus anciennement lus d'abord */
export async function groupsToRead({ workspaceId = 'default', limit = GROUPS_PER_LOT } = {}) {
  const since = new Date(Date.now() - REREAD_HOURS * 3600000);
  return FacebookGroup.find({ workspaceId, active: true, $or: [{ lastReadAt: null }, { lastReadAt: { $lt: since } }] }).sort({ lastReadAt: 1, createdAt: 1 }).limit(limit).lean();
}

const MAX_POST_AGE_DAYS = 21; // une demande plus ancienne a déjà trouvé sa réponse, ou son auteur est passé à autre chose
const MONTHS = { janv: 0, jan: 0, fev: 1, févr: 1, feb: 1, mars: 2, mar: 2, avr: 3, apr: 3, mai: 4, may: 4, juin: 5, jun: 5, juil: 6, jul: 6, aout: 7, août: 7, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11, déc: 11 };
/** Âge en jours d'après la date affichée par Facebook (« 6 h », « il y a 4 jours », « 10 sep », « 3 sept. 2025 ») ; null si illisible */
export function postAgeDays(when, now = new Date()) {
  const w = String(when || '').toLowerCase().replace(/^il y a\s+/, '').replace(/[.,]/g, '').trim();
  if (!w) return null;
  let m = w.match(/^(\d+)\s*(min|m|h|j|d|jour|jours|day|days|sem|semaine|semaines|w|week|weeks|mois|month|months|an|ans|year|years)\b/);
  if (m) { const n = +m[1]; const u = m[2]; return /^(min|m)$/.test(u) ? 0 : /^h/.test(u) ? n / 24 : /^(j|d)/.test(u) ? n : /^(sem|w)/.test(u) ? n * 7 : /^mo/.test(u) ? n * 30 : n * 365; }
  m = w.match(/^(\d{1,2})\s+([a-zéû]+)(?:\s+(\d{4}))?$/) || w.match(/^([a-zéû]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (m) {
    const day = +(/^\d/.test(m[1]) ? m[1] : m[2]); const mon = MONTHS[(/^\d/.test(m[1]) ? m[2] : m[1]).slice(0, 4)] ?? MONTHS[(/^\d/.test(m[1]) ? m[2] : m[1]).slice(0, 3)];
    if (mon == null || !day) return null;
    const year = m[3] ? +m[3] : now.getFullYear();
    let d = new Date(year, mon, day);
    if (!m[3] && d > now) d = new Date(year - 1, mon, day); // « 10 sep » lu en janvier : l'an dernier
    return Math.max(0, (now - d) / 86400000);
  }
  return null;
}

const squash = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim();
const postKey = (text) => crypto.createHash('sha1').update(squash(text).slice(0, 160)).digest('hex').slice(0, 24);
/**
 * Recherche dans le groupe sur les premiers mots de la publication : le chemin le plus sûr pour la retrouver.
 * Mots seulement : la recherche de Facebook ne supporte ni « : », ni parenthèses, ni « & », ni apostrophes ; les mots d'une ou deux lettres n'aident pas.
 */
export const searchUrl = (group, text) => {
  const words = String(text || '').replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(w => w.length >= 3);
  return `${String(group?.url || '').replace(/\/?$/, '/')}search/?q=${encodeURIComponent(words.slice(0, 7).join(' '))}`;
};

/**
 * Lien direct d'une publication, d'après les éléments relevés par l'extension ({ text, href } par publication) : l'élément dont le texte contient
 * le début de l'extrait donne son permalien, ramené à son chemin (les paramètres de suivi de Facebook sont retirés). Null si rien ne correspond.
 */
export function postPermalink(items, excerpt) {
  const head = squash(excerpt).slice(0, 40);
  if (head.length < 20) return null;
  for (const it of items || []) {
    if (!it?.href || !squash(it.text).includes(head)) continue;
    const m = String(it.href).match(/facebook\.com\/(groups\/[^/?#]+\/(?:posts|permalink)\/\d+|[^/?#]+\/posts\/\d+)/i);
    if (m) return `https://www.facebook.com/${m[1]}/`;
    const fb = String(it.href).match(/[?&]story_fbid=(\d+)/); const gid = String(it.href).match(/[?&]id=(\d+)/);
    if (fb && gid) return `https://www.facebook.com/groups/${gid[1]}/posts/${fb[1]}/`;
  }
  return null;
}
/** Adresse qui mène à la demande : la publication elle-même quand son lien est connu, sinon la recherche du groupe, sinon la source collée */
export const postLink = (p, group) => p.postUrl || (group?.url ? searchUrl(group, p.text) : p.searchUrl) || '';

const AUDIENCE_HINT = {
  creators: 'un groupe de créateurs UGC : des marques y publient parfois « cherche créateurs », des créateurs y demandent comment trouver des marques ou combien facturer',
  brands: 'un groupe de marques et d\'e-commerçants : des fondateurs y demandent comment obtenir des vidéos pour leurs publicités, ou combien coûte une vidéo UGC',
  ads: 'un groupe d\'annonceurs (publicité Meta, TikTok) : on y cherche des créations publicitaires qui convertissent',
  other: 'un groupe professionnel',
};

const postsSchema = z.object({ posts: z.array(z.object({ author: z.string().default(''), when: z.string().default(''), excerpt: z.string().default(''), kind: z.string().default('other'), comment: z.string().default(''), brand: z.string().default(''), email: z.string().default(''), website: z.string().default('') })).default([]) });
// Fin d'un extrait : boutons et mentions d'interface qui suivent une publication dans le texte de la page
const EXCERPT_END = /\s*(…\s*)?(en voir plus|see more|afficher plus|voir la traduction|see translation|j'aime|commenter|partager|\d+\s+commentaires?)\b.*$/i;

/**
 * Publications qui expriment un besoin, avec un commentaire proposé. L'extrait doit être recopié mot pour mot : il sert à retrouver la
 * publication et à vérifier que l'IA ne l'a pas inventée (un extrait absent de la page est écarté).
 */
export async function extractGroupPosts(result, group) {
  const text = String(result?.text || '');
  if (text.length < 200 || !aiConfig().configured) return [];
  const out = await generateJson({
    system: 'Tu lis le texte visible d\'un groupe Facebook francophone et tu relèves seulement les publications qui expriment un besoin auquel une plateforme de vidéos UGC peut répondre. Tu réponds en JSON strict, sans rien inventer.',
    prompt: `Texte de la page (${AUDIENCE_HINT[group?.audience] || AUDIENCE_HINT.other}) :
"""
${text.slice(0, 14000)}
"""
Relève au plus 8 publications (pas les commentaires) qui expriment l'un de ces besoins :
- "brand_seeks_creators" : une marque ou une boutique cherche des créateurs pour des vidéos sur ses produits ou ses services (rémunérées, ou en échange de produits) ;
- "brand_question" : une marque ou un e-commerçant demande comment obtenir des vidéos, combien ça coûte, ou un conseil pour ses publicités ;
- "creator_seeks_brands" : un créateur demande comment trouver des marques, des missions ou des clients ;
- "creator_question" : un créateur demande combien facturer, comment faire un devis, un contrat ou céder ses droits ;
- "creator_opportunity" : une agence, une production ou un intermédiaire recrute des créateurs pour un tournage ou une mission rémunérée, en France, en Belgique ou en Suisse (journée de tournage, casting rémunéré de créateurs UGC) : ce n'est pas une marque à démarcher, c'est une opportunité à transmettre à nos créateurs.
Ignore tout le reste, en particulier : les créateurs qui se présentent ou proposent leurs services ; les offres d'emploi, de stage ou d'alternance ; les castings de modèles, de figurants ou d'acteurs sans vidéo UGC ; la couverture d'un événement (reportage, photos sur place) ; les publicités, formations et coachings à vendre ; les annonces en anglais ou hors France, Belgique et Suisse ; tout ce qui renvoie vers Discord, Telegram ou WhatsApp ou promet un revenu mensuel ; les règles du groupe, sondages, remerciements.
Pour chaque publication retenue : author (le nom affiché de son auteur), when (la date ou l'ancienneté affichée près du nom, telle quelle : « 2 h », « 3 sept. », vide si absente), excerpt (les 200 à 300 premiers caractères de la publication, recopiés mot pour mot, sans les mots d'interface comme « En voir plus »), kind, comment, brand (le nom de la marque, de la boutique ou de l'agence si la publication le dit, sinon vide), email (l'adresse email écrite dans la publication pour être contacté, sinon vide), website (le site écrit dans la publication, sinon vide).
Pour "creator_opportunity", comment reste vide : on ne commente pas, on transmet.
comment = un commentaire à publier sous la publication, en français, 2 à 3 phrases, 350 caractères au plus, sans lien, sans émoji. Il répond au besoin exprimé, il ne commente jamais la façon dont l'annonce est rédigée et ne donne aucun conseil sur ce qu'elle devrait préciser. Première phrase : ce que la personne peut obtenir, concrètement, en rapport avec sa demande (ses produits, son secteur, son objectif). Deuxième phrase : NeedCreator, nommé une fois. Dernière phrase : proposer d'en dire plus en message privé. Vouvoiement pour une marque, tutoiement pour un créateur.
Ce que tu peux dire de NeedCreator, sans rien ajouter : plateforme française de vidéos UGC. Pour une marque : des créateurs qui possèdent déjà son produit lui envoient une vidéo déjà tournée, qu'elle regarde avant de payer et ne paie que si elle la garde, droits inclus ; ou elle publie un brief et reçoit des devis de créateurs vérifiés ; une vidéo coûte en général 80 à 250 € HT ; elle peut aussi payer en produit. Pour un créateur : inscription gratuite, il fixe son prix, il peut proposer une vidéo à une marque sans attendre une campagne, le paiement est bloqué par la marque avant la livraison ; un calculateur de tarif et un devis avec contrat de droits sont gratuits.
Exemple de bon commentaire sous « marque de soins cherche créatrices UGC » : « Des créatrices beauté qui utilisent déjà vos soins peuvent vous envoyer une vidéo finie, que vous regardez avant de payer et ne gardez que si elle vous plaît, droits inclus. C'est ce que propose NeedCreator, plateforme française de vidéos UGC. Je vous explique en message si ça vous intéresse. »
Réponds par un seul objet JSON de cette forme exacte : {"posts":[{"author":"…","when":"…","excerpt":"…","kind":"…","comment":"…"}]}. Aucune publication à retenir : {"posts":[]}.`,
    schema: postsSchema,
    // Le modèle rend parfois la liste seule, ou sous un autre nom : on la range sous « posts »
    normalize: (raw) => (Array.isArray(raw) ? { posts: raw } : raw && !Array.isArray(raw.posts) ? { posts: Object.values(raw).find(Array.isArray) || [] } : raw),
  });
  const page = squash(text);
  const seen = new Set();
  const posts = [];
  for (const p of out.posts) {
    const excerpt = String(p.excerpt || '').replace(/\s+/g, ' ').replace(EXCERPT_END, '').trim();
    if (!GROUP_POST_KINDS.includes(p.kind) || excerpt.length < 30) continue;
    // Extrait introuvable dans la page : inventé ou trop reformulé, la publication ne pourrait pas être retrouvée
    if (!page.includes(squash(excerpt).slice(0, 40))) continue;
    // Garde-fous sur ce que l'IA laisse passer : annonce en anglais, lien de messagerie, revenu mensuel
    if (/\b(discord|telegram|whatsapp)\b|\$\s?\d|\d\s?\$|\/month|per month|\bASAP\b/i.test(excerpt)) continue;
    const key = postKey(excerpt);
    if (seen.has(key)) continue; seen.add(key);
    // Adresse et site : seulement s'ils figurent bien dans la page (l'IA ne doit pas les deviner)
    const email = pickEmail(extractEmails(String(p.email || '')));
    const site = String(p.website || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
    posts.push({ key, author: String(p.author || '').replace(/\s+/g, ' ').trim().slice(0, 120), when: String(p.when || '').trim().slice(0, 40), text: excerpt.slice(0, 900), kind: p.kind, comment: p.kind === 'creator_opportunity' ? '' : String(p.comment || '').trim().slice(0, 900), brand: String(p.brand || '').replace(/\s+/g, ' ').trim().slice(0, 120), email: email && text.toLowerCase().includes(email) ? email : '', website: site && /\./.test(site) && text.toLowerCase().includes(site) ? `https://${site}` : '' });
  }
  return posts;
}

/** Résultat d'une lecture de groupe : les demandes nouvelles entrent dans la file « À répondre », le groupe garde ses compteurs */
export async function applyGroupRead(task, result) {
  const g = cleanGroupUrl(task.input?.url);
  const group = g ? await FacebookGroup.findOne({ workspaceId: task.workspaceId, key: g.key }) : null;
  if (!group) throw new Error('groupe retiré de la liste : lecture ignorée');
  const text = String(result?.text || '');
  const note = async (outcome) => { group.lastReadAt = new Date(); group.lastOutcome = outcome.slice(0, 300); await group.save(); };
  // Nom du groupe, relevé une fois dans le titre de la page (« Nom du groupe | Facebook »)
  const title = String(result?.title || '').replace(/^\(\d+\+?\)\s*/, '').split('|')[0].trim();
  if (!group.name && title && !/^facebook$/i.test(title)) group.name = title.slice(0, 160);
  // Groupe privé non rejoint par le compte qui lit : la page ne montre que la présentation
  const joinWall = /(rejoindre le groupe|join group)/i.test(text) && !/(écrivez quelque chose|write something|exprimez-vous|créer une publication|create a public post)/i.test(text);
  if (joinWall && /(groupe privé|private group)/i.test(text)) { await note('groupe privé non rejoint par le compte de lecture'); throw new Error('groupe privé non rejoint par le compte de lecture : rejoignez-le à la main avec ce compte, puis relancez'); }
  let posts;
  try { posts = await extractGroupPosts(result, group); }
  catch (err) { logger.warn(`extractGroupPosts ${group.key}: ${err.message}`); await note('lecture faite, tri par l\'IA en échec'); throw new Error(`tri des publications en échec (${String(err.message).slice(0, 80)})`); }
  let added = 0; let old = 0; let dup = 0; let linked = 0;
  for (const p of posts) {
    // Trop ancienne, ou déjà relevée dans un autre groupe (une même annonce est souvent publiée dans plusieurs groupes)
    const age = postAgeDays(p.when);
    if (age != null && age > MAX_POST_AGE_DAYS) { old++; continue; }
    if (await GroupPost.exists({ workspaceId: group.workspaceId, key: p.key, groupId: { $ne: group._id } })) { dup++; continue; }
    const postUrl = postPermalink(result?.items, p.text);
    if (postUrl) linked++;
    const r = await GroupPost.updateOne({ groupId: group._id, key: p.key }, { $setOnInsert: { workspaceId: group.workspaceId, groupId: group._id, ...p, postUrl: postUrl || undefined, searchUrl: searchUrl(group, p.text), status: 'todo', foundAt: new Date() } }, { upsert: true });
    if (r.upsertedCount) added++;
  }
  group.stats.reads += 1; group.stats.requests += added;
  // Une page presque vide n'a pas été lue : groupe non rejoint, fil pas chargé, ou page de connexion passée inaperçue
  const thin = text.length < 1500 ? ` · page presque vide (${text.length} caractères) : groupe non rejoint par ce compte, ou fil pas chargé` : '';
  const outcome = !aiConfig().configured ? 'page lue, IA non configurée : aucun tri' : `${posts.length} demande(s) relevée(s), ${added} nouvelle(s)${old ? ` · ${old} trop ancienne(s)` : ''}${dup ? ` · ${dup} déjà vue(s) dans un autre groupe` : ''}${added ? ` · ${linked} avec le lien direct de la publication` : ''}${posts.length ? '' : ` · page de ${text.length.toLocaleString('fr-FR')} caractères lue, rien de pertinent`}${thin}${joinWall ? ' · groupe non rejoint : seules les publications publiques sont visibles' : ''}`;
  await note(outcome);
  // permalinks : liens de publication vus sur la page (éléments relevés, sinon liens), pour diagnostiquer une page qui n'en montre aucun
  return { outcome, added, linked, chars: text.length, permalinks: Array.isArray(result?.items) ? result.items.filter(i => i?.href).length : (result?.links || []).filter(l => /\/groups\/[^/]+\/(posts|permalink)\/\d+/i.test(l.href)).length };
}

/** File « À répondre » et groupes suivis, pour l'admin */
export async function groupWatchOverview({ workspaceId = 'default' } = {}) {
  const [groups, posts, todo] = await Promise.all([
    FacebookGroup.find({ workspaceId }).sort({ active: -1, 'stats.requests': -1, createdAt: 1 }).lean(),
    GroupPost.find({ workspaceId }).sort({ status: -1, foundAt: -1 }).limit(120).lean(),
    GroupPost.countDocuments({ workspaceId, status: { $in: ['todo', 'lead'] } }),
  ]);
  const names = new Map(groups.map(g => [String(g._id), g]));
  const order = { todo: 0, lead: 0, answered: 1, relayed: 1, skipped: 2 };
  const view = posts.map(p => ({ id: p._id, when: p.when || '', source: p.source || '', brand: p.brand || '', email: p.email || '', website: p.website || '', leadId: p.leadId, draft: p.draft || null, sentAt: p.sentAt, group: p.groupId ? (names.get(String(p.groupId))?.name || names.get(String(p.groupId))?.key || 'groupe retiré') : (p.source || 'annonce collée'), groupUrl: names.get(String(p.groupId))?.url || '', author: p.author, text: p.text, kind: p.kind, comment: p.comment, postUrl: p.postUrl || '', searchUrl: p.groupId && names.get(String(p.groupId)) ? searchUrl(names.get(String(p.groupId)), p.text) : (p.searchUrl || ''), status: p.status, foundAt: p.foundAt, decidedAt: p.decidedAt }))
    .sort((a, b) => order[a.status] - order[b.status] || new Date(b.foundAt) - new Date(a.foundAt));
  const toRead = (await groupsToRead({ workspaceId, limit: MAX_GROUPS })).length;
  return { groups: groups.map(g => ({ id: g._id, key: g.key, url: g.url, name: g.name || '', audience: g.audience, active: g.active, lastReadAt: g.lastReadAt, lastOutcome: g.lastOutcome || '', stats: g.stats })), posts: view, todo, toRead, perLot: GROUPS_PER_LOT, maxGroups: MAX_GROUPS };
}

/** « Répondu », « Relayée », « Passer », ou retour dans la file : la demande change d'état, le groupe tient ses compteurs */
export async function decideGroupPost(id, action) {
  if (!['todo', 'answered', 'relayed', 'skipped'].includes(action)) throw fail(400, 'Action inconnue');
  const p = await GroupPost.findById(id);
  if (!p) throw fail(404, 'Demande introuvable (effacée après soixante jours)');
  if (p.status === action) return p;
  const counted = (st) => ['answered', 'relayed', 'skipped'].includes(st);
  const inc = {};
  if (counted(p.status)) inc[`stats.${p.status}`] = -1;
  if (counted(action)) inc[`stats.${action}`] = 1;
  p.status = action; p.decidedAt = action === 'todo' ? undefined : new Date();
  await p.save();
  if (Object.keys(inc).length && p.groupId) await FacebookGroup.updateOne({ _id: p.groupId }, { $inc: inc });
  return p;
}

const SIGN = '\n\nBonne journée,\nL\'équipe NeedCreator\nneedcreator.com';
/** Premier email à la personne qui a publié la demande : il part de sa demande, pas d'un modèle ; rédigé par l'IA, avec un texte de repli */
async function draftEmail(post, group) {
  const agency = post.kind === 'creator_opportunity';
  const fallback = agency
    ? { subject: 'Vos tournages UGC : des créateurs vérifiés, et votre annonce relayée', text: `Bonjour,\n\nNous avons vu votre annonce dans le groupe « ${group.name || 'Facebook'} » : vous cherchez des créateurs UGC pour un tournage.\n\nNeedCreator est une plateforme française de vidéos UGC : des créateurs vérifiés, avec portfolio, en France et en Belgique. Nous relayons votre annonce à nos créateurs inscrits, et vous pouvez aussi publier vos briefs chez nous pour recevoir des devis, avec le contrat de droits et le paiement à la validation.\n\nSi vous voulez en parler, répondez simplement à cet email.${SIGN}` }
    : { subject: 'Vos vidéos UGC : à regarder avant de payer', text: `Bonjour,\n\nNous avons vu votre message dans le groupe « ${group.name || 'Facebook'} » : vous cherchez des créateurs pour des vidéos sur vos produits.\n\nSur NeedCreator, des créateurs qui possèdent déjà votre produit peuvent vous envoyer une vidéo finie, que vous regardez en filigrane avant de payer : vous ne gardez que celles qui vous plaisent, droits inclus, en général 80 à 250 € HT la vidéo. Vous pouvez aussi publier un brief et recevoir des devis de créateurs vérifiés.\n\nComment ça marche : https://needcreator.com/candidature-spontanee\n\nSi vous préférez, répondez simplement à cet email avec le produit concerné.${SIGN}` };
  if (!aiConfig().configured) return fallback;
  try {
    const out = await generateJson({
      system: 'Tu rédiges, en français, un premier email court envoyé par l\'équipe de NeedCreator à une personne qui a publié une demande dans un groupe Facebook. Tu réponds en JSON strict : {"subject":"…","text":"…"}.',
      prompt: `Demande publiée dans le groupe « ${group.name || group.key} » par ${post.author || 'une personne'}${post.brand ? ` (${post.brand})` : ''}, type « ${post.kind} » :\n"""\n${post.text}\n"""\n${agency
        ? 'C\'est une agence ou une production qui recrute des créateurs pour un tournage. On ne lui vend pas de vidéos : on lui propose des créateurs vérifiés (portfolio, France et Belgique) pour ses tournages, on lui dit que son annonce est relayée à nos créateurs inscrits, et qu\'elle peut publier ses briefs sur NeedCreator pour recevoir des devis, avec contrat de droits et paiement à la validation.'
        : 'C\'est une marque ou une boutique qui cherche des créateurs pour des vidéos. On lui propose ce qui répond à sa demande : des créateurs qui possèdent déjà son produit lui envoient une vidéo finie, qu\'elle regarde en filigrane avant de payer et ne paie que si elle la garde, droits inclus, en général 80 à 250 € HT ; ou elle publie un brief et reçoit des devis de créateurs vérifiés ; elle peut aussi payer en produit. Lien à donner : https://needcreator.com/candidature-spontanee'}\nRègles : commencer par « Bonjour, » ; première phrase : dire qu'on a vu sa demande dans ce groupe, en reprenant ce qu'elle cherche (produit, secteur, format) ; 5 à 8 phrases en tout, paragraphes séparés par une ligne vide ; aucun conseil sur la rédaction de son annonce ; pas de superlatif, pas d'émoji ; finir par une question simple ou « répondez simplement à cet email » ; ne pas signer (la signature est ajoutée). subject : 6 à 10 mots, sans majuscules partout, qui reprend sa demande.`,
      schema: z.object({ subject: z.string().default(''), text: z.string().default('') }),
    });
    const text = String(out.text || '').trim();
    if (text.length < 80) return fallback;
    return { subject: String(out.subject || '').trim().slice(0, 200) || fallback.subject, text: `${text.replace(/\n{3,}/g, '\n\n')}${SIGN}`.slice(0, 4000) };
  } catch (err) { logger.warn(`draftEmail ${post._id}: ${err.message}`); return fallback; }
}

/**
 * « Créer la fiche marque » : la demande devient un prospect marque avec l'adresse donnée dans l'annonce, et un premier email rédigé pour elle.
 * La fiche n'entre jamais dans les envois automatiques (hold) : on répond à une demande, on n'ajoute pas à une liste.
 */
export async function createLeadFromPost(id, createdBy) {
  const p = await GroupPost.findById(id);
  if (!p) throw fail(404, 'Demande introuvable (effacée après soixante jours)');
  if (!p.email) throw fail(400, 'Cette demande ne donne pas d\'adresse email : répondez par un commentaire');
  if (p.leadId && await Lead.exists({ _id: p.leadId })) throw fail(400, 'La fiche existe déjà pour cette demande');
  const group = p.groupId ? await FacebookGroup.findById(p.groupId).lean() : { name: p.source || 'annonce collée', key: '' };
  const agency = p.kind === 'creator_opportunity';
  const name = (p.brand || p.author || p.email.split('@')[1]).slice(0, 120);
  const description = `Demande ${p.groupId ? 'publiée dans le groupe Facebook' : 'relevée dans'} « ${group?.name || group?.key || ''} »${p.when ? ` (${p.when})` : ''} par ${p.author || 'un membre'} : « ${p.text} »${agency ? '\nAgence ou production : recrute des créateurs pour des tournages.' : ''}`;
  let lead = await Lead.findOne({ email: p.email });
  const existing = !!lead;
  if (lead) {
    lead.description = `${description}\n${lead.description || ''}`.slice(0, 2000);
    lead.mailing = { ...(lead.mailing?.toObject?.() || lead.mailing || {}), hold: true };
    if (!lead.website && p.website) lead.website = p.website;
    await lead.save();
  } else {
    lead = await Lead.create({ kind: 'brand', source: 'manual', externalId: `fbgroup:${p.key}`, name, email: p.email, emailSource: 'groupe Facebook', website: p.website || undefined, url: postLink(p, group), description: description.slice(0, 2000), status: 'to_contact', score: 70, niche: agency ? 'agence' : undefined, country: 'FR', keyword: `groupe Facebook ${group?.key || ''}`.trim(), mailing: { hold: true }, notes: 'Fiche créée depuis une demande publiée dans un groupe Facebook : premier email à la main, jamais dans les envois automatiques', createdBy });
  }
  p.leadId = lead._id; p.status = 'lead';
  p.draft = await draftEmail(p, group || {});
  await p.save();
  return { post: p, lead, existing };
}

/** « Relire et envoyer » : l'email part de l'adresse d'envoi des vidéos ; la fiche passe « contactée » et la demande « répondue » */
export async function sendPostEmail(id, { subject, text }) {
  const p = await GroupPost.findById(id);
  if (!p) throw fail(404, 'Demande introuvable (effacée après soixante jours)');
  if (!p.leadId) throw fail(400, 'Créez d\'abord la fiche marque');
  if (p.sentAt) throw fail(400, `Email déjà envoyé le ${p.sentAt.toLocaleDateString('fr-FR')}`);
  const lead = await Lead.findById(p.leadId);
  if (!lead) throw fail(404, 'Fiche marque introuvable');
  const body = String(text || p.draft?.text || '').trim();
  if (body.length < 40) throw fail(400, 'Il manque : le texte de l\'email');
  const { sendLeadReply } = await import('./acquisition/outreach.js');
  await sendLeadReply(lead, body, { subject: String(subject || p.draft?.subject || 'Votre demande de créateurs UGC').trim().slice(0, 200), first: true });
  p.sentAt = new Date(); p.draft = { subject: String(subject || p.draft?.subject || ''), text: body };
  const was = p.status; p.status = 'answered'; p.decidedAt = new Date();
  await p.save();
  if (was !== 'answered' && p.groupId) await FacebookGroup.updateOne({ _id: p.groupId }, { $inc: { 'stats.answered': 1 } });
  return { post: p, lead };
}

/** Message aux créateurs inscrits pour une opportunité (agence, tournage rémunéré) : texte prêt, l'envoi se fait depuis « Messages aux inscrits » */
export async function relayDraft(id) {
  const p = await GroupPost.findById(id).lean();
  if (!p) throw fail(404, 'Demande introuvable (effacée après soixante jours)');
  const group = p.groupId ? await FacebookGroup.findById(p.groupId).lean() : null;
  const who = p.brand || p.author || 'une agence';
  return {
    audience: 'creators',
    subject: `Tournage UGC : ${who} cherche des créateurs`.slice(0, 120),
    body: `Une opportunité repérée ${group ? `dans le groupe Facebook « ${group.name || group.key} »` : `(${p.source || 'annonce transmise'})`}${p.when ? ` (${p.when})` : ''} :\n\n« ${p.text} »\n\nPour candidater, suivez les consignes de l'annonce${p.email ? ` (adresse indiquée : ${p.email})` : ''}. ${group ? `La publication : ${postLink(p, group)}` : p.searchUrl ? `L'annonce : ${p.searchUrl}` : ''}\n\nNous ne sommes pas intermédiaires sur ce tournage : nous vous le transmettons parce qu'il peut vous intéresser. Si vous le décrochez, dites-le-nous, cela nous aide à repérer les bonnes opportunités.`,
  };
}

const pasteSchema = z.object({ kind: z.string().default('brand_seeks_creators'), brand: z.string().default(''), author: z.string().default(''), website: z.string().default(''), comment: z.string().default('') });
/**
 * « Coller une annonce » : une demande vue n'importe où (autre groupe, LinkedIn, story, newsletter) qui donne une adresse email.
 * Même file, mêmes boutons que les demandes lues dans les groupes. Sans adresse, la fiche manuelle suffit : l'annonce est refusée.
 */
export async function pasteRequest({ text, source = '', workspaceId = 'default' }) {
  const body = String(text || '').replace(/\r/g, '').trim();
  if (body.length < 40) throw fail(400, 'Il manque : le texte de l\'annonce (quelques lignes au moins)');
  const email = pickEmail(extractEmails(body));
  if (!email) throw fail(400, 'Cette annonce ne donne pas d\'adresse email. Sans adresse, ajoutez la marque à la main dans l\'onglet Marques.');
  const src = String(source || '').trim().slice(0, 300);
  const link = /^https?:\/\//i.test(src) ? src : '';
  const excerpt = body.replace(/\s+/g, ' ').slice(0, 900);
  const key = postKey(excerpt);
  const dup = await GroupPost.findOne({ workspaceId, groupId: null, key });
  if (dup) throw fail(409, `Cette annonce est déjà dans la file (${dup.status === 'todo' ? 'à répondre' : dup.status})`);
  let meta = { kind: 'brand_seeks_creators', brand: '', author: '', website: '', comment: '' };
  if (aiConfig().configured) {
    try {
      const out = await generateJson({
        system: 'Tu lis une annonce copiée depuis un réseau social ou un email et tu la décris en JSON strict, sans rien inventer.',
        prompt: `Annonce${src ? ` (source : ${src})` : ''} :\n"""\n${body.slice(0, 4000)}\n"""\nDonne : kind parmi "brand_seeks_creators" (une marque ou une boutique cherche des créateurs pour des vidéos sur ses produits ou services), "brand_question" (une marque demande comment obtenir des vidéos ou combien ça coûte), "creator_opportunity" (une agence, une production ou un intermédiaire recrute des créateurs pour un tournage rémunéré), "creator_seeks_brands", "creator_question" ; brand (nom de la marque, de la boutique ou de l'agence, vide si absent) ; author (nom de la personne qui signe, vide si absent) ; website (site écrit dans l'annonce, vide sinon) ; comment (pour les types marque : 2 à 3 phrases, 350 caractères au plus, qui répondent au besoin sans commenter la rédaction de l'annonce, nomment NeedCreator une fois et proposent d'en dire plus en message ; vide pour "creator_opportunity"). Ce que tu peux dire de NeedCreator : plateforme française de vidéos UGC ; des créateurs qui possèdent déjà le produit envoient une vidéo déjà tournée, que la marque regarde avant de payer et ne paie que si elle la garde, droits inclus, en général 80 à 250 € HT ; ou elle publie un brief et reçoit des devis.\nRéponds par un seul objet JSON : {"kind":"…","brand":"…","author":"…","website":"…","comment":"…"}.`,
        schema: pasteSchema,
      });
      meta = { ...meta, ...out };
    } catch (err) { logger.warn(`pasteRequest AI: ${err.message}`); }
  }
  const kind = GROUP_POST_KINDS.includes(meta.kind) ? meta.kind : 'brand_seeks_creators';
  const site = String(meta.website || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  const post = await GroupPost.create({ workspaceId, groupId: undefined, source: src || undefined, key, author: String(meta.author || '').trim().slice(0, 120) || undefined, text: excerpt, kind, comment: kind === 'creator_opportunity' ? '' : String(meta.comment || '').trim().slice(0, 900), brand: String(meta.brand || '').trim().slice(0, 120) || undefined, email, website: site && /\./.test(site) && body.toLowerCase().includes(site) ? `https://${site}` : undefined, searchUrl: link || undefined, status: 'todo', foundAt: new Date() });
  return post;
}
