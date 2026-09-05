import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';

export function useAuth() {
  const { firebaseUser, user, loading, setFirebaseUser, setUser, setLoading, logout } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      if (firebaseUser) {
        try {
          // Add a small delay to allow backend to create user
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Fetch user profile from backend
          const response = await api.get('/auth/profile');
          setUser(response.data.user);
        } catch (error: any) {
          console.error('Failed to fetch user profile:', error);
          // If user doesn't exist in backend, they need to complete registration
          if (error.response?.status === 404) {
            console.log('User not found in backend, needs to complete registration');
            // Don't set user to null immediately, the registration might still be in progress
          } else {
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [setFirebaseUser, setUser, setLoading]);

  return {
    firebaseUser,
    user,
    loading,
    isAuthenticated: !!user,
    isCreator: user?.role === 'creator',
    isBrand: user?.role === 'brand',
    isAdmin: user?.role === 'admin',
    logout,
  };
}
