import sharp from 'sharp';
import { uploadFile, deleteFile, keyFromUrl } from '../services/storage.js';
import logger from '../utils/logger.js';

/** Photo de profil (créateur) ou logo (marque) : recadrée en carré 400 × 400, réencodée en JPEG léger */
const SIZE = 400;

export async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choisissez une image (JPG, PNG ou WebP)' });
    let buffer;
    try {
      buffer = await sharp(req.file.buffer).rotate().resize(SIZE, SIZE, { fit: req.user.role === 'brand' ? 'contain' : 'cover', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    } catch {
      return res.status(400).json({ error: 'Image illisible : essayez un autre fichier (JPG, PNG ou WebP)' });
    }
    const user = req.user;
    const previous = user.profile?.avatar;
    const { url } = await uploadFile(buffer, 'avatar.jpg', 'image/jpeg', `avatars/${user._id}`);
    user.profile.avatar = url;
    await user.save();
    const oldKey = keyFromUrl(previous);
    if (oldKey && oldKey.startsWith(`avatars/${user._id}/`)) deleteFile(oldKey).catch(() => {});
    logger.info(`Avatar updated for user ${user._id}`);
    res.json({ avatar: url });
  } catch (error) {
    logger.error('uploadAvatar failed:', error);
    res.status(500).json({ error: 'Envoi de la photo impossible, réessayez' });
  }
}

export async function removeAvatar(req, res) {
  try {
    const user = req.user;
    const oldKey = keyFromUrl(user.profile?.avatar);
    user.profile.avatar = undefined;
    await user.save();
    if (oldKey && oldKey.startsWith(`avatars/${user._id}/`)) deleteFile(oldKey).catch(() => {});
    res.json({ avatar: null });
  } catch (error) {
    logger.error('removeAvatar failed:', error);
    res.status(500).json({ error: 'Suppression de la photo impossible, réessayez' });
  }
}
