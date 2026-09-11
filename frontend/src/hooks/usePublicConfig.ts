'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { DEFAULT_PUBLIC_CONFIG, type PublicConfig } from '@/lib/publicConfig';

/** Côté client : réglages publics (révisions, validation automatique…), en cache une heure, valeurs par défaut en attendant */
export function usePublicConfig(): PublicConfig {
  const { data } = useQuery({
    queryKey: ['public-config'],
    queryFn: async () => (await api.get('/config/public')).data as Partial<PublicConfig>,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  return { ...DEFAULT_PUBLIC_CONFIG, ...(data || {}) };
}
