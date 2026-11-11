import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { stripe } from './stripe.js';
import Delivery from '../models/Delivery.js';
import User from '../models/User.js';
import { getSetting, setSetting, SETTINGS } from '../models/Setting.js';
import { notifyAdmins } from './adminAlerts.js';

/**
 * Virement mensuel des commissions vers la banque de la plateforme.
 *
 * Les marques sont débitées à la commande et l'argent reste sur le solde Stripe jusqu'à la validation : le calendrier de virements
 * Stripe doit être « manuel », sinon Stripe envoie tout le solde à la banque, y compris la part des créateurs. Une fois par mois, on vire
 * seulement ce qui n'est dû à personne : solde disponible, moins la réserve (missions payées non terminées, versements créateurs en
 * attente, bonus de parrainage en attente), moins une marge de sécurité réglable. Les frais Stripe sont déjà sortis du solde : le calcul
 * part du solde réel, pas des commissions théoriques.
 */
const STATE_KEY = 'commissionPayoutState';
const MIN_PAYOUT = 10; // € : en dessous, on attend le mois suivant
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const eur = (n) => `${round2(n).toFixed(2).replace('.', ',')} €`;

/** Ce qui doit rester sur Stripe : argent des marques pas encore acquis, parts créateurs pas encore versées */
export async function computeReserve() {
  const [ongoing, awaitingTransfer, extensions, referrers] = await Promise.all([
    // Mission payée, pas encore validée (ou en litige) : la somme entière peut encore être remboursée
    Delivery.find({ 'payment.status': { $in: ['held', 'captured'] }, status: { $nin: ['approved', 'auto_approved'] } }).select('payment.amount').lean(),
    // Mission validée, créateur pas encore payé (compte Stripe non connecté ou virement en échec)
    Delivery.find({ 'payment.status': 'captured', status: { $in: ['approved', 'auto_approved'] } }).select('payment.creatorAmount').lean(),
    // Prolongation de droits payée, part créateur pas encore versée
    Delivery.find({ 'rightsExtension.status': 'paid', 'rightsExtension.creatorAmount': { $gt: 0 }, 'rightsExtension.stripeTransferId': { $in: [null, ''] } }).select('rightsExtension.creatorAmount').lean(),
    User.find({ 'referral.rewards': { $elemMatch: { type: 'creator_bonus', status: 'pending' } } }).select('referral.rewards').lean(),
  ]);
  const lines = [
    { label: 'Missions payées, pas encore validées', count: ongoing.length, amount: round2(ongoing.reduce((s, d) => s + (d.payment?.amount || 0), 0)) },
    { label: 'Missions validées, créateur pas encore payé', count: awaitingTransfer.length, amount: round2(awaitingTransfer.reduce((s, d) => s + (d.payment?.creatorAmount || 0), 0)) },
    { label: 'Prolongations de droits, créateur pas encore payé', count: extensions.length, amount: round2(extensions.reduce((s, d) => s + (d.rightsExtension?.creatorAmount || 0), 0)) },
  ];
  const bonuses = referrers.flatMap(u => (u.referral?.rewards || []).filter(r => r.type === 'creator_bonus' && r.status === 'pending'));
  lines.push({ label: 'Bonus de parrainage en attente', count: bonuses.length, amount: round2(bonuses.reduce((s, r) => s + (r.amount || 0), 0)) });
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** Calcul complet, sans rien virer : solde Stripe, réserve, marge, montant qui partirait */
export async function previewCommissionPayout() {
  const [balance, account, reserve, cushion] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.accounts.retrieve(),
    computeReserve(),
    getSetting(SETTINGS.commissionPayoutCushion.key, SETTINGS.commissionPayoutCushion.default),
  ]);
  const cents = (list) => (list || []).filter(b => b.currency === 'eur').reduce((s, b) => s + b.amount, 0);
  const available = cents(balance.available) / 100;
  const pending = cents(balance.pending) / 100;
  const schedule = account.settings?.payouts?.schedule?.interval || 'inconnu';
  const margin = Math.max(0, Number(cushion) || 0);
  const amount = Math.floor(Math.max(0, available - reserve.total - margin) * 100) / 100;
  return { available, pending, schedule, manual: schedule === 'manual', reserve, cushion: margin, amount, payable: amount >= MIN_PAYOUT };
}

