/**
 * Restauration d'une sauvegarde : npm run backup:restore -- /chemin/needcreator-AAAAMMJJ-HHMMSS.tar.gz [--drop]
 * Sans --drop : les documents sont ajoutés ou remplacés (par _id). Avec --drop : chaque collection est vidée avant.
 * ATTENTION : à lancer sur la base ciblée par MONGODB_URI du .env courant.
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { execFile } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { config } from '../src/config/index.js';

const run = promisify(execFile);
const archive = process.argv[2];
const drop = process.argv.includes('--drop');
if (!archive || !fs.existsSync(archive)) { console.error('Usage : npm run backup:restore -- <archive.tar.gz> [--drop]'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-restore-'));
await run('tar', ['-xzf', archive, '-C', tmp]);
const folder = fs.readdirSync(tmp).map(f => path.join(tmp, f)).find(f => fs.statSync(f).isDirectory());
const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
console.log(`Sauvegarde ${manifest.name} du ${manifest.createdAt} (base ${manifest.db}) → ${config.mongodb.uri.replace(/\/\/.*@/, '//***@')}${drop ? ' [collections vidées avant]' : ''}`);
await mongoose.connect(config.mongodb.uri);
const db = mongoose.connection.db;
for (const col of Object.keys(manifest.collections)) {
  const file = path.join(folder, `${col}.ejson.gz`);
  if (!fs.existsSync(file)) continue;
  if (drop) await db.collection(col).deleteMany({});
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()) });
  let batch = [], n = 0;
  const flush = async () => { if (!batch.length) return; await db.collection(col).bulkWrite(batch.map(d => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })), { ordered: false }); n += batch.length; batch = []; };
  for await (const line of rl) { if (!line.trim()) continue; batch.push(EJSON.parse(line, { relaxed: false })); if (batch.length >= 500) await flush(); }
  await flush();
  console.log(`  ${col} : ${n} document(s)`);
}
fs.rmSync(tmp, { recursive: true, force: true });
await mongoose.disconnect();
console.log('✅ Restauration terminée');
