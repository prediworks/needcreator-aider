/**
 * Configure le CORS du bucket R2 pour autoriser les envois directs depuis le navigateur.
 * Origines = FRONTEND_URL (liste séparée par des virgules) + origines passées en argument.
 * Usage : cd backend && npm run r2:cors [-- https://autre-origine]
 */
import 'dotenv/config';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY },
});
const Bucket = process.env.CLOUDFLARE_BUCKET_NAME;
const origins = [...new Set([
  ...(process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean),
  ...process.argv.slice(2),
])];
if (!origins.length) { console.log('❌ Aucune origine : renseignez FRONTEND_URL'); process.exit(1); }

await s3.send(new PutBucketCorsCommand({
  Bucket,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: origins,
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    }],
  },
}));
const r = await s3.send(new GetBucketCorsCommand({ Bucket }));
console.log(`✅ CORS du bucket "${Bucket}" : PUT autorisé depuis ${r.CORSRules[0].AllowedOrigins.join(', ')}`);