const detailHtml = (p) => `
  <table cellpadding="6" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px">
    <tr><td>Solde disponible sur Stripe</td><td align="right"><strong>${eur(p.available)}</strong></td></tr>
    ${p.reserve.lines.filter(l => l.amount > 0).map(l => `<tr><td>− ${l.label} (${l.count})</td><td align="right">${eur(l.amount)}</td></tr>`).join('')}
    <tr><td>− Marge de sécurité laissée sur Stripe</td><td align="right">${eur(p.cushion)}</td></tr>
    <tr><td><strong>Montant viré</strong></td><td align="right"><strong>${eur(p.amount)}</strong></td></tr>
  </table>`;

/**
 * Exécute le virement du mois. `force` : hors production ou hors calendrier (script manuel). Idempotent : une clé Stripe par mois.
 */
export async function runCommissionPayout({ force = false, now = new Date() } = {}) {
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  const state = (await getSetting(STATE_KEY, null)) || {};
  if (!force) {
    if (config.env !== 'production') return { ran: false, reason: 'hors production' };
    if (state.doneMonth === month) return { ran: false, reason: 'déjà fait ce mois' };
    if (state.lastTryDay === day) return { ran: false, reason: 'déjà tenté aujourd\'hui' };
  }
  const save = (patch) => setSetting(STATE_KEY, { ...state, lastTryDay: day, ...patch });
  let p;
  try {
    p = await previewCommissionPayout();
  } catch (err) {
    logger.error(`Virement des commissions : lecture Stripe impossible : ${err?.message || err}`);
    await save({});
    return { ran: false, error: err?.message || String(err) };
  }

  if (!p.manual) {
    // Stripe vire déjà tout automatiquement : rien à faire ici, mais l'argent des missions en cours part à la banque
    await save({ doneMonth: month, lastResult: 'calendrier automatique' });
    await notifyAdmins('Virements Stripe à passer en manuel', `
      <h1>Stripe vire tout le solde à votre banque</h1>
      <p>Le calendrier des virements de votre compte Stripe est « ${p.schedule} » : Stripe envoie tout le solde à la banque, y compris l'argent des missions pas encore validées et la part des créateurs.</p>
      <p>Dans Stripe : Paramètres → Virements → calendrier des virements → <strong>Manuel</strong>. NeedCreator virera alors chaque mois uniquement vos commissions.</p>
      <p>À conserver sur Stripe aujourd'hui : <strong>${eur(p.reserve.total)}</strong>. Solde disponible : ${eur(p.available)}.</p>`);
    return { ran: false, reason: 'calendrier automatique', preview: p };
  }

  if (!p.payable) {
    await save({ doneMonth: month, lastResult: `rien à virer (${eur(p.amount)})` });
    logger.info(`Virement des commissions ${month} : rien à virer (disponible ${p.available}, réserve ${p.reserve.total}, marge ${p.cushion})`);
    return { ran: true, paid: 0, preview: p };
  }

  try {
    const payout = await stripe.payouts.create(
      { amount: Math.round(p.amount * 100), currency: 'eur', description: `Commissions NeedCreator ${month}`, metadata: { kind: 'commission_payout', month } },
      { idempotencyKey: `commission-payout-${month}-${Math.round(p.amount * 100)}` },
    );
    await save({ doneMonth: month, lastResult: `viré ${eur(p.amount)}`, lastPayoutId: payout.id, lastAmount: p.amount, lastPaidAt: now });
    logger.info(`Virement des commissions ${month} : ${p.amount} € (${payout.id})`);
    await notifyAdmins(`Commissions du mois virées : ${eur(p.amount)}`, `
      <h1>${eur(p.amount)} en route vers votre banque</h1>
      <p>Virement mensuel des commissions NeedCreator. Le reste du solde reste sur Stripe : il appartient aux missions en cours et aux créateurs.</p>
      ${detailHtml(p)}
      <p>En attente d'encaissement chez Stripe (pas encore disponible) : ${eur(p.pending)}.</p>`);
    return { ran: true, paid: p.amount, payoutId: payout.id, preview: p };
  } catch (err) {
    const message = err?.raw?.message || err?.message || String(err);
    logger.error(`Virement des commissions ${month} en échec : ${message}`);
    await save({ lastResult: `échec : ${message}` });
    await notifyAdmins('Virement des commissions en échec', `
      <h1>Le virement mensuel des commissions a échoué</h1>
      <p>Montant prévu : ${eur(p.amount)}. Erreur Stripe :</p>
      <p><code>${String(message).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code></p>
      <p>Il sera retenté demain.</p>`);
    return { ran: false, error: message, preview: p };
  }
}
