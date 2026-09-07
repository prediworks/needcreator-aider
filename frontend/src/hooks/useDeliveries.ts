import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useDeliveries(filters?: any, enabled = true) {
  return useQuery({
    queryKey: ['deliveries', filters],
    queryFn: async () => {
      const response = await api.get('/deliveries', { params: filters });
      return response.data;
    },
    enabled,
  });
}

export function useDelivery(deliveryId: string, enabled = true) {
  return useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: async () => {
      const response = await api.get(`/deliveries/${deliveryId}`);
      return response.data.delivery;
    },
    enabled: !!deliveryId && enabled,
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
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      toast.success(`${data.files?.length || 0} fichier(s) envoyé(s)`);
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de l\'envoi des fichiers'));
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
      toast.success('Livraison soumise ! La marque a 7 jours pour valider.');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la soumission'));
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
    onSuccess: (data, deliveryId) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      if (data.warning) {
        toast.warning(`Livraison approuvée. ${data.warning}`, { duration: 8000 });
      } else {
        toast.success('Livraison approuvée, paiement versé au créateur.');
      }
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de l\'approbation'));
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
      toast.success('Révision demandée, le créateur a été notifié.');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la demande de révision'));
    },
  });
}

export function useAddLinks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, links }: { deliveryId: string; links: Array<{ url: string; title?: string; public?: boolean }> }) => {
      const response = await api.post(`/deliveries/${deliveryId}/links`, { links });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
      toast.success('Lien(s) ajouté(s)');
    },
    onError: (error: any) => toast.error(getErrorMessage(error, 'Erreur lors de l\'ajout du lien')),
  });
}

export function useRemoveItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, itemId }: { deliveryId: string; itemId: string }) => {
      const response = await api.delete(`/deliveries/${deliveryId}/items/${itemId}`);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
    },
    onError: (error: any) => toast.error(getErrorMessage(error, 'Erreur lors de la suppression')),
  });
}

export function useSetLinkVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, linkId, isPublic }: { deliveryId: string; linkId: string; isPublic: boolean }) => {
      const response = await api.patch(`/deliveries/${deliveryId}/links/${linkId}/visibility`, { public: isPublic });
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['delivery', variables.deliveryId] });
      toast.success(data.isPublic ? 'Lien public : visible sur le profil du créateur' : 'Lien privé : visible uniquement par vous deux');
    },
    onError: (error: any) => toast.error(getErrorMessage(error, 'Erreur')),
  });
}
