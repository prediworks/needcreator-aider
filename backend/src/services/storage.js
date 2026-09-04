import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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

/**
 * Generate unique filename
 */
function generateFilename(originalName, prefix = '') {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${prefix}${timestamp}-${hash}${ext}`;
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
export async function uploadVideo(buffer, originalName, metadata = {}) {
  try {
    const filename = generateFilename(originalName, 'videos/');
    
    const command = new PutObjectCommand({
      Bucket: config.storage.cloudflare.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: 'video/mp4',
      Metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
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
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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

/**
 * Generate unique filename
 */
function generateFilename(originalName, prefix = '') {
  const ext = path.extname(originalName);
  const hash = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${prefix}${timestamp}-${hash}${ext}`;
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
export async function uploadVideo(buffer, originalName, metadata = {}) {
  try {
    const filename = generateFilename(originalName, 'videos/');
    
    const command = new PutObjectCommand({
      Bucket: config.storage.cloudflare.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: 'video/mp4',
      Metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
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
