import crypto from 'crypto';
import { z } from 'zod';
import FacebookGroup, { GroupPost, GROUP_AUDIENCES, GROUP_POST_KINDS } from '../models/GroupWatch.js';
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

const squash = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim();
const postKey = (text) => crypto.createHash('sha1').update(squash(text).slice(0, 160)).digest('hex').slice(0, 24);
/** Recherche dans le groupe sur les premiers mots de la publication : le chemin le plus sûr pour la retrouver */
const searchUrl = (group, text) => `${group.url}search/?q=${encodeURIComponent(String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(w => !/^https?:/i.test(w)).slice(0, 8).join(' '))}`;

const AUDIENCE_HINT = {
  creators: 'un groupe de créateurs UGC : des marques y publient parfois « cherche créateurs », des créateurs y demandent comment trouver des marques ou combien facturer',
  brands: 'un groupe de marques et d\'e-commerçants : des fondateurs y demandent comment obtenir des vidéos pour leurs publicités, ou combien coûte une vidéo UGC',
  ads: 'un groupe d\'annonceurs (publicité Meta, TikTok) : on y cherche des créations publicitaires qui convertissent',
  other: 'un groupe professionnel',
};

const postsSchema = z.object({ posts: z.array(z.object({ author: z.string().default(''), when: z.string().default(''), excerpt: z.string().default(''), kind: z.string().default('other'), comment: z.string().default('') })).default([]) });
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
- "creator_question" : un créateur demande combien facturer, comment faire un devis, un contrat ou céder ses droits.
Ignore tout le reste, en particulier : les créateurs qui se présentent ou proposent leurs services ; les offres d'emploi, de stage ou d'alternance ; les castings de modèles, de figurants ou d'acteurs ; la couverture d'un événement (reportage, photos sur place) ; les publicités, formations et coachings à vendre ; les annonces en anglais ou hors France, Belgique et Suisse ; tout ce qui renvoie vers Discord, Telegram ou WhatsApp ou promet un revenu mensuel ; les règles du groupe, sondages, remerciements.
Pour chaque publication retenue : author (le nom affiché de son auteur), when (la date ou l'ancienneté affichée près du nom, telle quelle : « 2 h », « 3 sept. », vide si absente), excerpt (les 200 à 300 premiers caractères de la publication, recopiés mot pour mot, sans les mots d'interface comme « En voir plus »), kind, comment.
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
    posts.push({ key, author: String(p.author || '').replace(/\s+/g, ' ').trim().slice(0, 120), when: String(p.when || '').trim().slice(0, 40), text: excerpt.slice(0, 900), kind: p.kind, comment: String(p.comment || '').trim().slice(0, 900) });
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
  let added = 0;
  for (const p of posts) {
    const r = await GroupPost.updateOne({ groupId: group._id, key: p.key }, { $setOnInsert: { workspaceId: group.workspaceId, groupId: group._id, ...p, searchUrl: searchUrl(group, p.text), status: 'todo', foundAt: new Date() } }, { upsert: true });
    if (r.upsertedCount) added++;
  }
  group.stats.reads += 1; group.stats.requests += added;
  // Une page presque vide n'a pas été lue : groupe non rejoint, fil pas chargé, ou page de connexion passée inaperçue
  const thin = text.length < 1500 ? ` · page presque vide (${text.length} caractères) : groupe non rejoint par ce compte, ou fil pas chargé` : '';
  const outcome = !aiConfig().configured ? 'page lue, IA non configurée : aucun tri' : `${posts.length} demande(s) relevée(s), ${added} nouvelle(s)${posts.length ? '' : ` · page de ${text.length.toLocaleString('fr-FR')} caractères lue, rien de pertinent`}${thin}${joinWall ? ' · groupe non rejoint : seules les publications publiques sont visibles' : ''}`;
  await note(outcome);
  return { outcome, added, chars: text.length, permalinks: (result?.links || []).filter(l => /\/groups\/[^/]+\/(posts|permalink)\/\d+/i.test(l.href)).length };
}

/** File « À répondre » et groupes suivis, pour l'admin */
export async function groupWatchOverview({ workspaceId = 'default' } = {}) {
  const [groups, posts, todo] = await Promise.all([
    FacebookGroup.find({ workspaceId }).sort({ active: -1, 'stats.requests': -1, createdAt: 1 }).lean(),
    GroupPost.find({ workspaceId }).sort({ status: -1, foundAt: -1 }).limit(120).lean(),
    GroupPost.countDocuments({ workspaceId, status: 'todo' }),
  ]);
  const names = new Map(groups.map(g => [String(g._id), g]));
  const order = { todo: 0, answered: 1, skipped: 2 };
  const view = posts.map(p => ({ id: p._id, when: p.when || '', group: names.get(String(p.groupId))?.name || names.get(String(p.groupId))?.key || 'groupe retiré', groupUrl: names.get(String(p.groupId))?.url || '', author: p.author, text: p.text, kind: p.kind, comment: p.comment, searchUrl: p.searchUrl, status: p.status, foundAt: p.foundAt, decidedAt: p.decidedAt }))
    .sort((a, b) => order[a.status] - order[b.status] || new Date(b.foundAt) - new Date(a.foundAt));
  const toRead = (await groupsToRead({ workspaceId, limit: MAX_GROUPS })).length;
  return { groups: groups.map(g => ({ id: g._id, key: g.key, url: g.url, name: g.name || '', audience: g.audience, active: g.active, lastReadAt: g.lastReadAt, lastOutcome: g.lastOutcome || '', stats: g.stats })), posts: view, todo, toRead, perLot: GROUPS_PER_LOT, maxGroups: MAX_GROUPS };
}

/** « Répondu » ou « Passer » sur une demande : elle quitte la file, le groupe garde le compte */
export async function decideGroupPost(id, action) {
  const map = { answered: 'answered', skipped: 'skipped', todo: 'todo' };
  if (!map[action]) throw fail(400, 'Action inconnue');
  const p = await GroupPost.findById(id);
  if (!p) throw fail(404, 'Demande introuvable (effacée après soixante jours)');
  if (p.status === map[action]) return p;
  const inc = {};
  if (p.status !== 'todo') inc[`stats.${p.status}`] = -1;
  if (map[action] !== 'todo') inc[`stats.${map[action]}`] = 1;
  p.status = map[action]; p.decidedAt = map[action] === 'todo' ? undefined : new Date();
  await p.save();
  if (Object.keys(inc).length) await FacebookGroup.updateOne({ _id: p.groupId }, { $inc: inc });
  return p;
}
