'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Play, ExternalLink } from 'lucide-react';

const LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const SCRIPT: Record<string, string> = { instagram: 'https://www.instagram.com/embed.js', tiktok: 'https://www.tiktok.com/embed.js' };
const PREF_KEY = 'nc-embeds-auto';

/** Réseau reconnu d'après l'adresse (publication uniquement) : sert à décider d'afficher le composant */
export function embedProvider(url?: string): 'instagram' | 'tiktok' | 'youtube' | null {
  const u = String(url || '');
  if (/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\//i.test(u)) return 'instagram';
  if (/tiktok\.com\/@[^/]+\/video\/\d+/i.test(u)) return 'tiktok';
  if (/youtube\.com\/(?:watch\?|shorts\/|embed\/)|youtu\.be\//i.test(u)) return 'youtube';
  return null;
}

function loadScript(src: string) {
  return new Promise<void>((resolve) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => resolve();
    document.body.appendChild(s);
  });
}

/**
 * Publication Instagram, TikTok ou YouTube affichée dans la page (livraisons par lien, prospection).
 * Chargée au clic : le réseau peut déposer ses cookies, donc rien n'est chargé avant l'accord de l'utilisateur (choix mémorisé dans ce navigateur).
 * Instagram : balisage officiel renvoyé par l'oEmbed de Meta quand il est disponible, sinon intégration par permalien.
 */
export default function SocialEmbed({ url, onAuthor, compact = false }: { url: string; onAuthor?: (author: { name: string; url?: string | null }) => void; compact?: boolean }) {
  const provider = embedProvider(url);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { try { if (localStorage.getItem(PREF_KEY) === '1') setOpen(true); } catch { /* stockage indisponible */ } }, []);

  const { data, isLoading } = useQuery({ queryKey: ['embed', url], queryFn: async () => (await api.get(`/embeds?url=${encodeURIComponent(url)}`)).data.embed, enabled: open && !!provider, staleTime: 3600000, retry: false });

  useEffect(() => { if (data?.authorName && onAuthor) onAuthor({ name: data.authorName, url: data.authorUrl }); }, [data?.authorName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !data || !box.current || data.provider === 'youtube') return;
    const el = box.current;
    if (data.html) el.innerHTML = data.html;
    else if (data.provider === 'instagram') el.innerHTML = `<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${data.url}" data-instgrm-version="14" style="max-width:540px;width:100%;margin:0 auto;"><a href="${data.url}" target="_blank" rel="noopener noreferrer">Voir la publication sur Instagram</a></blockquote>`;
    else if (data.provider === 'tiktok') el.innerHTML = `<blockquote class="tiktok-embed" cite="${data.url}" data-video-id="${data.id}" style="max-width:605px;min-width:325px;"><section><a href="${data.url}" target="_blank" rel="noopener noreferrer">Voir la vidéo sur TikTok</a></section></blockquote>`;
    loadScript(SCRIPT[data.provider]).then(() => {
      const w = window as any;
      if (data.provider === 'instagram') w.instgrm?.Embeds?.process();
      if (data.provider === 'tiktok') w.tiktokEmbed?.lib?.render?.(el.querySelectorAll('blockquote'));
    });
  }, [open, data]);

  if (!provider) return null;
  const show = (always: boolean) => { if (always) { try { localStorage.setItem(PREF_KEY, '1'); } catch { /* stockage indisponible */ } } setOpen(true); };

  if (!open) return (
    <div className={`rounded-lg border border-dashed border-neutral-300 bg-neutral-50 ${compact ? 'p-2' : 'p-4'} text-center`} data-testid="social-embed-closed">
      <button type="button" onClick={() => show(false)} className="inline-flex items-center gap-2 text-sm font-medium text-primary-700 hover:underline" data-testid="social-embed-show"><Play className="w-4 h-4" /> Afficher la publication {LABEL[provider]}</button>
      <div className="text-[11px] text-neutral-500 mt-1">Contenu chargé depuis {LABEL[provider]}, qui peut déposer ses cookies. <button type="button" onClick={() => show(true)} className="underline">Toujours afficher</button></div>
    </div>
  );

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-2" data-testid="social-embed">
      {isLoading && <div className="text-sm text-neutral-500 p-4 text-center">Chargement de la publication…</div>}
      {data?.provider === 'youtube' && (
        <div className="relative w-full mx-auto" style={{ maxWidth: 560, aspectRatio: '16 / 9' }}>
          <iframe src={`https://www.youtube-nocookie.com/embed/${data.id}`} title={data.title || 'Vidéo YouTube'} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 w-full h-full rounded" />
        </div>
      )}
      <div ref={box} className="flex justify-center overflow-hidden" />
      {data && (
        <div className="text-xs text-neutral-500 mt-1 flex items-center justify-between gap-2 flex-wrap px-1">
          <span data-testid="social-embed-author">{data.authorName ? <>Publication de <a href={data.authorUrl || url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">@{String(data.authorName).replace(/^@/, '')}</a> sur {LABEL[data.provider]}</> : `Publication ${LABEL[data.provider]}`}</span>
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary-600"><ExternalLink className="w-3 h-3" /> Ouvrir sur {LABEL[data.provider]}</a>
        </div>
      )}
    </div>
  );
}
