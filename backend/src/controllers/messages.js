import Conversation from '../models/Conversation.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import { sendNewMessageNotification } from '../services/email.js';
import { notify } from '../services/notifications.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

const idOf = (c) => (c && c._id ? c._id : c)?.toString();
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;
const MASK = '[coordonnées masquées avant sélection]';

/**
 * Masque emails, téléphones et pseudos de messagerie tant que le créateur n'est pas sélectionné
 */
export function maskContacts(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, MASK)
    .replace(/(?:\+?\d[\s.-]?){9,14}\d/g, MASK)
    .replace(/\b(?:whatsapp|telegram|signal|snap(?:chat)?|discord)\b\s*[:@]?\s*[\w.@-]{3,}/gi, MASK);
}

/**
 * Vérifie que l'utilisateur peut discuter sur cette campagne avec ce créateur,
 * et retourne { campaign, brandId, creatorId }
 */
async function resolveParticipants(user, campaignId, creatorIdParam) {
  const campaign = await Campaign.findById(campaignId).select('brandId title status applications.creatorId invitations.creatorId selectedCreators selectedCreator');
  if (!campaign) return { error: 'Campaign not found', status: 404 };

  let creatorId;
  if (user.role === 'brand') {
    if (idOf(campaign.brandId) !== user._id.toString()) return { error: 'Access denied', status: 403 };
    creatorId = creatorIdParam;
  } else if (user.role === 'creator') {
    creatorId = user._id.toString();
  } else {
    return { error: 'Access denied', status: 403 };
  }
  if (!creatorId) return { error: 'Créateur manquant', status: 400 };

  // Le créateur doit être lié à la campagne (candidature, invitation ou sélection)
  const linked =
    (campaign.applications || []).some(a => idOf(a.creatorId) === creatorId) ||
    (campaign.invitations || []).some(i => idOf(i.creatorId) === creatorId) ||
    (campaign.selectedCreators || []).some(c => idOf(c) === creatorId) ||
    idOf(campaign.selectedCreator) === creatorId;
  if (!linked) return { error: 'La discussion s\'ouvre après une candidature ou une invitation', status: 403 };

  return { campaign, brandId: idOf(campaign.brandId), creatorId };
}

/**
 * Mes conversations (les plus récentes en premier)
 */
export async function listConversations(req, res) {
  try {
    const user = req.user;
    const filter = user.role === 'brand' ? { brandId: user._id } : { creatorId: user._id };
    const conversations = await Conversation.find(filter)
      .populate('campaignId', 'title status')
      .populate('brandId', 'profile.companyName profile.avatar')
      .populate('creatorId', 'profile.name profile.avatar')
      .select('-messages')
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean();
    const side = user.role === 'brand' ? 'brand' : 'creator';
    const totalUnread = conversations.reduce((a, c) => a + (c.unread?.[side] || 0), 0);
    res.json({
      conversations: conversations.map(c => ({ ...c, unreadCount: c.unread?.[side] || 0 })),
      totalUnread,
    });
  } catch (error) {
    logger.error('Failed to list conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
}

/**
 * Nombre total de messages non lus (pour le badge du menu)
 */
export async function unreadCount(req, res) {
  try {
    const user = req.user;
    const side = user.role === 'brand' ? 'brand' : 'creator';
    const filter = user.role === 'brand' ? { brandId: user._id } : { creatorId: user._id };
    const result = await Conversation.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: `$unread.${side}` } } },
    ]);
    res.json({ totalUnread: result[0]?.total || 0 });
  } catch (error) {
    res.json({ totalUnread: 0 });
  }
}

/**
 * Lit (ou crée) la conversation d'une campagne avec un créateur, et marque comme lue
 */
