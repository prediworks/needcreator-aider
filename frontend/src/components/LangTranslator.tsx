'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { detectLang, writeLangCookie, type Lang } from '@/lib/i18n';
import { EN } from '@/lib/i18n/en';

/**
 * Applique l'anglais à l'affichage : remplace les textes français connus (dictionnaire `en.ts`) dans les nœuds texte
 * et les attributs placeholder, title, aria-label et alt, puis surveille les changements de page.
 * Les textes qui contiennent des nombres sont reconnus par gabarit (« 3 devis » ↔ « {n} devis »).
 */
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const cache = new Map<string, string | null>();
const EN_VALUES = new Set(Object.values(EN)); // déjà traduit : ne pas retraduire ni signaler

const NUM = /\d+(?:[ \u00a0.,]\d+)*/g; // 3, 1 234, 4,5, 12.03.2027 : un seul gabarit {n}
function templateKey(text: string): string { return text.replace(NUM, '{n}'); }

export function translate(text: string): string | null {
  const t = text.trim();
  if (!t || !/[A-Za-zÀ-ÿ]/.test(t)) return null;
  if (EN_VALUES.has(t)) return null;
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
  cache.set(t, out);
  if (!out && typeof window !== 'undefined') { const w = window as any; (w.__i18nMiss = w.__i18nMiss || new Set()).add(t); } // textes non traduits : visibles dans la console pour compléter le dictionnaire
  return out;
}

function applyTo(root: Node, lang: Lang) {
  if (lang !== 'en') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const texts: Text[] = [];
  let n: Node | null = walker.currentNode;
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text);
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      // Attributs (placeholder, title…) traduits sur tous les éléments ; le contenu saisi (textarea, input) n'est jamais touché
      for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const tr = translate(v); if (tr && tr !== v) { el.setAttribute(a, tr); } } }
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') { n = walker.nextSibling() || climb(walker); continue; }
    }
    n = walker.nextNode();
  }
  for (const tn of texts) {
    const v = tn.nodeValue || '';
    const tr = translate(v);
    if (tr && tr !== v.trim()) tn.nodeValue = v.replace(v.trim(), tr);
  }
}
function climb(walker: TreeWalker): Node | null { let p = walker.parentNode(); while (p) { const s = walker.nextSibling(); if (s) return s; p = walker.parentNode(); } return null; }

export default function LangTranslator() {
  const pathname = usePathname();
  useEffect(() => {
    const lang = detectLang();
    document.documentElement.lang = lang;
    if (!document.cookie.includes('nc_lang=')) writeLangCookie(lang);
    if (lang !== 'en') return;
    applyTo(document.body, lang);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) { const tn = m.target as Text; const v = tn.nodeValue || ''; const tr = translate(v); if (tr && tr !== v.trim()) tn.nodeValue = v.replace(v.trim(), tr); }
        else if (m.type === 'attributes' && m.target instanceof HTMLElement) { const a = m.attributeName!; const v = m.target.getAttribute(a); if (v) { const tr = translate(v); if (tr && tr !== v) m.target.setAttribute(a, tr); } }
        else for (const node of m.addedNodes) applyTo(node, lang);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => obs.disconnect();
  }, [pathname]);
  return null;
}
