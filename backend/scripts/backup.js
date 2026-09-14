/**
 * Sauvegarde manuelle de la base sur le disque : npm run backup [-- --dir /chemin]
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { runBackup, pruneBackups, backupSettings } from '../src/services/backup.js';

const dirArg = process.argv.indexOf('--dir');
await mongoose.connect(config.mongodb.uri);
const s = await backupSettings();
const dir = dirArg > -1 ? process.argv[dirArg + 1] : s.dir;
const b = await runBackup(dir);
const pruned = pruneBackups(dir, s.retentionDays);
console.log(`✅ Sauvegarde : ${b.file} (${Math.round(b.size / 1024)} Ko)\n   Collections : ${Object.entries(b.collections).map(([k, v]) => `${k} ${v}`).join(', ')}\n   Anciennes supprimées : ${pruned}`);
await mongoose.disconnect();
