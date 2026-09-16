import 'dotenv/config';
import fs from 'fs'; import zlib from 'zlib'; import readline from 'readline';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
const dir = process.argv[2];
async function load(col) { const out = []; const rl = readline.createInterface({ input: fs.createReadStream(`${dir}/${col}.ejson.gz`).pipe(zlib.createGunzip()) }); for await (const l of rl) if (l.trim()) out.push(EJSON.parse(l, { relaxed: false })); return out; }
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const camps = await load('campaigns');
const users = await load('users');
const emailOf = Object.fromEntries(users.map(u => [String(u._id), u.email]));
const existing = new Set((await db.collection('campaigns').find({}).project({ _id: 1 }).toArray()).map(c => String(c._id)));
const missing = camps.filter(c => !existing.has(String(c._id)));
console.log('backup campaigns', camps.length, '| missing now', missing.length);
for (const c of missing) console.log(' ', emailOf[String(c.brandId)] || c.brandId, '|', c.seed?.batch || '-', '|', c.status, '|', c.title);
const ids = new Set(missing.map(c => String(c._id)));
for (const col of ['deliveries', 'conversations', 'reviews', 'invoices', 'contents']) {
  const docs = await load(col);
  const rel = docs.filter(d => d.campaignId && ids.has(String(d.campaignId)));
  const ex = new Set((await db.collection(col).find({ _id: { $in: rel.map(d => d._id) } }).project({ _id: 1 }).toArray()).map(d => String(d._id)));
  console.log(col, ': liés aux campagnes manquantes', rel.length, '| absents maintenant', rel.filter(d => !ex.has(String(d._id))).length);
}
process.exit(0);
