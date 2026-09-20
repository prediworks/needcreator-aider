import Lead from '../../models/Lead.js';
import User from '../../models/User.js';
import { getSetting, setSetting, SETTINGS } from '../../models/Setting.js';
import { mailingProvider, mailingConfig } from '../mailing/index.js';
import { config } from '../../config/index.js';
import { notifyAdmins } from '../adminAlerts.js';
import { classifyReply, prepareOfferedBrief } from './replies.js';
import logger from '../../utils/logger.js';

export const LIST_NAMES = { creator: 'NeedCreator · Prospection créateurs', brand: 'NeedCreator · Prospection marques' };
export const isGeneric = (email) => /^(contact|hello|bonjour|info|admin|support|sales|commercial|marketing|presse|press|team|equipe)@/.test(email || '');

export async function outreachSettings() {
  const [autoSend, dailyLimit, minScore, pauseRate] = await Promise.all([
    getSetting(SETTINGS.mailingAutoSend.key, false), getSetting(SETTINGS.mailingDailyLimit.key, 50), getSetting(SETTINGS.mailingMinScore.key, 60), getSetting(SETTINGS.mailingPauseBounceRate.key, 5),
  ]);
  const autoReply = await getSetting(SETTINGS.mailingAutoReplyInterested.key, false);
  return { autoSend: !!autoSend, autoReply: !!autoReply, dailyLimit: Number(dailyLimit) || 50, minScore: Number(minScore) || 0, pauseRate: Number(pauseRate) || 0, ...mailingConfig() };
}

/** Champs poussés dans l'outil de mailing (snake_case) : utilisables comme variables dans les modèles d'emails */
/** Prénom utilisable dans « Bonjour … » : celui relevé par l'IA, sinon le premier mot du nom seulement s'il ressemble à un prénom (pas un pseudo du type « ugcbymarie ») */
function safeFirstName(lead) {
  if (lead.firstName) return String(lead.firstName).trim();
  if (lead.kind === 'brand') return '';
  const w = String(lead.name || '').replace(/^@/, '').split(/[\s|·–-]/)[0];
  return /^[A-ZÀ-Ý][a-zà-ÿ]{1,14}$/.test(w) && !/ugc|creat|créat|studio|officiel/i.test(w) ? w : '';
}

function contactOf(lead) {
  const handle = (lead.handle || '').replace(/^@/, '');
  const base = { email: lead.email, first_name: safeFirstName(lead), greeting: safeFirstName(lead) ? `Bonjour ${safeFirstName(lead)},` : 'Bonjour,', company_name: lead.kind === 'brand' ? lead.name : '', niche: lead.niche || '', paragraph: lead.emailParagraph || '', message: lead.message || '', score: lead.score ?? '', source: lead.source, kind: lead.kind };
  if (lead.kind === 'creator') return { ...base, username: handle, profile_url: lead.url || '', followers: lead.stats?.subscribers ?? '', signup_link: `${config.cors.origin}/register?role=creator&from=${encodeURIComponent(handle)}` };
  return { ...base, website: lead.website || '', ads: lead.stats?.ads ?? '', signup_link: `${config.cors.origin}/register?role=brand` };
}

/**
 * Pousse vers l'outil de mailing : prospects « À contacter » (validés à la main) puis « Qualifiés » avec score ≥ minimum,
 * email non générique pour les créateurs, jamais déjà poussés, hors liste de blocage ; dans la limite quotidienne.
 */
