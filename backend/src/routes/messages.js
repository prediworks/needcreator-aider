import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { listConversations, unreadCount, getConversation, sendMessage } from '../controllers/messages.js';

const router = express.Router();

router.use(authenticate, authorize('brand', 'creator'));

router.get('/', listConversations);
router.get('/unread', unreadCount);
// Marque : /campaign/:campaignId/creator/:creatorId — Créateur : /campaign/:campaignId (creatorId = lui-même)
router.get('/campaign/:campaignId/creator/:creatorId', getConversation);
router.post('/campaign/:campaignId/creator/:creatorId', sendMessage);
router.get('/campaign/:campaignId', getConversation);
router.post('/campaign/:campaignId', sendMessage);

export default router;
