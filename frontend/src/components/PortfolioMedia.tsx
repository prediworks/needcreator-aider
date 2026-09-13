'use client';

import VideoPlayer from '@/components/ui/VideoPlayer';

/** Élément de portfolio selon son type : vidéo (défaut), image ou audio */
export default function PortfolioMedia({ item, className }: { item: any; className?: string }) {
  const kind = item?.kind || 'video';
  if (kind === 'image') return <img src={item.videoUrl} alt={item.title || ''} className={`w-full object-cover max-h-96 bg-neutral-100 ${className || ''}`} />;
  if (kind === 'audio') return (
    <div className={`p-4 bg-neutral-50 ${className || ''}`}>
      <div className="text-xs text-neutral-500 mb-2">Extrait audio</div>
      <audio src={item.videoUrl} controls preload="metadata" className="w-full" />
    </div>
  );
  return <VideoPlayer src={item.videoUrl} poster={item.thumbnail} title={item.title} className={className} />;
}
