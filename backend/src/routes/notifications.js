import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { listNotifications, markRead } from '../services/notifications.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  res.json(await listNotifications(req.user._id, Math.min(parseInt(req.query.limit) || 20, 50)));
});

router.post('/read', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  res.json({ updated: await markRead(req.user._id, ids) });
});

export default router;
