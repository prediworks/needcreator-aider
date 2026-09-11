'use client';

import { useEffect } from 'react';

/**
 * Fait défiler la page jusqu'au bloc désigné par l'ancre (#portfolio, #legal…) et le surligne brièvement.
 * `ready` : à passer à true une fois les données affichées (sinon le bloc n'existe pas encore).
 * `onHash` : action associée à une ancre (ex. #edit ouvre le formulaire).
 */
export function useScrollToHash(ready: boolean, onHash?: (hash: string) => void) {
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const go = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) return;
      onHash?.(hash);
      // Laisse le temps au formulaire ou au bloc de s'afficher
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-primary-400', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary-400', 'ring-offset-2'), 2500);
      }, 150);
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
