const fs = require('fs'), path = require('path');
/**
 * Textes français affichés sans traduction anglaise dans frontend/src/lib/i18n/en.ts.
 * Site : frontend/src (hors admin). Serveur : messages des contrôleurs, routes, tâches et services (hors emails, traduits par l'IA, et PDF).
 * Usage : node scripts/i18n-missing.cjs  (BACK=1 pour le serveur ; --json fichier pour la liste complète). Code de sortie 1 s'il en manque.
 */
const ts = require(path.join(__dirname, '../frontend/node_modules/typescript'));
const BACK = process.env.BACK === '1';
const ROOT = BACK ? path.join(__dirname, '../backend') : path.join(__dirname, '../frontend/src');
const OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if ((BACK ? /\.js$/.test(f) && (/\/(controllers|routes|middleware|jobs|services)\//.test(p) || /models\/User\.js$|config\/academy\.js$|utils\/badges\.js$/.test(p)) && !/(email|ai|logger|adScanReports|seed|admin|browserTasks|groupWatch|contract|quotePdf|adScanPdf|invoices|adminAlerts|acquisition|memberTopics)\.js$|services\/acquisition|tests\//.test(p) : /\.tsx?$/.test(f)) && !p.includes('/lib/i18n/') && !p.includes('node_modules')) files.push(p); } })(ROOT);

const SKIP_ATTR = /^(className|href|src|key|type|id|name|role|rel|target|method|action|accept|autoComplete|inputMode|pattern|htmlFor|as|variant|size|data-.*|style|viewBox|d|fill|stroke.*|xmlns|encType|sizes|lang|dir|queryKey|testid)$/;
const SKIP_CALL = /^(api\.(get|post|put|patch|delete)|axios\.\w+|fetch|router\.(push|replace)|require|import|console\.\w+|logger\.\w+|classNames|cn|clsx|twMerge|useQuery|setItem|getItem|removeItem|searchParams\.get|get|startsWith|endsWith|includes|split|join|replace|match|test|querySelector\w*|addEventListener|removeEventListener|new URL|encodeURIComponent|Intl\.\w+|toLocale\w+)$/;
const ENT = { apos: "'", quot: '"', amp: '&', nbsp: '\u00a0', lt: '<', gt: '>', rsquo: '’', laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–' };
const norm = (s) => s.replace(/&(\w+);/g, (m, e) => ENT[e] ?? m).replace(/\s+/g, ' ').trim();
const oneWord = (s, kind) => kind === 'jsx' ? /[A-Za-zÀ-ÿ]{2,}/.test(s) : /^[A-ZÀ-Ý][a-zà-ÿ]+[.:!?]?$/.test(s.trim()); // un seul mot : texte JSX, ou mot capitalisé (« Actif ») dans une chaîne
const frenchy = (s, kind) => /[A-Za-zÀ-ÿ]/.test(s) && (/\s/.test(s.trim()) || /[À-ÿ]/.test(s) || oneWord(s, kind)) && !(!/\s/.test(s.trim()) && kind !== 'jsx' && /^[a-z0-9_\-\/.:#?=&%{}\[\]()*+]+$/.test(s.trim())) && !/^(https?:|\/|#|\.\/|@\/)/.test(s.trim());
const looksCss = (s) => s.split(/\s+/).length > 1 && s.split(/\s+/).every(w => /^[a-z0-9:\-\[\]\/.%!#_()]+$/.test(w)) && /-/.test(s);

const out = []; // {text, file, line, kind}
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : (f.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS));
  const add = (node, text, kind) => { const t = norm(text); if (!t || !frenchy(t, kind) || looksCss(t)) return; out.push({ text: t, file: path.relative(ROOT, f), line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind }); };
  const calleeName = (call) => call.expression.getText(sf).replace(/\s+/g, '');
  function skipContext(node) {
    let p = node.parent;
    for (let i = 0; p && i < 6; i++, p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
      if (ts.isJsxAttribute(p)) return SKIP_ATTR.test(p.name.getText(sf));
      if (ts.isCallExpression(p)) { const n = calleeName(p); const last = n.split('.').pop(); return SKIP_CALL.test(n) || SKIP_CALL.test(last); }
      if (ts.isPropertyAssignment(p) && p.initializer !== node && i === 0) return true; // clé d'objet
      if (ts.isPropertyAssignment(p) && i === 0 && /^(queryKey|className|href|key|id|type|icon|color|variant|value|slug|path|route|status|code|field|testid)$/.test(p.name.getText(sf))) return true;
      if (ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true;
      if (ts.isBinaryExpression(p) && /^(===|!==|==|!=)$/.test(p.operatorToken.getText(sf))) return true;
      if (ts.isTaggedTemplateExpression(p)) return true;
      if (ts.isJsxExpression(p) || ts.isReturnStatement(p) || ts.isVariableDeclaration(p) || ts.isArrayLiteralExpression(p) || ts.isConditionalExpression(p)) return false;
    }
    return false;
  }
  function visit(node) {
    if (ts.isJsxText(node)) add(node, node.getText(sf), 'jsx');
    else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !skipContext(node)) add(node, node.text, 'str');
    else if (ts.isTemplateExpression(node) && !skipContext(node)) {
      let t = node.head.text; for (const sp of node.templateSpans) t += '{x}' + sp.literal.text;
      add(node, t, 'tpl');
      // les expressions internes peuvent contenir d'autres textes
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
// dictionnaire
const enSrc = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.ts'), 'utf8');
const js = ts.transpileModule(enSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports);
const EN = m.exports.EN;
const NUM = /\d+(?:[   .,]\d+)*/g;
const has = (t) => EN[t] || EN[t.replace(NUM, '{n}')] || Object.values(EN).includes(t);
const isAdmin = (f) => !BACK && /^app\/admin|components\/admin|Admin/.test(f);
const res = out.map(o => ({ ...o, admin: isAdmin(o.file), ok: !!has(o.text) }));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
// Textes identiques en anglais (noms propres, adresses, formats techniques) : scripts/i18n-same.json
const SAME = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-same.json'), 'utf8')));
const miss = res.filter(r => !r.admin && !r.ok && !SAME.has(r.text));
const seen = new Set();
for (const r of miss) { if (seen.has(r.text)) continue; seen.add(r.text); console.log(`${BACK ? 'backend' : 'frontend/src'}/${r.file}:${r.line}  ${r.text}`); }
console.log(seen.size ? `${seen.size} texte(s) sans traduction : à ajouter dans frontend/src/lib/i18n/en.ts (ou dans scripts/i18n-same.json s'il reste identique en anglais)` : 'Traduction anglaise complète');
process.exit(seen.size ? 1 : 0);
