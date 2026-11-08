'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { detectLang, readLangCookie, type Lang } from '@/lib/i18n';
import { EN } from '@/lib/i18n/en';
import { useAuth } from '@/hooks/useAuth';

/**
 * Applique l'anglais à l'affichage : remplace les textes français connus (dictionnaire `en.ts`) dans les nœuds texte,
 * les attributs placeholder, title, aria-label et alt, le titre de l'onglet et les fenêtres confirm / alert / prompt,
 * puis surveille les changements de page.
 * Gabarits : {n} remplace un nombre (« 3 devis » ↔ « {n} devis »), {x} n'importe quel texte (« Discussion avec {x} ») ;
 * la partie remplacée par {x} est elle-même traduite si elle est connue (message du serveur, montant, date) ;
 * {-} dans la traduction absorbe une partie sans l'afficher (accord français sans équivalent : « active{x} » → « active{-} »).
 * Dates (« 12 mars 2027 ») et montants (« 1 234,50 € ») sont mis au format anglais.
 * Seul l'admin reste en français. Langue : choix du visiteur, sinon préférence du compte, sinon langue du navigateur.
 */
let applied = false; // l'anglais a déjà été appliqué à cette page : un retour au français demande un rechargement
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const cache = new Map<string, string | null>();
const EN_VALUES = new Set(Object.values(EN)); // déjà traduit : ne pas retraduire ni signaler
const OUTPUTS = new Set<string>(); // traductions produites par gabarit, même règle
let LOWER: Map<string, string> | null = null; // clés en minuscules, pour les éléments de liste mis en minuscules par le code
let hydrated = false; // premier passage différé : traduire avant la fin de l'hydratation de React fait recalculer la page

const NUM = /\d+(?:[   .,]\d+)*/g; // 3, 1 234, 4,5, 12.03.2027 : un seul gabarit {n}
function templateKey(text: string): string { return text.replace(NUM, '{n}'); }

// Gabarits à texte libre, du plus précis (le plus de texte fixe) au plus large
let WILD: { re: RegExp; out: string; fixed: number }[] | null = null;
function wildTemplates() {
  if (WILD) return WILD;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  WILD = Object.keys(EN).filter(k => k.includes('{x}')).map(k => {
    const parts = k.split(/\{x\}|\{n\}/);
    const re = new RegExp('^' + parts.map(p => esc(p).replace(/ /g, '\\s+')).join('(.*?)') + '$', 's');
    return { re, out: EN[k], fixed: parts.join('').length };
  }).filter(t => t.fixed >= 3).sort((a, b) => b.fixed - a.fixed);
  return WILD;
}

const MONTHS: Record<string, string> = { janvier: 'January', 'février': 'February', mars: 'March', avril: 'April', mai: 'May', juin: 'June', juillet: 'July', 'août': 'August', septembre: 'September', octobre: 'October', novembre: 'November', 'décembre': 'December', 'janv.': 'Jan', 'févr.': 'Feb', 'avr.': 'Apr', 'juil.': 'Jul', 'sept.': 'Sep', 'oct.': 'Oct', 'nov.': 'Nov', 'déc.': 'Dec' };
const DAYS: Record<string, string> = { lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday', vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday', 'lun.': 'Mon', 'mar.': 'Tue', 'mer.': 'Wed', 'jeu.': 'Thu', 'ven.': 'Fri', 'sam.': 'Sat', 'dim.': 'Sun' };
const DATE_RE = new RegExp(`(?:(${Object.keys(DAYS).map(d => d.replace('.', '\\.')).join('|')})\\s+)?(\\d{1,2})(?:er)?\\s+(${Object.keys(MONTHS).map(m => m.replace('.', '\\.')).join('|')})(?:\\s+(\\d{4}))?(?:\\s+à\\s+(\\d{1,2}):(\\d{2}))?`, 'gi');
const MONTH_YEAR_RE = new RegExp(`(^|[^\\p{L}])(${Object.keys(MONTHS).filter(m => !m.endsWith('.')).join('|')})\\s+(\\d{4})`, 'giu');
const MONEY_RE = /(-?\d{1,3}(?:[   ]\d{3})*(?:,\d{1,2})?)[   ]?€/g;

/** Dates et montants au format anglais ; null si rien à changer */
function formatValues(t: string): string | null {
  let changed = false;
  let out = t.replace(DATE_RE, (_m, day, d, mon, y, hh, mm) => {
    changed = true;
    const month = MONTHS[mon.toLowerCase()] || mon;
    let s = `${day ? (DAYS[day.toLowerCase()] || day) + ', ' : ''}${month} ${d}${y ? ', ' + y : ''}`;
    if (hh) s += ` at ${hh}:${mm}`;
    return s;
  });
  out = out.replace(MONTH_YEAR_RE, (_m, pre, mon, y) => { changed = true; return `${pre}${MONTHS[mon.toLowerCase()]} ${y}`; });
  out = out.replace(MONEY_RE, (_m, n) => { changed = true; return '€' + n.replace(/[   ]/g, ',').replace(/,(\d{1,2})$/, '.$1'); });
  return changed ? out : null;
}

