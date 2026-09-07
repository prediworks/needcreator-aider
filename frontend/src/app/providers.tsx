'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/auth';

/**
 * Une seule écoute de l'état Firebase pour toute l'application.
 * Charge le profil backend dès que Firebase confirme la session.
 */
function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setFirebaseUser, setUser, setLoading, setInitialized, refreshUser } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      if (firebaseUser) {
        setLoading(true);
        try {
          await refreshUser();
        } catch (error: any) {
          console.error('Impossible de charger le profil :', error?.message);
          setUser(null);
        }
      } else {
        setUser(null);
      }

      setLoading(false);
      setInitialized(true);
    });

    return () => unsubscribe();
  }, [setFirebaseUser, setUser, setLoading, setInitialized, refreshUser]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