export async function getConversation(req, res) {
  try {
    const user = req.user;
    const r = await resolveParticipants(user, req.params.campaignId, req.params.creatorId);
    if (r.error) return res.status(r.status).json({ error: r.error });

    let conversation = await Conversation.findOne({ campaignId: r.campaign._id, creatorId: r.creatorId });
    if (!conversation) {
      conversation = new Conversation({ campaignId: r.campaign._id, brandId: r.brandId, creatorId: r.creatorId, messages: [] });
      await conversation.save();
    }

    const side = user.role === 'brand' ? 'brand' : 'creator';
    if (conversation.unread[side] > 0) {
      conversation.unread[side] = 0;
      await conversation.save();
    }

    const populated = await Conversation.findById(conversation._id)
      .populate('campaignId', 'title status')
      .populate('brandId', 'profile.companyName profile.avatar')
      .populate('creatorId', 'profile.name profile.avatar')
      .lean();

    res.json({ conversation: populated });
  } catch (error) {
    logger.error('Failed to get conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
}

/**
 * Envoie un message
 */
export async function sendMessage(req, res) {
  try {
    const user = req.user;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Message vide' });
    if (text.length > 4000) return res.status(400).json({ error: 'Message trop long (4000 caractères max)' });

    const r = await resolveParticipants(user, req.params.campaignId, req.params.creatorId);
    if (r.error) return res.status(r.status).json({ error: r.error });

    // Limite journalière des nouvelles marques
    if (user.role === 'brand') {
      user.rollUsage();
      const established = (user.isPro() && user.subscription?.status === 'active') || (await Campaign.countDocuments({ brandId: user._id, status: 'completed' })) > 0;
      if (!established && (user.usage.messagesToday || 0) >= config.limits.newBrandMessagesPerDay) {
        return res.status(429).json({ error: `Nouvelle marque : ${config.limits.newBrandMessagesPerDay} messages par jour maximum tant qu'aucune campagne n'est terminée.` });
      }
      user.usage.messagesToday = (user.usage.messagesToday || 0) + 1;
      await user.save();
    }

    // Coordonnées masquées tant que le créateur n'est pas sélectionné (évite le contournement de la plateforme)
    const selected = (r.campaign.selectedCreators || []).some(c => idOf(c) === r.creatorId) || idOf(r.campaign.selectedCreator) === r.creatorId;
    const safeText = selected ? text : maskContacts(text);

    let conversation = await Conversation.findOne({ campaignId: r.campaign._id, creatorId: r.creatorId });
    if (!conversation) {
      conversation = new Conversation({ campaignId: r.campaign._id, brandId: r.brandId, creatorId: r.creatorId, messages: [] });
    }

    conversation.messages.push({ senderId: user._id, text: safeText });
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = safeText.slice(0, 120);
    const recipientSide = user.role === 'brand' ? 'creator' : 'brand';
    conversation.unread[recipientSide] = (conversation.unread[recipientSide] || 0) + 1;

    // Notification email avec anti-spam (15 min)
    const last = conversation.lastNotifiedAt?.[recipientSide];
    const shouldNotify = !last || Date.now() - new Date(last).getTime() > NOTIFY_COOLDOWN_MS;
    if (shouldNotify) {
      conversation.set(`lastNotifiedAt.${recipientSide}`, new Date());
    }
    await conversation.save();

    if (shouldNotify) {
      const recipientId = recipientSide === 'brand' ? r.brandId : r.creatorId;
      notify(recipientId, { type: 'message', title: `Nouveau message de ${user.profile.companyName || user.profile.name}`, text: r.campaign?.title || '', href: `/messages?campaign=${r.campaign._id}&creator=${r.creatorId}` }).catch(() => {});
      const recipient = await User.findById(recipientId).select('email profile.name profile.companyName preferences.emailNotifications');
      if (recipient && recipient.preferences?.emailNotifications !== false) {
        const senderName = user.profile.companyName || user.profile.name;
        sendNewMessageNotification(recipient.email, recipient.profile.companyName || recipient.profile.name, senderName, r.campaign.title, r.campaign._id, r.creatorId, safeText)
          .catch(err => logger.error('Message email failed:', err.message));
      }
    }

    const message = conversation.messages[conversation.messages.length - 1];
    res.status(201).json({ message: 'Message envoyé', sent: message, conversationId: conversation._id, masked: safeText !== text });
  } catch (error) {
    logger.error('Failed to send message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}
