import crypto from 'crypto';
import User from '../models/User.js';
import { config } from '../config/index.js';
import { sendTeamInvitation } from '../services/email.js';
import { notify } from '../services/notifications.js';
import logger from '../utils/logger.js';

/**
 * Équipe marque : un compte propriétaire, des membres qui agissent en son nom.
 * Le middleware d'authentification remplace req.user par le propriétaire pour un membre (req.actor = le membre) :
 * campagnes, missions, factures et paiement sont ceux de l'entreprise, sans rien changer aux autres contrôleurs.
 */

/** Réservé au propriétaire (pas aux membres) */
export function ownerOnly(req, res, next) {
  if (req.actor) return res.status(403).json({ error: 'Réservé au propriétaire du compte entreprise' });
  next();
}

export async function getTeam(req, res) {
  try {
    const owner = await User.findById(req.user._id).select('teamInvitations profile.companyName');
    const members = await User.find({ 'team.ownerId': req.user._id, status: { $ne: 'deleted' } }).select('email profile.name team.joinedAt lastLoginAt').lean();
    res.json({
      members: members.map(m => ({ id: m._id, email: m.email, name: m.profile?.name, joinedAt: m.team?.joinedAt, lastLoginAt: m.lastLoginAt })),
      invitations: (owner.teamInvitations || []).filter(i => !i.acceptedAt).map(i => ({ email: i.email, name: i.name, invitedAt: i.invitedAt })),
      companyName: owner.profile?.companyName,
    });
  } catch (error) {
    logger.error('getTeam failed:', error);
    res.status(500).json({ error: 'Équipe indisponible' });
  }
}

export async function inviteMember(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
    if (email === req.user.email) return res.status(400).json({ error: 'C\'est votre propre adresse' });
    if (await User.exists({ email, status: { $ne: 'deleted' } })) return res.status(400).json({ error: 'Un compte existe déjà avec cet email. Demandez-lui de se connecter, ou utilisez une autre adresse.' });
    const owner = await User.findById(req.user._id);
    const invitations = (owner.teamInvitations || []).filter(i => i.email !== email);
    const token = crypto.randomBytes(20).toString('hex');
    invitations.push({ email, name, token, invitedAt: new Date() });
    owner.set('teamInvitations', invitations);
    await owner.save();
    const link = `${config.cors.origin}/register?role=brand&team=${token}`;
    const companyName = owner.profile?.companyName || owner.profile?.name;
    sendTeamInvitation(email, name, companyName, req.actor?.profile?.name || companyName, link).catch(err => logger.warn(`Invitation équipe non envoyée: ${err.message}`));
    logger.info(`Team invitation sent by ${owner._id} to ${email}`);
    res.json({ message: `Invitation envoyée à ${email}`, link });
  } catch (error) {
    logger.error('inviteMember failed:', error);
    res.status(500).json({ error: 'Invitation impossible' });
  }
}

export async function cancelInvitation(req, res) {
  const owner = await User.findById(req.user._id);
  const email = String(req.params.email || '').toLowerCase();
  owner.set('teamInvitations', (owner.teamInvitations || []).filter(i => i.email !== email));
  await owner.save();
  res.json({ message: 'Invitation annulée' });
}

export async function removeMember(req, res) {
  try {
    const member = await User.findOne({ _id: req.params.memberId, 'team.ownerId': req.user._id });
    if (!member) return res.status(404).json({ error: 'Membre introuvable' });
    member.set('team', undefined);
    await member.save();
    notify(member._id, { type: 'system', title: `Vous ne faites plus partie de l'équipe ${req.user.profile?.companyName || ''}`, text: 'Votre compte est désormais indépendant.', href: '/dashboard' }).catch(() => {});
    res.json({ message: `${member.profile?.name || member.email} retiré(e) de l'équipe` });
  } catch (error) {
    logger.error('removeMember failed:', error);
    res.status(500).json({ error: 'Retrait impossible' });
  }
}

/** Public : informations d'une invitation (pour pré-remplir l'inscription) */
export async function invitationInfo(req, res) {
  const owner = await User.findOne({ 'teamInvitations.token': req.params.token }).select('teamInvitations profile.companyName').lean();
  const inv = owner?.teamInvitations?.find(i => i.token === req.params.token);
  if (!owner || !inv || inv.acceptedAt) return res.status(404).json({ error: 'Invitation introuvable ou déjà utilisée' });
  res.json({ email: inv.email, name: inv.name, companyName: owner.profile?.companyName });
}

/** Rattache un compte marque fraîchement créé à son équipe (appelé par registerBrand) */
export async function attachTeamMember(user, token) {
  if (!token) return null;
  const owner = await User.findOne({ 'teamInvitations.token': token, role: 'brand' });
  const inv = owner?.teamInvitations?.find(i => i.token === token && !i.acceptedAt);
  if (!owner || !inv) throw new Error('Invitation introuvable ou déjà utilisée');
  if (inv.email !== user.email.toLowerCase()) throw new Error(`Cette invitation est destinée à ${inv.email}`);
  user.set('team', { ownerId: owner._id, role: 'member', joinedAt: new Date() });
  user.set('profile.companyName', owner.profile?.companyName);
  user.set('subscription', undefined);
  inv.acceptedAt = new Date();
  owner.markModified('teamInvitations');
  await owner.save();
  notify(owner._id, { type: 'system', title: `${user.profile?.name || user.email} a rejoint votre équipe`, text: 'Il ou elle agit désormais au nom de votre entreprise.', href: '/profile#team' }).catch(() => {});
  return owner;
}
