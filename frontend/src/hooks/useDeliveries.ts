import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export function useDeliveries(filters?: any) {
  return useQuery({
    queryKey: ['deliveries', filters],
    queryFn: async () => {
      const response = await api.get('/deliveries', { params: filters });
      return response.data;
    },
  });
}

export function useDelivery(deliveryId: string) {
  return useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: async () => {
      const response = await api.get(`/deliveries/${deliveryId}`);
      return response.data.delivery;
    },
    enabled: !!deliveryId,
  });
}

export function useUploadDeliverables() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deliveryId, files }: { deliveryId: string; files: File[] }) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      const response = await api.post(`/deliveries/${deliveryId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

export function useSubmitDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deliveryId, notes }: { deliveryId: string; notes?: string }) => {
      const response = await api.post(`/deliveries/${deliveryId}/submit`, { notes });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

export function useApproveDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const response = await api.post(`/deliveries/${deliveryId}/approve`);
      return response.data;
    },
    onSuccess: (_, deliveryId) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

export function useRequestRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deliveryId, feedback }: { deliveryId: string; feedback: string }) => {
      const response = await api.post(`/deliveries/${deliveryId}/revision`, { feedback });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}