export async function pushToMailing({ limit, force = false, ids = null } = {}) {
  const s = await outreachSettings();
  const provider = mailingProvider();
  if (!provider) return { pushed: 0, reason: 'mailing non configuré' };
  const max = limit ?? s.dailyLimit;
  const base = { email: { $ne: null }, 'mailing.pushedAt': null, status: { $in: ids ? ['new', 'to_contact', 'qualified'] : ['to_contact', 'qualified'] } };
  const filter = ids ? { ...base, _id: { $in: ids } } : base;
  const candidates = await Lead.find(filter).sort({ status: -1, score: -1 }).limit(max * 3).lean(); // to_contact avant qualified (ordre alphabétique inverse)
  const blocked = new Set(await provider.blocklist().catch(() => []));
  const byKind = { creator: [], brand: [] };
  const skipped = { lowScore: 0, generic: 0, blocked: 0, registered: 0 };
  for (const l of candidates) {
    if (byKind.creator.length + byKind.brand.length >= max) break;
    const validated = l.status === 'to_contact' || force || !!ids;
    if (!validated && (l.score ?? 0) < s.minScore) { skipped.lowScore++; continue; }
    if (!validated && l.kind === 'creator' && isGeneric(l.email)) { skipped.generic++; continue; }
    if (blocked.has(l.email) || blocked.has(l.email.split('@')[1])) { skipped.blocked++; await Lead.updateOne({ _id: l._id }, { $set: { status: 'rejected', notes: 'Adresse dans la liste de blocage de l\'outil de mailing' } }); continue; }
    if (await User.exists({ email: l.email })) { skipped.registered++; await Lead.updateOne({ _id: l._id }, { $set: { status: 'registered' } }); continue; }
    byKind[l.kind].push(l);
  }
  let pushed = 0;
  for (const kind of ['creator', 'brand']) {
    if (!byKind[kind].length) continue;
    const list = await provider.ensureList(LIST_NAMES[kind]);
    await provider.pushContacts(list.id, byKind[kind].map(contactOf));
    await Lead.updateMany({ _id: { $in: byKind[kind].map(l => l._id) } }, { $set: { status: 'contacted', contactedAt: new Date(), contactedVia: provider.name, 'mailing.provider': provider.name, 'mailing.listId': list.id, 'mailing.pushedAt': new Date() } });
    pushed += byKind[kind].length;
  }
  logger.info(`Outreach push: ${pushed} contact(s) → ${provider.name} (${JSON.stringify(skipped)})`);
  return { pushed, skipped, provider: provider.name };
}

/** Classe une réponse avec l'IA, prépare la réponse, l'envoie si « intéressé » et réponse automatique activée */
export async function handleReply(lead, provider, s, out = {}) {
  try {
    const c = await classifyReply(lead, lead.mailing.replyText);
    if (!c) return lead;
    lead.mailing.replyIntent = c.intent; lead.mailing.replySummary = c.summary; lead.mailing.replySuggestion = c.reply;
    // Marque intéressée : le brief promis dans la séquence est préparé depuis son site et joint à la réponse proposée
    if (lead.kind === 'brand' && c.intent === 'interested') {
      const offer = await prepareOfferedBrief(lead).catch(() => null);
      if (offer) { c.reply = `${c.reply.trim()}\n\n${offer.text}`.slice(0, 2400); lead.mailing.replySuggestion = c.reply; out.briefs = (out.briefs || 0) + 1; }
    }
    if (['refusal', 'unsubscribe'].includes(c.intent)) { lead.status = 'rejected'; lead.notes = [lead.notes, c.intent === 'unsubscribe' ? 'Demande de ne plus écrire' : 'A refusé'].filter(Boolean).join(' · '); }
    if (c.intent === 'out_of_office') lead.status = lead.mailing.pushedAt ? 'contacted' : lead.status;
    if (!lead.mailing.replyMessageId) lead.mailing.replyMessageId = await provider.findThread(lead.email).catch(() => null);
    out.classified = (out.classified || 0) + 1;
    if (c.intent === 'interested' && s.autoReply && !c.needsHuman && c.reply && lead.mailing.replyMessageId && !lead.mailing.replySentAt) {
      const html = c.reply.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
      await provider.sendReply(lead.mailing.replyMessageId, html);
      lead.mailing.replySentAt = new Date(); lead.mailing.replySentText = c.reply;
      out.autoReplied = (out.autoReplied || 0) + 1;
    }
    if (c.intent === 'unsubscribe' && lead.mailing.listId) await provider.removeFromSequences(lead.mailing.listId, lead.email).catch(() => 0);
  } catch (err) {
    lead.error = `Classement de la réponse : ${err.message}`.slice(0, 300);
    logger.warn(`handleReply ${lead._id}: ${err.message}`);
  }
  await lead.save();
  return lead;
}

