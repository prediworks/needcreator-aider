import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';

interface User {
  id: string;
  email: string;
  role: 'creator' | 'brand' | 'admin';
  profile: {
    name: string;
    avatar?: string;
    [key: string]: any;
  };
  status: string;
  profileCompletion: number;
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  logout: () => set({ firebaseUser: null, user: null }),
}));
