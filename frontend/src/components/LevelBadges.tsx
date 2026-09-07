import { LEVELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

export default function LevelBadges({ badges, size = 'sm', className }: { badges?: string[]; size?: 'xs' | 'sm'; className?: string }) {
  if (!badges?.length) return null;
  return (
    <span className={cn('inline-flex gap-1 flex-wrap', className)}>
      {badges.map((b) => {
        const l = LEVELS[b];
        if (!l) return null;
        return (
          <span key={b} title={l.description} className={cn('inline-flex items-center rounded-full font-medium whitespace-nowrap', l.className, size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs')}>
            {l.label}
          </span>
        );
      })}
    </span>
  );
}
