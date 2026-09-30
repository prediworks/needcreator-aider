/**
 * Produit les images des carrousels du kit réseaux sociaux n° 2 (docs/kit-2/<sujet>/<n>.png, 1080 × 1350) et la couverture TikTok
 * (cover.png, 1080 × 1920) à partir de scripts/social-kit/slides.json. Chaque planche est une page HTML photographiée par Chromium.
 * Usage : node scripts/social-kit/render.mjs [M1 C1 …]   (playwright-core et un Chromium locaux, voir README du kit)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const slides = JSON.parse(fs.readFileSync(path.join(here, 'slides.json'), 'utf8'));
const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
const pw = process.env.PLAYWRIGHT_MODULE || 'playwright-core';
const exe = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell`;
const logo = fs.readFileSync(path.join(root, 'frontend/src/app/icon.svg'), 'utf8').replace(/<\?xml[^>]*>/, '');

const GREEN = '#05DDB2', CORAL = '#FF6B6B', INK = '#1A202C', PALE = '#E6FAF6', DARK = '#0F172A';
const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Le mot qui compte en corail : le premier mot entre « * » (facultatif dans slides.json), sinon rien
const mark = (v) => esc(v).replace(/\*([^*]+)\*/g, `<span style="color:${CORAL}">$1</span>`);

function page({ w, h, kind, title, text, index, total, pub }) {
  const dark = kind === 'end' || (kind === 'hook' && pub === 'brand');
  const bg = dark ? DARK : kind === 'hook' ? PALE : '#ffffff';
  const ink = dark ? '#ffffff' : INK;
  const quiet = dark ? '#cbd5e1' : '#4a5568';
  const ratio = h / 1350;
  const titleSize = (kind === 'hook' ? 96 : kind === 'end' ? 84 : 78) * (h === 1920 ? 1.05 : 1);
  const endTitle = pub === 'brand' ? 'Regardez la vidéo avant de payer.' : 'Tournez, fixez votre prix, la marque achète.';
  const endText = pub === 'brand' ? 'needcreator.com/candidature-spontanee' : 'NeedCreator · lien en bio';
  const body = kind === 'end'
    ? `<div class="t" style="font-size:${titleSize}px">${mark(endTitle)}</div><div class="x" style="color:${GREEN}">${esc(endText)}</div>`
    : `<div class="t" style="font-size:${titleSize}px">${mark(title)}</div>${text ? `<div class="x">${mark(text)}</div>` : ''}`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
  body{background:${bg};color:${ink};font-family:Inter,'Liberation Sans',Arial,sans-serif;position:relative}
  .band{position:absolute;left:0;top:0;width:100%;height:${Math.round(22 * ratio)}px;background:${GREEN}}
  .wrap{position:absolute;left:${Math.round(96 * ratio)}px;right:${Math.round(96 * ratio)}px;top:${Math.round(180 * ratio)}px;bottom:${Math.round(200 * ratio)}px;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(40 * ratio)}px}
  .t{font-weight:800;line-height:1.08;letter-spacing:-0.02em}
  .x{font-weight:500;font-size:${Math.round(46 * (h === 1920 ? 1.1 : 1))}px;line-height:1.3;color:${quiet}}
  .foot{position:absolute;left:${Math.round(96 * ratio)}px;right:${Math.round(96 * ratio)}px;bottom:${Math.round(80 * ratio)}px;display:flex;align-items:center;justify-content:space-between;font-size:30px;font-weight:700;color:${dark ? '#ffffff' : INK}}
  .foot .logo{display:flex;align-items:center;gap:14px}
  .foot svg{width:44px;height:44px;border-radius:10px}
  .dots{display:flex;gap:10px}
  .dots i{width:14px;height:14px;border-radius:50%;background:${dark ? '#334155' : '#cbd5e1'}}
  .dots i.on{background:${GREEN}}
  .tag{position:absolute;left:${Math.round(96 * ratio)}px;top:${Math.round(70 * ratio)}px;font-size:28px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${GREEN}}
</style></head><body>
<div class="band"></div>
<div class="tag">${pub === 'brand' ? 'Pour les marques' : 'Pour les créateurs'}</div>
<div class="wrap">${body}</div>
<div class="foot"><div class="logo">${logo}<span>NeedCreator</span></div>${total > 1 ? `<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>
</body></html>`;
}

const { chromium } = await import(pw);
const browser = await chromium.launch({ executablePath: exe, headless: true });
for (const [key, def] of Object.entries(slides)) {
  if (wanted.length && !wanted.includes(key)) continue;
  const dir = path.join(root, 'docs/kit-2', key);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (let i = 0; i < def.slides.length; i++) {
    const s = def.slides[i];
    await p.setContent(page({ w: 1080, h: 1350, ...s, index: i, total: def.slides.length, pub: def.public }), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(dir, `${i + 1}.png`) });
  }
  // Couverture TikTok : la première planche au format vertical
  await p.setViewportSize({ width: 1080, height: 1920 });
  await p.setContent(page({ w: 1080, h: 1920, ...def.slides[0], index: 0, total: 1, pub: def.public }), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(dir, 'cover.png') });
  await ctx.close();
  console.log(`${key} : ${def.slides.length} planche(s) + couverture → docs/kit-2/${key}/`);
}
await browser.close();
