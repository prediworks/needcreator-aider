import { PLATFORMS } from '@/lib/labels';
import { cn } from '@/lib/utils';

const ICONS: Record<string, string> = {
  tiktok: '🎵',
  instagram: '📸',
  youtube: '▶️',
  linkedin: '💼',
  facebook: '📘',
  x: '✖️',
  website: '🌐',
  drive: '📁',
  other: '🔗',
};

export function formatFollowers(n?: number) {
  if (!n) return '';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.0', '')} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')} k`;
  return String(n);
}

export function PlatformIcon({ platform, className }: { platform?: string; className?: string }) {
  return <span className={cn('inline-block', className)} title={PLATFORMS[platform || 'other'] || platform}>{ICONS[platform || 'other'] || ICONS.other}</span>;
}

/**
 * Liste des réseaux d'un créateur avec abonnés (liens cliquables)
 */
export default function SocialIcons({ socials, size = 'md' }: { socials?: any[]; size?: 'sm' | 'md' }) {
  if (!socials?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {socials.map((s: any, i: number) => (
        <a
          key={s._id || i}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1 rounded-full bg-neutral-100 hover:bg-primary-50 text-neutral-800 transition',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
          )}
          title={`${PLATFORMS[s.network] || s.network}${s.handle ? ' · ' + s.handle : ''}`}
        >
          <PlatformIcon platform={s.network} />
          <span className="font-medium">{PLATFORMS[s.network] || s.network}</span>
          {s.followers ? <span className="text-neutral-500">{formatFollowers(s.followers)}</span> : null}
        </a>
      ))}
    </div>
  );
}
