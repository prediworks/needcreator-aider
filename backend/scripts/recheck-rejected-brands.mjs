/**
 * Marques écartées comme « compte personnel » par le contrôle défectueux du 29/09 au 02/10/2026 : il lisait le pied de page
 * d'Instagram (« Blog ») et prenait chaque profil pour un blog. Le texte de chaque page lue est gardé avec la tâche : ce script
 * le rejuge avec le contrôle corrigé, sans relire Instagram.
 * Usage : node --env-file=.env scripts/recheck-rejected-brands.mjs [--apply] [--show <pseudo>]
 * Sans --apply : liste les verdicts et leurs raisons, rien n'est modifié.
 * Avec --apply : les fiches reconnues comme marques repassent « À qualifier » puis sont qualifiées (secteur, accroches, message) ;
 *   les suggestions de créateurs refusées à tort reviennent « à valider ». Les comptes personnels restent écartés.
 * --show <pseudo> : affiche la zone de profil lue pour ce compte (pour comprendre un verdict).
 * Jamais touchées : les fiches que vous avez sorties ou rétablies à la main depuis (seules celles encore « Hors cible » avec la note du contrôle).
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import Lead from '../src/models/Lead.js';
import BrowserTask from '../src/models/BrowserTask.js';
import BrandSuggestion from '../src/models/BrandSuggestion.js';
import { brandVerdict, profileZone } from '../src/services/browserTasks.js';

const apply = process.argv.includes('--apply');
const showAt = process.argv.indexOf('--show');
const show = showAt > 0 ? String(process.argv[showAt + 1] || '').replace(/^@/, '').trim().toLowerCase() : '';
const NOTE = /(?: · )?Écarté : le compte Instagram est un particulier, pas une marque \([^)]*\)/;
const at = (url) => `@${(String(url || '').match(/instagram\.com\/([^/?#]+)/i) || [])[1] || url}`;
const judge = (task, handle) => brandVerdict(task.extracted || {}, task.result?.text || '', { handle, extra: `${task.result?.meta?.description || ''} ${task.result?.meta?.ogDescription || ''}` });

await mongoose.connect(config.mongodb.uri);
const tasks = await BrowserTask.find({ type: 'read_profile', outcome: /^compte personnel/ }).sort({ finishedAt: -1 }).select('input extracted result.text result.meta outcome finishedAt').lean();

if (show) {
  const t = tasks.find(x => at(x.input?.url).toLowerCase() === `@${show}`);
  if (!t) console.log(`Aucune lecture écartée pour « ${show} ».`);
  else { const v = judge(t, t.input.url); console.log(`${at(t.input.url)} · ${v.brand ? 'marque' : 'personne'} (${v.reason}) · site lu : ${t.extracted?.site || 'aucun'}\n--- zone de profil lue ---\n${profileZone(t.result?.text, t.input.url)}`); }
  await mongoose.disconnect(); process.exit(0);
}

// Une fiche a pu être lue plusieurs fois : la lecture la plus récente fait foi
const byLead = new Map(); const bySuggestion = new Map();
for (const t of tasks) {
  if (t.input?.suggestionId) { const k = String(t.input.suggestionId); if (!bySuggestion.has(k)) bySuggestion.set(k, t); }
  else if (t.input?.kind === 'brand' && t.input?.leadId) { const k = String(t.input.leadId); if (!byLead.has(k)) byLead.set(k, t); }
}
const leads = await Lead.find({ _id: { $in: [...byLead.keys()] }, status: 'rejected', notes: NOTE });
const withFooter = [...byLead.values()].filter(t => /\bblog\b/i.test(t.result?.text || '') && !/\bblog\b/i.test(profileZone(t.result?.text, t.input.url))).length;
const brands = []; const persons = []; const unreadable = [];
for (const lead of leads) {
  const t = byLead.get(String(lead._id));
  if (!t.result?.text) { unreadable.push(lead); continue; }
  const v = judge(t, lead.socials?.instagram || t.input.url);
  (v.brand ? brands : persons).push({ lead, v, handle: at(lead.socials?.instagram || t.input.url) });
}
const line = (x) => `   ${x.handle.padEnd(32)} ${x.v.reason}`;
console.log(`Lectures de profil écartées comme « compte personnel » : ${byLead.size} · fiches encore « Hors cible » pour ce motif : ${leads.length}`);
console.log(`Mot « Blog » lu dans le pied de page d'Instagram (le défaut) : ${withFooter} lecture(s) sur ${byLead.size}`);
console.log(`\n1. Reconnues comme marques avec le contrôle corrigé : ${brands.length}`);
for (const x of brands) console.log(line(x));
console.log(`\n2. Toujours des comptes personnels : ${persons.length}`);
for (const x of persons) console.log(line(x));
if (unreadable.length) console.log(`\nTexte de la page non gardé (laissées telles quelles) : ${unreadable.length} · ${unreadable.map(l => l.handle || l.name).join(', ')}`);

const suggestions = [];
for (const [id, t] of bySuggestion) {
  const s = await BrandSuggestion.findOne({ _id: id, status: 'refused', auto: true, reason: /une personne, pas d'une marque/ });
  if (!s || !t.result?.text) continue;
  const v = judge(t, s.instagram || t.input.url);
  if (v.brand) suggestions.push({ s, v });
}
if (suggestions.length) { console.log(`\n3. Suggestions de créateurs refusées à tort : ${suggestions.length}`); for (const x of suggestions) console.log(`   ${String(x.s.name).padEnd(32)} ${x.v.reason}`); }

if (!apply) console.log('\nRien n\'a été modifié. Ajoutez --apply pour rétablir les marques de la liste 1' + (suggestions.length ? ' et les suggestions de la liste 3.' : '.'));
else {
  const { qualifyOne } = await import('../src/services/acquisition/index.js');
  let qualified = 0; let failed = 0;
  for (const { lead, v, handle } of brands) {
    lead.status = 'new'; lead.profilePending = false;
    lead.notes = [String(lead.notes || '').replace(NOTE, '').trim(), `Rétablie le ${new Date().toLocaleDateString('fr-FR')} : marque reconnue (${v.reason})`].filter(Boolean).join(' · ').slice(0, 2000);
    await lead.save();
    const done = await qualifyOne(lead, []);
    if (done.error) failed += 1; else qualified += 1;
    console.log(`   ${handle} → ${done.error ? `à qualifier (${done.error})` : done.status === 'rejected' ? 'écartée à la qualification (note sur la fiche)' : `qualifiée, note ${done.score}`}`);
  }
  for (const { s, v } of suggestions) {
    s.status = 'pending'; s.auto = false; s.reason = ''; s.decidedAt = undefined;
    s.check = { ...(s.check?.toObject?.() || s.check || {}), isBrand: true, note: `marque (${v.reason})`.slice(0, 200) };
    await s.save();
  }
  console.log(`\nFait : ${brands.length} fiche(s) rétablie(s), dont ${qualified} qualifiée(s)${failed ? ` et ${failed} à requalifier depuis l'admin (bouton « Qualifier »)` : ''}${suggestions.length ? ` · ${suggestions.length} suggestion(s) remise(s) à valider` : ''}.`);
}
await mongoose.disconnect();
process.exit(0);
