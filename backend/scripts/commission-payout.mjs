/**
 * Virement des commissions vers la banque : calcul à blanc, ou virement immédiat avec --apply.
 *   node --env-file=.env scripts/commission-payout.mjs           → affiche le calcul, ne vire rien
 *   node --env-file=.env scripts/commission-payout.mjs --apply   → vire maintenant (sans attendre le passage mensuel)
 */
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { previewCommissionPayout, runCommissionPayout } from '../src/services/commissionPayout.js';

const apply = process.argv.includes('--apply');
const eur = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;

await mongoose.connect(config.mongodb.uri);
try {
  const p = await previewCommissionPayout();
  console.log(`Calendrier des virements Stripe : ${p.schedule}${p.manual ? '' : '  ← à passer en manuel dans Stripe'}`);
  console.log(`Solde disponible : ${eur(p.available)}   (en attente d'encaissement : ${eur(p.pending)})`);
  console.log('À laisser sur Stripe :');
  for (const l of p.reserve.lines) console.log(`  - ${l.label} : ${eur(l.amount)} (${l.count})`);
  console.log(`  - Marge de sécurité : ${eur(p.cushion)}`);
  console.log(`Montant qui peut être viré : ${eur(p.amount)}${p.payable ? '' : '  (moins de 10 € : rien ne part)'}`);
  if (apply) {
    const r = await runCommissionPayout({ force: true });
    console.log(r.paid ? `Viré : ${eur(r.paid)} (${r.payoutId})` : `Rien viré : ${r.error || r.reason || 'montant insuffisant'}`);
  } else {
    console.log('Calcul à blanc : rien n\'a été viré. Ajoutez --apply pour virer maintenant.');
  }
} finally {
  await mongoose.disconnect();
}
