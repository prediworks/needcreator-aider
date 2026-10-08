'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Texte d'une page publique adapté au créateur connecté : le texte par défaut (marques, visiteurs, référencement) est celui rendu par le
 * serveur ; un créateur voit sa version une fois la session connue.
 */
export default function CreatorAware({ children, creator }: { children: ReactNode; creator: ReactNode }) {
  const { user } = useAuth();
  return <>{user?.role === 'creator' ? creator : children}</>;
}
