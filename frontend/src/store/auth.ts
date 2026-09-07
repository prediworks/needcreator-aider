import { create } from 'zustand';
import { User as FirebaseUser } from 'firebase/auth';
import api from '@/lib/api';

export interface User {
  id: string;
  _id?: string;
  email: string;
  role: 'creator' | 'brand' | 'admin';
  profile: {
    name: string;
    avatar?: string;
    bio?: string;
    companyName?: string;
    website?: string;
    industry?: string;
    niches?: string[];
    pricing?: { minPrice?: number; avgPrice?: number };
    portfolio?: any[];
    stats?: { completedJobs?: number; rating?: number; totalReviews?: number; responseTimeHours?: number; onTimeDeliveryRate?: number };
    stripeConnect?: { accountId?: string | null; onboardingComplete?: boolean; payoutsEnabled?: boolean; chargesEnabled?: boolean; detailsSubmitted?: boolean };
    [key: string]: any;
  };
  status: string;
  profileCompletion: number;
  applyBlockers?: string[];
  canApply?: boolean;
  stripeCustomerId?: string;
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;      // une vérification de session est en cours
  initialized: boolean;  // Firebase a répondu au moins une fois
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  loading: true,
  initialized: false,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),
  /**
   * Recharge le profil depuis le backend (après inscription, mise à jour, connexion)
   * Retourne null si l'utilisateur n'existe pas encore côté backend (404).
   */
  refreshUser: async () => {
    try {
      const response = await api.get('/auth/profile');
      const user = response.data.user as User;
      set({ user });
      return user;
    } catch (error: any) {
      if (error.response?.status === 404) {
        set({ user: null });
        return null;
      }
      throw error;
    }
  },
  logout: () => set({ firebaseUser: null, user: null }),
}));
