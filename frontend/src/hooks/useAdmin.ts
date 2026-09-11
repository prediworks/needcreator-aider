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
export const useResetStripeConnect = () => useAdminAction((id) => `/admin/users/${id}/stripe-connect/reset`, 'Compte Stripe Connect supprimé');
export const usePurgeUser = () => useAdminAction((id) => `/admin/users/${id}/purge`, 'Campagnes, devis et missions supprimés');
export function useHardDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => (await api.delete(`/admin/users/${userId}/hard`)).data,
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['admin'] }); toast.success(d.message, { duration: 8000 }); },
    onError: (error: any) => toast.error(getErrorMessage(error), { duration: 8000 }),
  });
}
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

export function usePendingBusinesses(enabled = true) {
  return useQuery({ queryKey: ['admin', 'businesses'], queryFn: async () => (await api.get('/admin/businesses/pending')).data, enabled });
}
export const useApproveBusiness = () => useAdminAction((id) => `/admin/businesses/${id}/approve`, 'Entreprise vérifiée');
export const useRejectBusiness = () => useAdminAction((id) => `/admin/businesses/${id}/reject`, 'Vérification refusée');

export function useDisputes(status = 'open', enabled = true) {
  return useQuery({ queryKey: ['admin', 'disputes', status], queryFn: async () => (await api.get('/admin/disputes', { params: { status } })).data, enabled });
}
export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, outcome, creatorPercent, note }: { deliveryId: string; outcome: string; creatorPercent?: number; note: string }) => (await api.post(`/admin/disputes/${deliveryId}/resolve`, { outcome, creatorPercent, note })).data,
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['admin'] }); toast.success(d.message); if (d.warning) toast.warning(d.warning, { duration: 10000 }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
}
export function useReports(status = 'open', enabled = true) {
  return useQuery({ queryKey: ['admin', 'reports', status], queryFn: async () => (await api.get('/admin/reports', { params: { status } })).data, enabled });
}
export function useResolveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, action, note }: { reportId: string; action: string; note?: string }) => (await api.post(`/admin/reports/${reportId}/resolve`, { action, note })).data,
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['admin'] }); toast.success(d.message); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
}

export function useAdminSettings(enabled = true) {
  return useQuery({ queryKey: ['admin', 'settings'], queryFn: async () => (await api.get('/admin/settings')).data, enabled });
}
export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => (await api.put(`/admin/settings/${key}`, { value })).data,
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }); toast.success(d.message); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
}

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
