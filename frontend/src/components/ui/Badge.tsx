import { cn } from '@/lib/utils';

interface BadgeProps {
  map: Record<string, { label: string; className: string }>;
  value?: string;
  className?: string;
}

export default function Badge({ map, value, className }: BadgeProps) {
  if (!value) return null;
  const entry = map[value] || { label: value, className: 'bg-neutral-100 text-neutral-700' };
  return (
    <span className={cn('inline-flex items-center px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap', entry.className, className)}>
      {entry.label}
    </span>
  );
}
