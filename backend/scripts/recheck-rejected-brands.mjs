/**
 * Répare les deux défauts de lecture des profils Instagram du 29/09 au 02/10/2026 :
 *   A. marques écartées comme « compte personnel » : le contrôle lisait le pied de page d'Instagram (« Blog ») ;
 *   B. site lu à tort : un lien présent sur toutes les pages (muse.ai, meta.ai) était pris pour le site du compte, et inscrit sur les fiches.
 * Le texte et les liens de chaque page lue sont gardés avec la tâche : tout est rejugé sans relire Instagram.
 * Usage : node --env-file=.env scripts/recheck-rejected-brands.mjs [--apply] [--show <pseudo>] [--host <domaine>]
 * Sans --apply : listes et raisons, rien n'est modifié (l'IA est interrogée une fois par profil écarté : comptez quelques minutes).
 * Avec --apply : A. les fiches reconnues comme marques repassent « À qualifier », reçoivent leur vrai site, puis sont qualifiées ;
 *   les suggestions de créateurs refusées à tort reviennent « à valider » ; les comptes personnels restent écartés.
 *   B. le faux site est retiré des fiches, avec l'email et les comptes sociaux qui en venaient ; le vrai lien de bio le remplace quand il est connu.
 * --show <pseudo> : zone de profil lue, site retenu et verdict pour ce compte.
 * --host <domaine> : autre faux site à retirer (muse.ai et meta.ai par défaut), à répéter au besoin.
 * Jamais touchées en A : les fiches sorties ou rétablies à la main depuis (seules celles encore « Hors cible » avec la note du contrôle).
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import Lead from '../src/models/Lead.js';
import BrowserTask from '../src/models/BrowserTask.js';
import BrandSuggestion from '../src/models/BrandSuggestion.js';
import { brandVerdict, profileZone, profileSite, extractProfile, isOwnSite } from '../src/services/browserTasks.js';

const apply = process.argv.includes('--apply');
const arg = (name) => process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const show = String(arg('--show')[0] || '').replace(/^@/, '').trim().toLowerCase();
const WRONG = ['muse.ai', 'meta.ai', ...arg('--host').map(h => h.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))];
const NOTE = /(?: · )?Écarté : le compte Instagram est un particulier, pas une marque \([^)]*\)/;
const at = (url) => `@${(String(url || '').match(/instagram\.com\/([^/?#]+)/i) || [])[1] || url}`;
const hostOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const wrongSite = (u) => !!u && WRONG.some(h => hostOf(u) === h || hostOf(u).endsWith(`.${h}`));
/** Profil relu depuis la tâche gardée (site corrigé, avis de l'IA), puis verdict */
const judge = async (task, handle) => {
  const p = await extractProfile(task.result || {}, task.input.url);
  const v = brandVerdict(p, task.result?.text || '', { handle, extra: `${task.result?.meta?.description || ''} ${task.result?.meta?.ogDescription || ''}` });
  return { p, v };
};

await mongoose.connect(config.mongodb.uri);

if (show) {
  const t = await BrowserTask.findOne({ type: 'read_profile', 'input.url': new RegExp(`instagram\\.com/${show.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`, 'i'), 'result.text': { $exists: true } }).sort({ finishedAt: -1 }).lean();
  if (!t) console.log(`Aucune lecture gardée pour « ${show} ».`);
  else { const { p, v } = await judge(t, t.input.url); console.log(`${at(t.input.url)} · ${v.brand ? 'marque' : 'personne'} (${v.reason}) · site retenu : ${p.site || 'aucun'} · site lu à l'époque : ${t.extracted?.site || 'aucun'}\n--- zone de profil lue ---\n${profileZone(t.result?.text, t.input.url)}`); }
  await mongoose.disconnect(); process.exit(0);
}

