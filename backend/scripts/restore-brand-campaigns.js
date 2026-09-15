/**
 * Restauration sélective depuis une sauvegarde : les campagnes d'une ou plusieurs marques (par email) absentes de la base,
 * avec leurs missions, conversations, avis, factures et contenus. Rien n'est écrasé : seuls les documents manquants sont réinsérés.
 *
 *   npm run backup:restore-brand -- /chemin/needcreator-AAAAMMJJ-HHMMSS.tar.gz marque1@exemple.com marque2@exemple.com [--dry-run]
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { execFileSync } from 'child_process';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { config } from '../src/config/index.js';

const [archive, ...rest] = process.argv.slice(2);
const dryRun = rest.includes('--dry-run');
const emails = rest.filter(a => a.includes('@'));
if (!archive || !fs.existsSync(archive) || !emails.length) {
  console.error('Usage : npm run backup:restore-brand -- <archive.tar.gz> <email marque> [autres emails] [--dry-run]');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-restore-brand-'));
execFileSync('tar', ['-xzf', archive, '-C', tmp]);
const dir = fs.readdirSync(tmp).map(f => path.join(tmp, f)).find(f => fs.statSync(f).isDirectory());
async function load(col) {
  const file = path.join(dir, `${col}.ejson.gz`);
  if (!fs.existsSync(file)) return [];
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()) });
  for await (const l of rl) if (l.trim()) out.push(EJSON.parse(l, { relaxed: false }));
  return out;
}

await mongoose.connect(config.mongodb.uri);
const db = mongoose.connection.db;
console.log(`Sauvegarde ${path.basename(archive)} → ${config.mongodb.uri.replace(/\/\/.*@/, '//***@')}${dryRun ? ' [simulation]' : ''}`);
const users = await load('users');
const brands = users.filter(u => emails.includes(u.email));
if (!brands.length) { console.error('Aucune de ces marques dans la sauvegarde'); process.exit(1); }
const brandIds = new Set(brands.map(u => String(u._id)));
const camps = (await load('campaigns')).filter(c => brandIds.has(String(c.brandId)));
const existing = new Set((await db.collection('campaigns').find({ _id: { $in: camps.map(c => c._id) } }).project({ _id: 1 }).toArray()).map(c => String(c._id)));
const toRestore = camps.filter(c => !existing.has(String(c._id)));
for (const c of toRestore) console.log(`  campagne à restaurer : ${users.find(u => String(u._id) === String(c.brandId))?.email} | ${c.status} | ${c.title}`);
if (!dryRun && toRestore.length) await db.collection('campaigns').insertMany(toRestore);
console.log(`campaigns : ${toRestore.length} restaurée(s)`);
const ids = new Set(toRestore.map(c => String(c._id)));
for (const col of ['deliveries', 'conversations', 'reviews', 'invoices', 'contents']) {
  const rel = (await load(col)).filter(d => d.campaignId && ids.has(String(d.campaignId)));
  const ex = new Set((await db.collection(col).find({ _id: { $in: rel.map(d => d._id) } }).project({ _id: 1 }).toArray()).map(d => String(d._id)));
  const ins = rel.filter(d => !ex.has(String(d._id)));
  if (!dryRun && ins.length) await db.collection(col).insertMany(ins);
  console.log(`${col} : ${ins.length} restauré(s)`);
}
for (const b of brands) console.log(`${b.email} : ${await db.collection('campaigns').countDocuments({ brandId: b._id })} campagne(s) en base`);
fs.rmSync(tmp, { recursive: true, force: true });
await mongoose.disconnect();
console.log(dryRun ? 'Simulation terminée, rien n\'a été écrit' : '✅ Restauration terminée');
