import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import path from 'path';

// Initialize S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.storage.cloudflare.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.storage.cloudflare.accessKeyId,
    secretAccessKey: config.storage.cloudflare.secretAccessKey,
  },
});

const PRIVATE_ENDPOINT_MARKER = 'r2.cloudflarestorage.com';

/**
 * Le bucket est-il exposé via une URL publique (r2.dev ou domaine perso) ?
 * Si non, on génère des liens signés temporaires pour la lecture.
 */
export function hasPublicUrl() {
  const publicUrl = config.storage.cloudflare.publicUrl || '';
  return publicUrl && !publicUrl.includes(PRIVATE_ENDPOINT_MARKER);
}

/**
 * Extrait la clé (chemin dans le bucket) à partir d'une URL stockée en base
 */
export function keyFromUrl(url) {
  if (!url) return null;
  const publicUrl = config.storage.cloudflare.publicUrl || '';
  if (publicUrl && url.startsWith(publicUrl)) {
    return url.slice(publicUrl.length).replace(/^\//, '');
  }
  // Fallback : tout ce qui suit le nom du bucket
  const idx = url.indexOf(`/${config.storage.cloudflare.bucketName}/`);
  if (idx !== -1) return url.slice(idx + config.storage.cloudflare.bucketName.length + 2);
  return null;
}

/**
 * Retourne une URL lisible par le navigateur (publique ou signée 1h)
 */
export async function resolveUrl(url) {
  if (!url) return url;
  if (hasPublicUrl()) return url;
  const key = keyFromUrl(url);
  if (!key) return url;
  try {
    return await getPresignedUrl(key, 3600);
  } catch {
    return url;
  }
}

/**
 * Remplace les URLs d'un tableau d'objets ({url} ou {videoUrl, thumbnail}) par des URLs lisibles
 */
export async function resolveUrlsIn(items = []) {
  return Promise.all(items.map(async (item) => {
    const out = { ...item };
    if (out.url) out.url = await resolveUrl(out.url);
    if (out.videoUrl) out.videoUrl = await resolveUrl(out.videoUrl);
    if (out.thumbnail) out.thumbnail = await resolveUrl(out.thumbnail);
    return out;
  }));
}

/**
 * Generate unique filename
 */
function generateFilename(originalName, prefix = '') {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${prefix}${timestamp}-${hash}${ext}`;
}

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * Lien d'envoi direct navigateur → R2 (PUT signé, 15 min). Le fichier ne transite pas par le serveur,
 * ce qui évite les limites de taille et de durée du proxy Cloudflare.
 */
export async function createUploadUrl({ folder, originalName, contentType }) {
  const key = generateFilename(originalName, `${folder.replace(/\/$/, '')}/`);
  const command = new PutObjectCommand({
    Bucket: config.storage.cloudflare.bucketName,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { uploadUrl, key, url: `${config.storage.cloudflare.publicUrl}/${key}`, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

/**
 * Métadonnées d'un objet R2 (null s'il n'existe pas) : sert à vérifier qu'un envoi direct a bien eu lieu
 */
export async function statObject(key) {
  try {
    const r = await s3Client.send(new HeadObjectCommand({ Bucket: config.storage.cloudflare.bucketName, Key: key }));
    return { size: r.ContentLength, contentType: r.ContentType };
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
    throw error;
  }
}

/**
 * Upload file to R2
 */
export async function uploadFile(buffer, originalName, contentType, folder = 'uploads') {
  try {
    const filename = generateFilename(originalName, `${folder}/`);
    
    const command = new PutObjectCommand({
      Bucket: config.storage.cloudflare.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    });
    
    await s3Client.send(command);
    
    const url = `${config.storage.cloudflare.publicUrl}/${filename}`;
    
    logger.info(`File uploaded: ${filename}`);
    return { url, filename };
  } catch (error) {
    logger.error('Failed to upload file:', error);
    throw error;
  }
}

/**
 * Upload video with metadata
 */
export async function uploadVideo(buffer, originalName, metadata = {}, contentType = 'video/mp4') {
  try {
    const filename = generateFilename(originalName, 'videos/');
    
    // Les métadonnées S3 doivent être des chaînes ASCII
    const safeMetadata = Object.fromEntries(
      Object.entries(metadata)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, encodeURIComponent(String(v))])
    );
    
    const command = new PutObjectCommand({
      Bucket: config.storage.cloudflare.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        ...safeMetadata,
        uploadedat: new Date().toISOString(),
      },
    });
    
    await s3Client.send(command);
    
    const url = `${config.storage.cloudflare.publicUrl}/${filename}`;
    
    logger.info(`Video uploaded: ${filename}`);
    return { url, filename };
  } catch (error) {
    logger.error('Failed to upload video:', error);
    throw error;
  }
}

/**
 * Télécharge un objet R2 en mémoire (Buffer)
 */
export async function downloadFile(key) {
  const command = new GetObjectCommand({ Bucket: config.storage.cloudflare.bucketName, Key: key });
  const response = await s3Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Delete file from R2
 */
export async function deleteFile(filename) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: config.storage.cloudflare.bucketName,
      Key: filename,
    });
    
    await s3Client.send(command);
    
    logger.info(`File deleted: ${filename}`);
  } catch (error) {
    logger.error('Failed to delete file:', error);
    throw error;
  }
}

/**
 * Generate presigned URL for temporary access
 */
export async function getPresignedUrl(filename, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.storage.cloudflare.bucketName,
      Key: filename,
    });
    
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    
    return url;
  } catch (error) {
    logger.error('Failed to generate presigned URL:', error);
    throw error;
  }
}

/**
 * Upload multiple files
 */
export async function uploadMultipleFiles(files, folder = 'uploads') {
  try {
    const uploadPromises = files.map(file => 
      uploadFile(file.buffer, file.originalname, file.mimetype, folder)
    );
    
    const results = await Promise.all(uploadPromises);
    
    logger.info(`${results.length} files uploaded`);
    return results;
  } catch (error) {
    logger.error('Failed to upload multiple files:', error);
    throw error;
  }
}