export function translate(text: string, depth = 0): string | null {
  const t = text.trim();
  if (!t || !/[A-Za-zÀ-ÿ€]/.test(t)) return null;
  if (EN_VALUES.has(t) || OUTPUTS.has(t)) return null;
  if (cache.has(t)) return cache.get(t)!;
  let out: string | null = EN[t] ?? null;
  if (!out) {
    const tpl = templateKey(t);
    const hit = tpl !== t ? EN[tpl] : null;
    if (hit) {
      const nums = t.match(NUM) || [];
      let i = 0; out = hit.replace(/\{n\}/g, () => (nums[i++] ?? '').trim());
    }
  }
  if (!out && depth < 2) {
    for (const w of wildTemplates()) {
      const m = t.match(w.re);
      if (!m) continue;
      let i = 1; out = w.out.replace(/\{x\}|\{n\}|\{-\}/g, (ph) => { const part = m[i++] ?? ''; if (ph === '{-}') return ''; return part.trim() ? (translate(part, depth + 1) ?? part) : part; });
      break;
    }
  }
  if (!out && depth < 2) {
    // Élément de liste mis en minuscules par le code (« compte stripe connecté ») : on cherche la forme avec majuscule
    if (!LOWER) { LOWER = new Map(); for (const k of Object.keys(EN)) if (!LOWER.has(k.toLowerCase())) LOWER.set(k.toLowerCase(), EN[k]); }
    const hit = t !== t.toLowerCase() ? null : LOWER.get(t);
    if (hit) out = hit.charAt(0).toLowerCase() + hit.slice(1);
  }
  if (!out && depth < 2 && t.includes(', ')) {
    // Liste « votre nom, un email valide, un sujet » : traduite si chaque élément est connu
    const parts = t.split(', ');
    const trs = parts.map(p => translate(p, depth + 1));
    if (trs.every(Boolean)) out = trs.join(', ');
  }
  if (!out) out = formatValues(t);
  else out = formatValues(out) ?? out;
  cache.set(t, out);
  if (out) OUTPUTS.add(out.trim());
  if (!out && depth === 0 && typeof window !== 'undefined') { const w = window as any; (w.__i18nMiss = w.__i18nMiss || new Set()).add(t); } // textes non traduits : visibles dans la console pour compléter le dictionnaire
  return out;
}

/** Texte traduit en gardant les espaces autour ; le texte d'origine si rien ne correspond */
export function tr(text: string): string { const t = translate(text); return t ? text.replace(text.trim(), t) : text; }

function applyTo(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const texts: Text[] = [];
  let n: Node | null = walker.currentNode;
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text);
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      // Attributs (placeholder, title…) traduits sur tous les éléments ; le contenu saisi (textarea, input) n'est jamais touché
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = translate(v); if (t && t !== v) { el.setAttribute(a, t); } } }
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.getAttribute('translate') === 'no') { n = walker.nextSibling() || climb(walker); continue; }
    }
    n = walker.nextNode();
  }
  for (const tn of texts) {
    const v = tn.nodeValue || '';
    const t = translate(v);
    if (t && t !== v.trim()) tn.nodeValue = v.replace(v.trim(), t);
  }
}
function climb(walker: TreeWalker): Node | null { let p = walker.parentNode(); while (p) { const s = walker.nextSibling(); if (s) return s; p = walker.parentNode(); } return null; }

/** Fenêtres natives (confirm, alert, prompt) : leur texte ne passe pas par la page */
function patchDialogs() {
  const w = window as any;
  if (w.__ncDialogsEn) return;
  w.__ncDialogsEn = true;
  const fix = (msg: any) => typeof msg === 'string' ? msg.split('\n').map(l => tr(l)).join('\n') : msg;
  const c = window.confirm.bind(window), a = window.alert.bind(window), p = window.prompt.bind(window);
  window.confirm = (m?: any) => c(fix(m));
  window.alert = (m?: any) => a(fix(m));
  window.prompt = (m?: any, d?: any) => p(fix(m), d);
}

function reveal() { document.documentElement.classList.remove('nc-en-pending'); }

export default function LangTranslator() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const adminArea = (pathname || '').startsWith('/admin') || user?.role === 'admin';
  const accountLang = (user as any)?.preferences?.language as Lang | undefined;
  useEffect(() => {
    // Sans choix mémorisé, on attend que le compte soit connu : sa langue peut changer le choix
    if (loading && !readLangCookie()) return;
    const lang: Lang = adminArea ? 'fr' : (readLangCookie() || (accountLang === 'en' || accountLang === 'fr' ? accountLang : null) || detectLang());
    document.documentElement.lang = lang;
    // Page déjà passée en anglais puis retour au français (admin, compte en français) : les textes remplacés ne reviennent qu'au rechargement
    if (lang !== 'en' && applied) { applied = false; window.location.reload(); return; }
    if (lang !== 'en') { reveal(); return; }
    applied = true;
    patchDialogs();
    // Titre de l'onglet : « Tarifs | NeedCreator » → chaque partie traduite
    const fixTitle = () => { const cur = document.title; const t = cur.split(' | ').map(p => translate(p) ?? p).join(' | '); if (t !== cur) document.title = t; };
    let obs: MutationObserver | null = null, titleObs: MutationObserver | null = null, cancelled = false;
    const start = () => {
      if (cancelled) return;
      hydrated = true;
      applyTo(document.body);
      fixTitle();
      reveal();
      obs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) { const tn = m.target as Text; const v = tn.nodeValue || ''; const t = translate(v); if (t && t !== v.trim()) tn.nodeValue = v.replace(v.trim(), t); }
          else if (m.type === 'attributes' && m.target instanceof HTMLElement) { const a = m.attributeName!; const v = m.target.getAttribute(a); if (v) { const t = translate(v); if (t && t !== v) m.target.setAttribute(a, t); } }
          else for (const node of m.addedNodes) applyTo(node);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      titleObs = new MutationObserver(fixTitle);
      titleObs.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    // Premier affichage : attendre que React ait fini d'hydrater la page (moment de calme du navigateur, 1 s au plus)
    if (hydrated) start();
    else if ('requestIdleCallback' in window) (window as any).requestIdleCallback(start, { timeout: 1000 });
    else setTimeout(start, 300);
    return () => { cancelled = true; obs?.disconnect(); titleObs?.disconnect(); };
  }, [pathname, loading, adminArea, accountLang]);
  return null;
}
