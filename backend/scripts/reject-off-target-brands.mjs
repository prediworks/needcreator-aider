/**
 * Fiches marques à contacter qui n'auraient pas dû entrer dans la file du jour : très grandes marques (liste des marques refusées, annonces
 * Meta ou abonnés au-delà des seuils de Réglages → Prospection) et noms illisibles (« Thefortunately%i », « Mindlyra、zz »).
 * Les noms de personne (« Edson Pina ») sont seulement listés : décision du 30/09/2026, une vraie marque peut porter un nom de personne
 * (« Mélusine Besançon Dijon ») ; --with-persons les écarte aussi.
 * Seules les fiches jamais contactées sont concernées, et jamais celles que l'équipe a validées (suggestion d'un créateur, marque cherchée).
 * Rien n'est supprimé : la fiche passe « Hors cible » avec le motif dans sa note.
 * Usage : node --env-file=.env scripts/reject-off-target-brands.mjs [--apply] [--with-persons]   (sans --apply : simulation)
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { brandTier, sizeSettings } from '../src/services/brandSuggestions.js';
import { looksLikePersonName } from '../src/services/acquisition/enrich.js';
import { sameCompany } from '../src/services/browserTasks.js';

const apply = process.argv.includes('--apply');
const withPersons = process.argv.includes('--with-persons');
const siteLabel = (site) => { try { return new URL(/^https?:/i.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, '').split('.').slice(0, -1).sort((a, b) => b.length - a.length)[0] || ''; } catch { return ''; } };
const handleOf = (url) => (String(url || '').match(/instagram\.com\/([^/?#]+)/i) || [])[1] || '';

await mongoose.connect(config.mongodb.uri);
const leads = mongoose.connection.db.collection('leads');
const st = await sizeSettings();
const all = await leads.find({ kind: 'brand', status: { $in: ['new', 'qualified', 'to_contact'] }, suggestedBy: null, keyword: { $nin: ['recherche créateur', 'scan concurrentiel'] } })
  .project({ name: 1, status: 1, website: 1, socials: 1, stats: 1, notes: 1 }).toArray();

const huge = []; const unreadable = []; const persons = [];
for (const l of all) {
  const name = String(l.name || '').trim();
  const { tier, blocked } = await brandTier({ name, handle: handleOf(l.socials?.instagram), followers: l.stats?.subscribers ?? null, ads: l.stats?.ads ?? null }, st);
  if (tier === 'huge') { huge.push({ l, why: blocked ? 'très grande marque (liste des marques refusées)' : `très grande marque (${l.stats?.ads != null && l.stats.ads >= st.hugeAds ? `${l.stats.ads} annonces Meta` : `${l.stats?.subscribers} abonnés`})` }); continue; }
  if (!name || /[^\p{Script=Latin}\p{N}\s&'’.+!°-]/u.test(name)) { unreadable.push({ l, why: 'nom illisible' }); continue; }
  if (looksLikePersonName(name) && !sameCompany(siteLabel(l.website), name)) persons.push({ l, why: 'nom de personne sans site à ce nom' });
}

// « %s » : un nom qui contient « %i » (« Thefortunately%i ») ne doit pas être lu comme un format d'affichage
const show = (title, rows) => { console.log(`\n${title} : ${rows.length}`); for (const { l, why } of rows.slice(0, 40)) console.log('%s', `  ${l.name} (${l.status}) · ${why}`); if (rows.length > 40) console.log(`  … ${rows.length - 40} de plus`); };
console.log(`Fiches marques jamais contactées examinées : ${all.length}`);
show('Très grandes marques', huge);
show('Noms illisibles', unreadable);
show(`Noms de personne${withPersons ? '' : ' (listés seulement, ajoutez --with-persons pour les écarter)'}`, persons);

const target = [...huge, ...unreadable, ...(withPersons ? persons : [])];
if (apply) {
  const day = new Date().toLocaleDateString('fr-FR');
  for (const { l, why } of target) await leads.updateOne({ _id: l._id }, { $set: { status: 'rejected', notes: [l.notes, `Écartée le ${day} : ${why}`].filter(Boolean).join(' · ').slice(0, 2000) } });
  console.log(`\nPassées « Hors cible » : ${target.length} fiche(s). Rien n'est supprimé ; pour en rétablir une, changez son statut dans Admin → Prospection.`);
} else console.log(`\nRien n'a été modifié. Ajoutez --apply pour passer ces ${target.length} fiche(s) « Hors cible ».`);
await mongoose.disconnect();
process.exit(0);