/* ---------- A. Marques écartées comme « compte personnel » ---------- */
const tasks = await BrowserTask.find({ type: 'read_profile', outcome: /^compte personnel/ }).sort({ finishedAt: -1 }).select('input extracted result outcome finishedAt').lean();
// Une fiche a pu être lue plusieurs fois : la lecture la plus récente fait foi
const byLead = new Map(); const bySuggestion = new Map();
for (const t of tasks) {
  if (t.input?.suggestionId) { const k = String(t.input.suggestionId); if (!bySuggestion.has(k)) bySuggestion.set(k, t); }
  else if (t.input?.kind === 'brand' && t.input?.leadId) { const k = String(t.input.leadId); if (!byLead.has(k)) byLead.set(k, t); }
}
const leads = await Lead.find({ _id: { $in: [...byLead.keys()] }, status: 'rejected', notes: NOTE });
console.log(`A. Lectures de profil écartées comme « compte personnel » : ${byLead.size} · fiches encore « Hors cible » pour ce motif : ${leads.length}`);
if (leads.length) console.log('   Relecture en cours (une question à l\'IA par profil)…');
const brands = []; const persons = []; const unreadable = [];
for (const lead of leads) {
  const t = byLead.get(String(lead._id));
  if (!t.result?.text) { unreadable.push(lead); continue; }
  const { p, v } = await judge(t, lead.socials?.instagram || t.input.url);
  (v.brand ? brands : persons).push({ lead, p, v, handle: at(lead.socials?.instagram || t.input.url) });
}
const line = (x) => `   ${x.handle.padEnd(32)} ${x.v.reason}${x.p.site ? ` · ${hostOf(x.p.site)}` : ''}`;
console.log(`\n1. Reconnues comme marques : ${brands.length}`);
for (const x of brands) console.log(line(x));
console.log(`\n2. Comptes personnels : ${persons.length}`);
for (const x of persons) console.log(line(x));
if (unreadable.length) console.log(`\nTexte de la page non gardé (laissées telles quelles) : ${unreadable.length} · ${unreadable.map(l => l.handle || l.name).join(', ')}`);

