import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export function useAuth() {
  const { firebaseUser, user, loading, initialized, refreshUser, logout } = useAuthStore();

  return {
    firebaseUser,
    user,
    loading: loading || !initialized,
    initialized,
    isAuthenticated: !!user,
    needsRegistration: !!firebaseUser && !user && initialized && !loading,
    isCreator: user?.role === 'creator',
    isBrand: user?.role === 'brand',
    isAdmin: user?.role === 'admin',
    refreshUser,
    logout,
  };
}

/**
 * Protège une page : attend la fin de la vérification de session,
 * puis redirige vers /login (ou /register si le compte backend n'existe pas).
 * Retourne { user, loading } — afficher un spinner tant que loading est vrai.
 */
export function useRequireAuth(options?: { roles?: Array<'creator' | 'brand' | 'admin'>; redirectTo?: string }) {
  const router = useRouter();
  const authState = useAuth();
  const { user, loading, needsRegistration } = authState;

  useEffect(() => {
    if (loading) return;
    if (needsRegistration) {
      router.replace('/register?complete=1');
      return;
    }
    if (!user) {
      router.replace(options?.redirectTo || '/login');
      return;
    }
    if (options?.roles && !options.roles.includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [loading, user, needsRegistration, router, options?.redirectTo, options?.roles]);

  const authorized = !!user && (!options?.roles || options.roles.includes(user.role));

  return { ...authState, ready: !loading && authorized };
}
