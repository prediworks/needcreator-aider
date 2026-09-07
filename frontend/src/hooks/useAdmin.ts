import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useAdminStats(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data,
    enabled,
  });
}

export function usePendingCreators(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'pending-creators'],
    queryFn: async () => (await api.get('/admin/creators/pending')).data,
    enabled,
  });
}

export function useAdminUsers(params: any, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () => (await api.get('/admin/users', { params })).data,
    enabled,
  });
}

export function useAdminCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'campaigns'],
    queryFn: async () => (await api.get('/admin/campaigns')).data,
    enabled,
  });
}

export function useAdminDeliveries(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'deliveries'],
    queryFn: async () => (await api.get('/admin/deliveries')).data,
    enabled,
  });
}

function useAdminAction(path: (id: string) => string, successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const response = await api.post(path(userId), { reason });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(successMessage);
    },
    onError: (error: any) => toast.error(getErrorMessage(error)),
  });
}

export const useApproveCreator = () => useAdminAction((id) => `/admin/creators/${id}/approve`, 'Créateur validé, email envoyé');
export const useRejectCreator = () => useAdminAction((id) => `/admin/creators/${id}/reject`, 'Créateur refusé');
export const useSuspendUser = () => useAdminAction((id) => `/admin/users/${id}/suspend`, 'Utilisateur suspendu');
export const useReactivateUser = () => useAdminAction((id) => `/admin/users/${id}/reactivate`, 'Utilisateur réactivé');

export function usePendingAmbassadors(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'ambassadors'],
    queryFn: async () => (await api.get('/admin/ambassadors/pending')).data,
    enabled,
  });
}
export const useApproveAmbassador = () => useAdminAction((id) => `/admin/ambassadors/${id}/approve`, 'Badge Ambassadeur attribué');
export const useRejectAmbassador = () => useAdminAction((id) => `/admin/ambassadors/${id}/reject`, 'Vidéo refusée');

export function useRunJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post('/admin/jobs/run')).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success(`Tâches exécutées : ${data.autoApprovals} auto-approbation(s), ${data.reminders} rappel(s)`);
    },
    onError: (error: any) => toast.error(getErrorMessage(error)),
  });
}
