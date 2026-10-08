/**
 * Concurrent de l'email 1, préparé à l'avance pour les marques pas encore envoyées au mailing (« À contacter » et « Qualifiées » avec email) :
 * l'IA cite des concurrents si la fiche n'en a pas, le premier trouvé chez Meta est retenu. Les scans, eux, sont lancés au moment de l'envoi.
 * Compter environ 30 secondes par marque (quatre à la fois). Sans ce script, l'envoi le fait lui-même, dans une limite de temps.
 * Usage : node --env-file=.env scripts/prepare-competitors.mjs [--limit 100]
 */
import mongoose from 'mongoose';
import Lead from '../src/models/Lead.js';
import { config } from '../src/config/index.js';
import { resolveCompetitor } from '../src/services/acquisition/competitors.js';

const i = process.argv.indexOf('--limit');
const limit = i > 0 ? parseInt(process.argv[i + 1], 10) || 100 : 100;
await mongoose.connect(config.mongodb.uri);
const leads = await Lead.find({ kind: 'brand', status: { $in: ['to_contact', 'qualified'] }, email: { $ne: null }, 'mailing.pushedAt': null, 'competitor.checkedAt': null }).sort({ status: -1, score: -1 }).limit(limit);
console.log(`Marques à préparer : ${leads.length}`);
let found = 0, done = 0;
const queue = [...leads];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let l = queue.shift(); l; l = queue.shift()) {
    try {
      const c = await resolveCompetitor(l);
      await Lead.updateOne({ _id: l._id }, { $set: { competitors: l.competitors || [], competitor: l.competitor } });
      if (c) found++;
      console.log('%s', `  ${l.name} → ${c ? c.pageName : `aucun (${(l.competitors || []).join(', ') || 'pas de suggestion'})`}`);
    } catch (err) { console.log('%s', `  ${l.name} : erreur ${err.message}`); }
    done++;
  }
}));
console.log(`\nTerminé : ${done} marque(s), concurrent trouvé pour ${found}. Les autres partiront avec la phrase générique.`);
await mongoose.disconnect();
process.exit(0);
