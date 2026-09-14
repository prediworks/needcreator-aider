/**
 * Restauration d'une sauvegarde : npm run backup:restore -- /chemin/needcreator-AAAAMMJJ-HHMMSS.tar.gz [--drop]
 * Sans --drop : les documents sont ajoutés ou remplacés (par _id). Avec --drop : chaque collection est vidée avant.
 * ATTENTION : à lancer sur la base ciblée par MONGODB_URI du .env courant.
 */
import 'dotenv/config';
import fs from 'fs';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { restoreBackup } from '../src/services/backup.js';

const archive = process.argv[2];
const drop = process.argv.includes('--drop');
if (!archive || !fs.existsSync(archive)) { console.error('Usage : npm run backup:restore -- <archive.tar.gz> [--drop]'); process.exit(1); }
await mongoose.connect(config.mongodb.uri);
console.log(`Restauration de ${archive} → ${config.mongodb.uri.replace(/\/\/.*@/, '//***@')}${drop ? ' [collections vidées avant]' : ''}`);
const r = await restoreBackup(archive, { drop });
for (const [col, n] of Object.entries(r.restored)) console.log(`  ${col} : ${n} document(s)`);
await mongoose.disconnect();
console.log('✅ Restauration terminée');