/** Envoie une réponse (texte brut → HTML) dans le fil du prospect */
export async function sendLeadReply(lead, text) {
  const provider = mailingProvider();
  if (!provider) throw new Error('Outil de mailing non configuré');
  if (!lead.mailing?.replyMessageId) lead.mailing.replyMessageId = await provider.findThread(lead.email);
  if (!lead.mailing.replyMessageId) throw new Error('Fil de discussion introuvable dans l\'outil de mailing');
  const html = String(text).trim().split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  await provider.sendReply(lead.mailing.replyMessageId, html);
  lead.mailing.replySentAt = new Date(); lead.mailing.replySentText = String(text).trim().slice(0, 2000);
  await lead.save();
  return lead;
}

/**
 * Synchronisation depuis l'outil de mailing : réponses → « A répondu », désabonnés et rebonds → « Hors cible »,
 * inscrits → retirés des séquences. Pause automatique si le taux de rebond des 7 derniers jours dépasse le seuil.
 */
export async function syncFromMailing() {
  const provider = mailingProvider();
  if (!provider) return { synced: false, reason: 'mailing non configuré' };
  const s = await outreachSettings();
  const out = { replies: 0, classified: 0, autoReplied: 0, unsubscribed: 0, bounced: 0, removed: 0, bounceRate: null, paused: false };
  const since = new Date(Date.now() - 14 * 86400000);
  // Réponses
  for (const r of await provider.replies(since).catch(err => { logger.warn(`mailing replies: ${err.message}`); return []; })) {
    const lead = await Lead.findOne({ email: r.email, 'mailing.pushedAt': { $ne: null } });
    if (!lead || lead.mailing?.replyAt) continue;
    lead.status = ['registered'].includes(lead.status) ? lead.status : 'replied';
    lead.mailing.replyAt = r.at || new Date(); lead.mailing.replyText = String(r.text || '').slice(0, 2000);
    await lead.save(); out.replies++;
    await handleReply(lead, provider, s, out);
  }
  // Statistiques par contact : rebonds et désabonnements
  const stats = await provider.leadStats(since, new Date()).catch(err => { logger.warn(`mailing stats: ${err.message}`); return []; });
  let sent = 0, bounces = 0;
  for (const st of stats) {
    sent += st.sent; bounces += st.bounces;
    if (!st.bounces && !st.unsubscribes) continue;
    const lead = await Lead.findOne({ email: st.email, 'mailing.pushedAt': { $ne: null } });
    if (!lead) continue;
    if (st.bounces && !lead.mailing?.bounced) { lead.mailing.bounced = true; lead.status = 'rejected'; lead.notes = [lead.notes, 'Email en rebond (adresse invalide)'].filter(Boolean).join(' · '); out.bounced++; }
    if (st.unsubscribes && !lead.mailing?.unsubscribedAt) { lead.mailing.unsubscribedAt = new Date(); lead.status = 'rejected'; lead.notes = [lead.notes, 'Désabonné'].filter(Boolean).join(' · '); out.unsubscribed++; }
    await lead.save();
  }
  // Liste de blocage globale
  const blocked = new Set(await provider.blocklist().catch(() => []));
  if (blocked.size) {
    const r = await Lead.updateMany({ email: { $in: [...blocked] }, status: { $nin: ['rejected', 'registered'] } }, { $set: { status: 'rejected', notes: 'Désabonné (liste de blocage)' } });
    out.unsubscribed += r.modifiedCount;
  }
  // Inscrits : retirés des séquences
  const pushed = await Lead.find({ 'mailing.pushedAt': { $ne: null }, 'mailing.removedAt': null, status: { $ne: 'rejected' } }).select('_id email kind mailing status').lean();
  for (const l of pushed) {
    const u = await User.findOne({ email: l.email }).select('_id').lean();
    if (!u) continue;
    const removed = await provider.removeFromSequences(l.mailing.listId, l.email).catch(() => 0);
    await Lead.updateOne({ _id: l._id }, { $set: { status: 'registered', registeredUserId: u._id, 'mailing.removedAt': new Date() } });
    out.removed += removed ? 1 : 0;
  }
  // Garde-fou : taux de rebond
  if (sent >= 20) {
    out.bounceRate = Math.round((bounces / sent) * 1000) / 10;
    if (s.pauseRate > 0 && out.bounceRate > s.pauseRate && s.autoSend) {
      await setSetting(SETTINGS.mailingAutoSend.key, false);
      out.paused = true;
      notifyAdmins('Prospection : envoi automatique mis en pause', `<p>Le taux de rebond des 7 derniers jours est de ${out.bounceRate} % (seuil ${s.pauseRate} %). L'envoi automatique a été désactivé : vérifiez la qualité des adresses et l'expéditeur dans l'outil de mailing, puis réactivez-le dans Admin → Réglages → Prospection.</p>`).catch(() => {});
      logger.warn(`Outreach auto-send paused: bounce rate ${out.bounceRate} %`);
    }
  }
  logger.info(`Outreach sync: ${JSON.stringify(out)}`);
  return { synced: true, ...out };
}