const suggestions = [];
for (const [id, t] of bySuggestion) {
  const s = await BrandSuggestion.findOne({ _id: id, status: 'refused', auto: true, reason: /une personne, pas d'une marque/ });
  if (!s || !t.result?.text) continue;
  const { p, v } = await judge(t, s.instagram || t.input.url);
  if (v.brand) suggestions.push({ s, p, v });
}
if (suggestions.length) { console.log(`\n3. Suggestions de créateurs refusées à tort : ${suggestions.length}`); for (const x of suggestions) console.log(`   ${String(x.s.name).padEnd(32)} ${x.v.reason}`); }

/* ---------- B. Faux site inscrit sur les fiches ---------- */
const wrongRx = new RegExp(`^https?://(?:[a-z0-9-]+\\.)*(?:${WRONG.map(h => h.replace(/\./g, '\\.')).join('|')})(?:[/?#]|$)`, 'i');
const tainted = await Lead.find({ website: wrongRx });
const count = (values) => values.filter(Boolean).reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map());
const emails = count(tainted.map(l => l.email));
const socials = { instagram: count(tainted.map(l => l.socials?.instagram)), tiktok: count(tainted.map(l => l.socials?.tiktok)), facebook: count(tainted.map(l => l.socials?.facebook)), youtube: count(tainted.map(l => l.socials?.youtube)), linkedin: count(tainted.map(l => l.socials?.linkedin)) };
// Email venu du faux site : adresse de ce domaine, ou même adresse sur plusieurs de ces fiches, hors adresse lue dans la bio
const badEmail = (l) => !!l.email && !['bio', 'bouton e-mail'].includes(l.emailSource) && (WRONG.some(h => l.email.toLowerCase().endsWith(`@${h}`) || l.email.toLowerCase().endsWith(`.${h}`)) || emails.get(l.email) >= 2);
const badSocials = (l) => Object.keys(socials).filter(net => l.socials?.[net] && socials[net].get(l.socials[net]) >= 3);
const withBadEmail = tainted.filter(badEmail);
const mailed = withBadEmail.filter(l => l.mailing?.pushedAt || l.contactedAt);
console.log(`\nB. Fiches portant un faux site (${WRONG.join(', ')}) : ${tainted.length} (${tainted.filter(l => l.kind === 'brand').length} marques, ${tainted.filter(l => l.kind !== 'brand').length} créateurs)`);
console.log(`   dont un email venu de ce faux site : ${withBadEmail.length}${withBadEmail.length ? ` (${[...new Set(withBadEmail.map(l => l.email))].slice(0, 5).join(', ')})` : ''}`);
console.log(`   dont un compte social venu de ce faux site : ${tainted.filter(l => badSocials(l).length).length}`);
if (mailed.length) console.log(`   ATTENTION, déjà envoyées au mailing ou contactées avec cet email : ${mailed.length} · ${mailed.slice(0, 40).map(l => l.handle || l.name).join(', ')}`);
// Autres sites partagés par beaucoup de fiches lues par l'extension : à regarder, un autre lien de page a pu être pris pour un site
const shared = [...count((await Lead.find({ website: { $nin: [null, ''] }, $or: [{ profileCheckedAt: { $ne: null } }, { origin: 'extension' }] }).select('website').lean()).map(l => hostOf(l.website)))].filter(([h, n]) => n >= 4 && !WRONG.includes(h)).sort((x, y) => y[1] - x[1]).slice(0, 8);
if (shared.length) console.log(`   Autres sites portés par 4 fiches ou plus (à vérifier, --host <domaine> pour les retirer aussi) : ${shared.map(([h, n]) => `${h} × ${n}`).join(', ')}`);

if (!apply) console.log('\nRien n\'a été modifié. Ajoutez --apply pour rétablir les marques de la liste 1' + (suggestions.length ? ', les suggestions de la liste 3' : '') + ' et retirer le faux site des fiches (B).');
else {
  // B d'abord : les fiches rétablies en A partent d'un site propre
  let fixedSite = 0;
  for (const l of tainted) {
    const t = l.socials?.instagram ? await BrowserTask.findOne({ type: 'read_profile', 'input.leadId': l._id, 'result.text': { $exists: true } }).sort({ finishedAt: -1 }).select('input result').lean() : null;
    const real = t ? profileSite(t.result, t.input.url) : null;
    if (badEmail(l)) { l.email = undefined; l.emailSource = undefined; }
    const cur = l.socials?.toObject?.() || l.socials || {}; const check = l.socialsCheck?.toObject?.() || l.socialsCheck || {};
    for (const net of badSocials(l)) { delete cur[net]; delete check[net]; }
    l.socials = cur; l.socialsCheck = check;
    l.website = isOwnSite(real) && !wrongSite(real) ? real : undefined;
    if (l.website) fixedSite += 1;
    // La recherche d'email sur le site est à refaire, sur le bon site cette fois
    if (l.enrich) { l.enrich.emailSearchedAt = undefined; l.enrich.socialsSearchedAt = undefined; }
    await l.save();
  }
  console.log(`\nB. Fait : faux site retiré de ${tainted.length} fiche(s), vrai lien de bio inscrit sur ${fixedSite}, ${withBadEmail.length} email(s) retiré(s).`);

  const { qualifyOne } = await import('../src/services/acquisition/index.js');
  const { enrichLeadFromSite } = await import('../src/services/acquisition/enrich.js');
  let qualified = 0; let failed = 0;
  for (const { lead: stale, p, v, handle } of brands) {
    const lead = await Lead.findById(stale._id);
    lead.status = 'new'; lead.profilePending = false;
    lead.notes = [String(lead.notes || '').replace(NOTE, '').trim(), `Rétablie le ${new Date().toLocaleDateString('fr-FR')} : marque reconnue (${v.reason})`].filter(Boolean).join(' · ').slice(0, 2000);
    if (wrongSite(lead.website)) lead.website = undefined;
    if (isOwnSite(p.site) && !lead.website) lead.website = p.site;
    if (!lead.email && lead.website) await enrichLeadFromSite(lead).catch(() => false);
    await lead.save();
    const done = await qualifyOne(lead, []);
    if (done.error) failed += 1; else qualified += 1;
    console.log(`   ${handle} → ${done.error ? `à qualifier (${done.error})` : done.status === 'rejected' ? 'écartée à la qualification (note sur la fiche)' : `qualifiée, note ${done.score}`}`);
  }
  for (const { s, p, v } of suggestions) {
    s.status = 'pending'; s.auto = false; s.reason = ''; s.decidedAt = undefined;
    if (wrongSite(s.website)) s.website = p.site || '';
    s.check = { ...(s.check?.toObject?.() || s.check || {}), isBrand: true, site: p.site || '', note: `marque (${v.reason})`.slice(0, 200) };
    await s.save();
  }
  console.log(`\nA. Fait : ${brands.length} fiche(s) rétablie(s), dont ${qualified} qualifiée(s)${failed ? ` et ${failed} à requalifier depuis l'admin (bouton « Qualifier »)` : ''}${suggestions.length ? ` · ${suggestions.length} suggestion(s) remise(s) à valider` : ''}.`);
}
await mongoose.disconnect();
process.exit(0);
