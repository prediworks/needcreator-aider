import { cn } from '@/lib/utils';

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  brand?: boolean; // logo de marque : carré arrondi, image contenue
  className?: string; // taille, ex. w-10 h-10
}

/** Photo de profil (créateur) ou logo (marque), sinon l'initiale du nom */
export default function UserAvatar({ src, name, brand = false, className = 'w-10 h-10' }: UserAvatarProps) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={cn('flex-shrink-0 inline-flex items-center justify-center overflow-hidden bg-primary-100 text-primary-600 font-semibold', brand ? 'rounded-lg bg-white border border-neutral-200' : 'rounded-full', className)}>
      {src
        ? <img src={src} alt="" className={cn('w-full h-full', brand ? 'object-contain' : 'object-cover')} />
        : <span className="text-sm">{initial}</span>}
    </span>
  );
}
