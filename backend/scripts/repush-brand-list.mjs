/**
 * Variables de l'email 1 changées le 08/10/2026 (competitor_line sans adresse, lien mis dans SalesBlink sur « voir les publicités de
 * {{ competitor_name }} ») : les marques déjà poussées dans la liste « Prospection marques 2 » y ont encore l'ancienne phrase avec l'adresse en clair.
 * SalesBlink ignore un contact déjà présent : videz d'abord la liste dans SalesBlink (Lists → la liste → tout sélectionner → supprimer),
 * puis ce script la remplit de nouveau avec les nouvelles variables. Seules les fiches « Contacté » sans réponse sont reprises.
 * Usage : node --env-file=.env scripts/repush-brand-list.mjs [--apply]   (sans --apply : simulation, rien n'est modifié)
 */
import mongoose from 'mongoose';
import Lead from '../src/models/Lead.js';
import { config } from '../src/config/index.js';
import { mailingProvider } from '../src/services/mailing/index.js';
import { LIST_NAMES, pushToMailing } from '../src/services/acquisition/outreach.js';

const apply = process.argv.includes('--apply');
const provider = mailingProvider();
if (!provider) { console.log('Outil de mailing non configuré (MAILING_PROVIDER, MAILING_API_KEY).'); process.exit(1); }
await mongoose.connect(config.mongodb.uri);
const list = (await provider.listLists()).find(l => l.name === LIST_NAMES.brand);
if (!list) { console.log(`La liste « ${LIST_NAMES.brand} » n'existe pas encore dans SalesBlink : rien à reprendre.`); await mongoose.disconnect(); process.exit(0); }
const leads = await Lead.find({ kind: 'brand', 'mailing.listId': list.id, status: 'contacted', 'mailing.replyAt': null }).select('_id name email').lean();
console.log(`Liste « ${LIST_NAMES.brand} » : ${list.contacts ?? '?'} contact(s) dans SalesBlink, ${leads.length} fiche(s) marque à reprendre`);
for (const l of leads.slice(0, 20)) console.log('%s', `  ${l.name} · ${l.email}`);
if (leads.length > 20) console.log(`  … ${leads.length - 20} de plus`);

if (!apply) console.log('\nRien n\'a été modifié. Videz la liste dans SalesBlink, puis relancez avec --apply.');
else if (!leads.length) console.log('\nRien à reprendre.');
else if (list.contacts > 0) console.log(`\nLa liste contient encore ${list.contacts} contact(s) dans SalesBlink : videz-la d'abord, sinon SalesBlink garderait l'ancienne phrase. Rien n'a été modifié.`);
else {
  const ids = leads.map(l => l._id);
  await Lead.updateMany({ _id: { $in: ids } }, { $set: { status: 'to_contact', contactedAt: null, contactedVia: null, 'mailing.pushedAt': null, 'mailing.listId': null } });
  const r = await pushToMailing({ ids, limit: ids.length });
  console.log(`\nRepoussées avec les nouvelles variables : ${r.pushed} fiche(s)${r.pushed < ids.length ? ` (écartées : ${JSON.stringify(r.skipped)})` : ''}.`);
}
await mongoose.disconnect();
process.exit(0);
