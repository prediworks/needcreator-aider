import QRCode from 'qrcode';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { stripe } from '../services/stripe.js';
import { Invoice } from '../services/invoices.js';
import { GUIDES, publicGuides } from '../../config/academy.js';
import { badgesFor } from '../utils/badges.js';
import logger from '../utils/logger.js';

/**
 * Outils créateur : kit média (lien court + QR), calendrier de virements, académie.
 */

export function slugify(name = '') {
  return String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'createur';
}

/** Garantit un slug public unique pour un créateur */
export async function ensureSlug(user) {
  if (user.profile?.slug) return user.profile.slug;
  const base = slugify(user.profile?.name);
  let slug = base;
  let n = 0;
  while (await User.exists({ 'profile.slug': slug, _id: { $ne: user._id } })) { n++; slug = `${base}-${n + 1}`; }
  user.set('profile.slug', slug);
  await user.save();
  return slug;
}

/** Public : identifiant d'un créateur à partir de son slug */
export async function creatorBySlug(req, res) {
  const u = await User.findOne({ 'profile.slug': String(req.params.slug).toLowerCase(), role: 'creator', status: 'active' }).select('_id profile.name profile.bio profile.niches profile.stats profile.avatar').lean();
  if (!u) return res.status(404).json({ error: 'Créateur introuvable' });
  res.json({ id: u._id, name: u.profile.name, bio: u.profile.bio || '', niches: u.profile.niches || [], stats: u.profile.stats || {}, avatar: u.profile.avatar || null });
}

/** Créateur : son kit média (lien court, QR code) */
export async function getMediaKit(req, res) {
  try {
    const user = await User.findById(req.user._id);
    const slug = await ensureSlug(user);
    const url = `${config.cors.origin}/c/${slug}`;
    const qr = await QRCode.toDataURL(url, { width: 512, margin: 1, color: { dark: '#111827', light: '#ffffff' } });
    res.json({ slug, url, qr, shareText: `Découvrez mon portfolio vidéo UGC et proposez-moi une mission : ${url}` });
  } catch (error) {
    logger.error('getMediaKit failed:', error);
    res.status(500).json({ error: 'Kit média indisponible' });
  }
}

/** Créateur : calendrier des virements (Stripe) + seuils micro-entreprise */
export async function getPayouts(req, res) {
  try {
    const user = req.user;
    const accountId = user.profile?.stripeConnect?.accountId || user.stripeAccountId;
    let balance = null, payouts = [], schedule = null, stripeError = null;
    if (accountId) {
      try {
        const [bal, list, account] = await Promise.all([
          stripe.balance.retrieve({ stripeAccount: accountId }),
          stripe.payouts.list({ limit: 12 }, { stripeAccount: accountId }),
          stripe.accounts.retrieve(accountId),
        ]);
        const eur = (arr) => (arr || []).filter(a => a.currency === 'eur').reduce((s, a) => s + a.amount, 0) / 100;
        balance = { available: eur(bal.available), pending: eur(bal.pending) };
        payouts = list.data.map(p => ({ id: p.id, amount: p.amount / 100, status: p.status, arrivalDate: new Date(p.arrival_date * 1000), createdAt: new Date(p.created * 1000), method: p.method }));
        const sch = account.settings?.payouts?.schedule || {};
        schedule = { interval: sch.interval || 'daily', delayDays: sch.delay_days ?? null, weeklyAnchor: sch.weekly_anchor || null, monthlyAnchor: sch.monthly_anchor || null };
      } catch (err) {
        stripeError = err.message;
      }
    }
    // Seuils micro-entreprise : chiffre d'affaires facturé sur l'année civile (factures émises en son nom, avoirs déduits)
    const year = new Date().getFullYear();
    const agg = await Invoice.aggregate([
      { $match: { creatorId: user._id, $or: [{ kind: 'creator_to_brand' }, { kind: 'credit_note', originalKind: 'creator_to_brand' }], issuedAt: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) } } },
      { $group: { _id: null, ht: { $sum: '$totals.ht' } } },
    ]);
    const ytd = Math.round((agg[0]?.ht || 0) * 100) / 100;
    const thresholds = user.legalInfo?.status === 'micro' ? {
      revenue: config.business.microRevenueThreshold,
      vat: config.business.vatFranchiseThreshold,
      vatTolerance: config.business.vatFranchiseTolerance,
      vatRegistered: !!user.legalInfo?.vatRegistered,
    } : null;
    res.json({ connected: !!accountId, balance, payouts, schedule, stripeError, year, ytd, thresholds });
  } catch (error) {
    logger.error('getPayouts failed:', error);
    res.status(500).json({ error: 'Calendrier indisponible' });
  }
}

/** Public : guides de l'académie (sans les réponses) */
export function listAcademy(req, res) {
  res.json({ guides: publicGuides(), required: config.academy.required, passScore: config.academy.passScore });
}

/** Créateur : soumet un quiz ; score calculé côté serveur ; badge « Formé » quand assez de guides réussis */
export async function submitQuiz(req, res) {
  try {
    const guide = GUIDES.find(g => g.slug === req.params.slug);
    if (!guide) return res.status(404).json({ error: 'Guide introuvable' });
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (answers.length !== guide.quiz.length) return res.status(400).json({ error: `Répondez aux ${guide.quiz.length} questions` });
    const correct = guide.quiz.reduce((n, q, i) => n + (Number(answers[i]) === q.answer ? 1 : 0), 0);
    const score = Math.round((correct / guide.quiz.length) * 100);
    const passed = score >= config.academy.passScore;
    const user = await User.findById(req.user._id);
    const academy = (user.profile.academy || []).filter(a => a.slug !== guide.slug);
    const previous = (user.profile.academy || []).find(a => a.slug === guide.slug);
    if (passed || !previous) academy.push({ slug: guide.slug, score, passed: passed || !!previous?.passed, completedAt: new Date() });
    else academy.push(previous);
    user.set('profile.academy', academy);
    await user.save();
    const passedCount = academy.filter(a => a.passed).length;
    res.json({
      score, passed, correct, total: guide.quiz.length,
      corrections: guide.quiz.map((q, i) => ({ correct: q.answer, yours: Number(answers[i]) })),
      passedCount, required: config.academy.required, trained: passedCount >= config.academy.required, badges: badgesFor(user),
    });
  } catch (error) {
    logger.error('submitQuiz failed:', error);
    res.status(500).json({ error: 'Quiz indisponible' });
  }
}
