import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { Invoice, listInvoicesFor, renderStatementPdf } from '../services/invoices.js';
import { resolveUrl } from '../services/storage.js';

const router = express.Router();
router.use(authenticate);

/** Mes factures (marque : reçues ; créateur : émises en son nom + commissions ; admin : toutes) */
router.get('/', async (req, res) => {
  const invoices = await listInvoicesFor(req.user);
  res.json({ invoices });
});

/** Relevé mensuel PDF (généré à la volée) : ?month=AAAA-MM */
router.get('/statement', async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Mois attendu au format AAAA-MM' });
  const { default: User } = await import('../models/User.js');
  const user = await User.findById(req.user._id).select('role email profile legalInfo');
  const pdf = await renderStatementPdf(user, month);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="releve-${month}.pdf"`);
  res.send(pdf);
});

/** Lien de téléchargement (URL signée) */
router.get('/:id', async (req, res) => {
  const inv = await Invoice.findById(req.params.id).lean();
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  const me = String(req.user._id);
  const allowed = req.user.role === 'admin' || String(inv.brandId) === me || String(inv.creatorId) === me;
  if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
  res.json({ invoice: { ...inv, pdfUrl: await resolveUrl(inv.pdfUrl) } });
});

export default router;
