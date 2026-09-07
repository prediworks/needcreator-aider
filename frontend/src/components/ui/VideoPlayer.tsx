'use client';

import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  title?: string;
  className?: string;
}

/**
 * Lecteur vidéo inline (formats verticaux UGC bien supportés)
 */
export default function VideoPlayer({ src, poster, title, className }: VideoPlayerProps) {
  if (!src) {
    return (
      <div className={cn('aspect-video bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-400 text-sm', className)}>
        Vidéo indisponible
      </div>
    );
  }
  return (
    <video
      controls
      preload="metadata"
      playsInline
      src={src}
      poster={poster || undefined}
      title={title}
      className={cn('w-full max-h-[420px] bg-black rounded-lg object-contain', className)}
    >
      Votre navigateur ne peut pas lire cette vidéo.{' '}
      <a href={src} target="_blank" rel="noopener noreferrer">Télécharger</a>
    </video>
  );
}
