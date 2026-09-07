import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const response = await api.get('/auth/profile');
      return response.data.user;
    },
    enabled,
  });
}

export function usePublicProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const response = await api.get(`/portfolio/creator/${userId}`);
      return response.data as { creator: any; reviews: any[] };
    },
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.patch('/auth/profile', data);
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refreshUser();
      toast.success('Profil mis à jour');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la mise à jour'));
    },
  });
}

export function useStripeConnectStatus(enabled = true) {
  return useQuery({
    queryKey: ['stripe-status'],
    queryFn: async () => {
      const response = await api.get('/auth/stripe/status');
      return response.data;
    },
    enabled,
  });
}

export function useStartStripeConnect() {
  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/auth/stripe/connect', {});
      return response.data as { url: string; accountId: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Impossible de démarrer la connexion Stripe'), { duration: 10000 });
    },
  });
}
