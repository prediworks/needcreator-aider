'use client';

import { useEffect, useRef } from 'react';
import { usePublicConfig } from '@/hooks/usePublicConfig';

/**
 * Publications Instagram et TikTok intégrées dès l'affichage, avec le script d'intégration public de chaque réseau
 * (sans appel à l'API oEmbed : c'est le mécanisme de repli du composant SocialEmbed). Sert à la revue Meta « oEmbed Read ».
 */
export default function EmbedDemo() {
  const cfg = usePublicConfig();
  const urls = cfg.demoEmbedUrls?.length ? cfg.demoEmbedUrls : ['https://www.instagram.com/need.creator/'];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.innerHTML = urls.map((u) => /tiktok\.com/i.test(u)
      ? `<blockquote class="tiktok-embed" cite="${u}" data-video-id="${(u.match(/video\/(\d+)/) || [])[1] || ''}" style="max-width:605px;min-width:325px;margin:0 auto 24px"><section><a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a></section></blockquote>`
      : `<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${u}" data-instgrm-version="14" style="max-width:540px;min-width:326px;width:100%;margin:0 auto 24px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:0"><a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a></blockquote>`).join('');
    const load = (src: string, onload: () => void) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = onload; document.body.appendChild(s); return s; };
    const w = window as any;
    const scripts: HTMLScriptElement[] = [];
    if (urls.some(u => !/tiktok\.com/i.test(u))) { if (w.instgrm?.Embeds) w.instgrm.Embeds.process(); else scripts.push(load('https://www.instagram.com/embed.js', () => w.instgrm?.Embeds?.process())); }
    if (urls.some(u => /tiktok\.com/i.test(u))) scripts.push(load('https://www.tiktok.com/embed.js', () => w.tiktokEmbed?.lib?.render?.(el.querySelectorAll('blockquote'))));
    return () => { scripts.forEach(s => s.remove()); };
  }, [urls.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} data-testid="embed-demo" className="grid md:grid-cols-2 gap-6 items-start" />;
}