/** Tâche planifiée : synchronisation puis envoi si activé */
export async function runScheduledOutreach() {
  if (!mailingConfig().configured) return { ran: false, reason: 'not configured' };
  const sync = await syncFromMailing().catch(err => ({ synced: false, error: err.message }));
  const s = await outreachSettings();
  if (!s.autoSend || sync.paused) return { ran: true, sync, push: { pushed: 0, reason: 'auto-send off' } };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const already = await Lead.countDocuments({ 'mailing.pushedAt': { $gte: today } });
  const remaining = Math.max(0, s.dailyLimit - already);
  const push = remaining ? await pushToMailing({ limit: remaining }).catch(err => ({ pushed: 0, error: err.message })) : { pushed: 0, reason: 'plafond du jour atteint' };
  return { ran: true, sync, push };
}

/**
 * Où en est chaque prospect vis-à-vis du mailing : chaque fiche tombe dans une seule case, dans l'ordre des filtres de l'envoi,
 * si bien que la somme des cases est égale au total. Sert à expliquer l'écart entre l'application et l'outil de mailing.
 */
export async function mailingBreakdown() {
  const s = await outreachSettings();
  const leads = await Lead.find({}).select('kind status email score mailing.pushedAt mailing.bounced mailing.unsubscribedAt mailing.replyAt notes').lean();
  const empty = () => ({ total: 0, pushed: 0, replied: 0, left: 0, noEmail: 0, rejected: 0, known: 0, registered: 0, toQualify: 0, lowScore: 0, generic: 0, eligible: 0 });
  const out = { creator: empty(), brand: empty(), minScore: s.minScore, dailyLimit: s.dailyLimit };
  for (const l of leads) {
    const b = out[l.kind]; if (!b) continue;
    b.total++;
    if (l.mailing?.pushedAt) {
      b.pushed++;
      if (l.mailing.replyAt) b.replied++;
      if (l.mailing.bounced || l.mailing.unsubscribedAt) b.left++;
      continue;
    }
    if (l.status === 'registered') b.registered++;
    else if (l.status === 'excluded') b.known++;
    else if (l.status === 'rejected') b.rejected++;
    else if (!l.email) b.noEmail++;
    else if (l.status === 'new') b.toQualify++;
    else if (l.status === 'contacted' || l.status === 'replied') b.known++; // contacté à la main, hors outil
    else if (l.status !== 'to_contact' && (l.score ?? 0) < s.minScore) b.lowScore++;
    else if (l.status !== 'to_contact' && l.kind === 'creator' && isGeneric(l.email)) b.generic++;
    else b.eligible++;
  }
  return out;
}
