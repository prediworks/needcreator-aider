/**
 * Vérifie que tous les services externes configurés dans backend/.env répondent.
 * Usage : cd backend && npm run check:env
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

dotenv.config();

const results = [];
const ok = (name, detail = '') => results.push({ name, status: 'OK', detail });
const ko = (name, detail = '') => results.push({ name, status: 'ERREUR', detail });

// 1. MongoDB
try {
  const conn = await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const counts = {};
  for (const name of ['users', 'campaigns', 'deliveries', 'reviews']) {
    counts[name] = await conn.connection.db.collection(name).countDocuments();
  }
  ok('MongoDB', `base "${conn.connection.name}" — ${JSON.stringify(counts)}`);
  await mongoose.disconnect();
} catch (e) {
  ko('MongoDB', e.message);
}

// 2. Stripe (clé + version d'API + Connect)
try {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: process.env.STRIPE_API_VERSION || undefined,
  });
  const account = await stripe.accounts.retrieve();
  ok('Stripe (clé)', `compte ${account.id}, pays ${account.country}, mode ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'TEST' : 'LIVE'}`);
  try {
    const accounts = await stripe.accounts.list({ limit: 1 });
    if (accounts.data.length > 0) {
      ok('Stripe Connect', `activé (${accounts.data.length}+ compte(s) connecté(s))`);
    } else {
      ko('Stripe Connect', 'aucun compte connecté : vérifiez que Connect est activé sur https://dashboard.stripe.com/connect (obligatoire pour virer les gains aux créateurs). Si un créateur voit "You can only create new accounts if you\'ve signed up for Connect", c\'est cette étape qui manque.');
    }
  } catch (e) {
    ko('Stripe Connect', 'non activé — activez-le sur https://dashboard.stripe.com/connect');
  }
} catch (e) {
  ko('Stripe (clé)', e.message);
}

// 3. Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
  const list = await admin.auth().listUsers(1000);
  ok('Firebase Auth', `${list.users.length} utilisateur(s) Firebase`);
} catch (e) {
  ko('Firebase Auth', e.message);
}

// 4. SMTP
if (process.env.SMTP_HOST) {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporter.verify();
    ok('Email (SMTP)', `${process.env.SMTP_HOST}, expéditeur ${process.env.FROM_EMAIL}`);
  } catch (e) {
    ko('Email (SMTP)', e.message);
  }
} else {
  ko('Email (SMTP)', 'SMTP_HOST non défini');
}

// 5. Cloudflare R2
try {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY,
    },
  });
  const r = await s3.send(new ListObjectsV2Command({ Bucket: process.env.CLOUDFLARE_BUCKET_NAME, MaxKeys: 1 }));
  ok('Cloudflare R2', `bucket "${process.env.CLOUDFLARE_BUCKET_NAME}" accessible (${r.KeyCount || 0} fichier(s) listé(s))`);
  // Écriture réelle : un petit fichier est déposé puis supprimé (détecte un token en lecture seule)
  const key = `healthcheck/check-env-${Date.now()}.txt`;
  try {
    await s3.send(new PutObjectCommand({ Bucket: process.env.CLOUDFLARE_BUCKET_NAME, Key: key, Body: 'ok', ContentType: 'text/plain' }));
    ok('R2 écriture', 'dépôt d\'un fichier test réussi (token en lecture/écriture)');
  } catch (e) {
    ko('R2 écriture', `impossible d'écrire dans le bucket : ${e.message}. Le token R2 doit avoir la permission « Object Read & Write ».`);
  }
  const publicUrl = process.env.CLOUDFLARE_PUBLIC_URL || '';
  if (!publicUrl || publicUrl.includes('r2.cloudflarestorage.com')) {
    ko('R2 URL publique', 'CLOUDFLARE_PUBLIC_URL pointe sur l\'API privée : les vidéos seront servies via des liens temporaires signés (OK pour tester). Pour la prod, activez un domaine public sur le bucket.');
  } else {
    try {
      const resp = await fetch(`${publicUrl.replace(/\/$/, '')}/${key}`, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) ok('R2 URL publique', `${publicUrl} sert bien les fichiers du bucket`);
      else ko('R2 URL publique', `${publicUrl}/${key} répond HTTP ${resp.status} : le domaine public n'est pas relié à ce bucket (R2 → bucket → Settings → Public access)`);
    } catch (e) {
      ko('R2 URL publique', `${publicUrl} injoignable : ${e.message}`);
    }
  }
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.CLOUDFLARE_BUCKET_NAME, Key: key })).catch(() => {});
  // CORS : indispensable pour l'envoi direct des vidéos depuis le navigateur
  try {
    const cors = await s3.send(new GetBucketCorsCommand({ Bucket: process.env.CLOUDFLARE_BUCKET_NAME }));
    const allowed = (cors.CORSRules || []).flatMap(r => r.AllowedOrigins || []);
    const wanted = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
    const missing = wanted.filter(o => !allowed.includes(o) && !allowed.includes('*'));
    if (missing.length) ko('R2 CORS', `origines manquantes pour l'envoi direct : ${missing.join(', ')}. Lancez : npm run r2:cors`);
    else ok('R2 CORS', `envoi direct autorisé depuis ${allowed.join(', ')}`);
  } catch (e) {
    ko('R2 CORS', `aucune règle CORS sur le bucket (envoi direct des vidéos impossible). Lancez : npm run r2:cors`);
  }
} catch (e) {
  ko('Cloudflare R2', e.message);
}

console.log('\n=== Vérification de la configuration ===\n');
for (const r of results) {
  console.log(`${r.status === 'OK' ? '✅' : '❌'} ${r.name.padEnd(18)} ${r.detail}`);
}
console.log('');
process.exit(results.some(r => r.status === 'ERREUR' && !['R2 URL publique', 'Stripe Connect'].includes(r.name)) ? 1 : 0);
