import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { getSetting, SETTINGS } from '../models/Setting.js';
import logger from '../utils/logger.js';

const run = promisify(execFile);
export const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), 'needcreator-backups');

/**
 * Sauvegarde de la base (Atlas ou autre) sur le disque du VPS, sans mongodump :
 * une archive tar.gz contenant un fichier .ejson.gz par collection (Extended JSON, fidèle aux types Mongo) + manifest.json.
 * Restauration : npm run backup:restore -- <archive> [--drop]
 */
export async function runBackup(dir = DEFAULT_BACKUP_DIR) {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Base non connectée');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const name = `needcreator-${stamp}`;
  const work = path.join(dir, name);
  fs.mkdirSync(work, { recursive: true });
  const manifest = { name, db: db.databaseName, createdAt: new Date().toISOString(), collections: {} };
  try {
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.'));
    for (const col of collections) {
      const out = fs.createWriteStream(path.join(work, `${col}.ejson.gz`));
      const gzip = zlib.createGzip();
      let count = 0;
      const cursor = db.collection(col).find({});
      const source = (async function* () { for await (const doc of cursor) { count++; yield EJSON.stringify(doc, { relaxed: false }) + '\n'; } })();
      await pipeline(source, gzip, out);
      manifest.collections[col] = count;
    }
    fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const archive = path.join(dir, `${name}.tar.gz`);
    await run('tar', ['-czf', archive, '-C', dir, name]);
    fs.rmSync(work, { recursive: true, force: true });
    const size = fs.statSync(archive).size;
    logger.info(`Backup written: ${archive} (${Math.round(size / 1024)} Ko, ${Object.keys(manifest.collections).length} collections)`);
    return { file: archive, name, size, collections: manifest.collections };
  } catch (err) {
    fs.rmSync(work, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Restaure une archive dans la base courante. Sans drop : documents remis en place par _id (upsert) ;
 * avec drop : chaque collection présente dans l'archive est vidée avant. Retourne le nombre de documents par collection.
 */
export async function restoreBackup(archive, { drop = false } = {}) {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Base non connectée');
  if (!fs.existsSync(archive)) throw new Error('Archive introuvable');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-restore-'));
  try {
    await run('tar', ['-xzf', archive, '-C', tmp]);
    const folder = fs.readdirSync(tmp).map(f => path.join(tmp, f)).find(f => fs.statSync(f).isDirectory());
    if (!folder || !fs.existsSync(path.join(folder, 'manifest.json'))) throw new Error('Archive invalide (manifest absent)');
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
    const restored = {};
    for (const col of Object.keys(manifest.collections)) {
      const file = path.join(folder, `${col}.ejson.gz`);
      if (!fs.existsSync(file)) continue;
      if (drop) await db.collection(col).deleteMany({});
      const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()) });
      let batch = [], n = 0;
      const flush = async () => { if (!batch.length) return; await db.collection(col).bulkWrite(batch.map(d => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })), { ordered: false }); n += batch.length; batch = []; };
      for await (const line of rl) { if (!line.trim()) continue; batch.push(EJSON.parse(line, { relaxed: false })); if (batch.length >= 500) await flush(); }
      await flush();
      restored[col] = n;
    }
    logger.warn(`Backup restored from ${path.basename(archive)}${drop ? ' (drop)' : ''}: ${JSON.stringify(restored)}`);
    return { manifest: { name: manifest.name, createdAt: manifest.createdAt, db: manifest.db }, restored };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Liste des sauvegardes présentes (plus récente d'abord) */
export function listBackups(dir = DEFAULT_BACKUP_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^needcreator-\d{8}-\d{6}\.tar\.gz$/.test(f))
    .map(f => { const st = fs.statSync(path.join(dir, f)); return { name: f, file: path.join(dir, f), size: st.size, createdAt: st.mtime }; })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Supprime les sauvegardes plus anciennes que retentionDays (0 = conserver tout) */
export function pruneBackups(dir = DEFAULT_BACKUP_DIR, retentionDays = 30) {
  if (!retentionDays) return 0;
  const limit = Date.now() - retentionDays * 86400000;
  let n = 0;
  for (const b of listBackups(dir)) if (b.createdAt.getTime() < limit) { fs.rmSync(b.file, { force: true }); n++; }
  if (n) logger.info(`Backups pruned: ${n} older than ${retentionDays} days`);
  return n;
}

/** Réglages admin de la sauvegarde */
export async function backupSettings() {
  const [enabled, intervalHours, retentionDays, dir] = await Promise.all([
    getSetting(SETTINGS.backupEnabled.key, SETTINGS.backupEnabled.default),
    getSetting(SETTINGS.backupIntervalHours.key, SETTINGS.backupIntervalHours.default),
    getSetting(SETTINGS.backupRetentionDays.key, SETTINGS.backupRetentionDays.default),
    getSetting(SETTINGS.backupDir.key, SETTINGS.backupDir.default),
  ]);
  return { enabled, intervalHours, retentionDays, dir: (dir || DEFAULT_BACKUP_DIR).trim() };
}

/** Tâche planifiée : sauvegarde si activée et si la dernière date de plus de intervalHours, puis purge */
export async function runScheduledBackup() {
  const s = await backupSettings();
  if (!s.enabled) return { ran: false, reason: 'disabled' };
  const last = listBackups(s.dir)[0];
  if (last && Date.now() - last.createdAt.getTime() < s.intervalHours * 3600000) return { ran: false, reason: 'recent', last: last.name };
  try {
    const b = await runBackup(s.dir);
    const pruned = pruneBackups(s.dir, s.retentionDays);
    return { ran: true, file: b.file, size: b.size, pruned };
  } catch (err) {
    logger.error(`Scheduled backup failed: ${err.message}`);
    return { ran: false, error: err.message };
  }
}
