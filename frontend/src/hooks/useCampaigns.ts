import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useCampaigns(filters?: any, enabled = true) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const response = await api.get('/campaigns', { params: filters });
      return response.data;
    },
    enabled,
  });
}

export function useCampaign(campaignId: string, enabled = true) {
  return useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const response = await api.get(`/campaigns/${campaignId}`);
      return response.data.campaign;
    },
    enabled: !!campaignId && enabled,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/campaigns', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campagne enregistrée en brouillon');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la création'));
    },
  });
}

export function usePublishCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await api.post(`/campaigns/${campaignId}/publish`);
      return response.data;
    },
    onSuccess: (data, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      toast.success(`Campagne publiée ! ${data.notifiedCreators || 0} créateur(s) notifié(s) par email.`);
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la publication'));
    },
  });
}

export function useCancelCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await api.delete(`/campaigns/${campaignId}`);
      return response.data;
    },
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      toast.success('Campagne annulée');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de l\'annulation'));
    },
  });
}

export function useApplyToCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, data }: { campaignId: string; data: any }) => {
      const response = await api.post(`/campaigns/${campaignId}/apply`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaignId] });
      toast.success('Candidature envoyée ! La marque a été notifiée.');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la candidature'));
    },
  });
}

export function useSelectCreator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, creatorId }: { campaignId: string; creatorId: string }) => {
      const response = await api.post(`/campaigns/${campaignId}/select/${creatorId}`);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaignId] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      if (data.warning) {
        toast.warning(data.warning, { duration: 8000 });
      } else if (data.paymentRequired) {
        toast.success('Créateur sélectionné ! Confirmez maintenant le paiement pour lancer la production.');
      } else {
        toast.success('Créateur sélectionné ! Le montant est bloqué et sera versé après validation de la livraison.');
      }
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la sélection'));
    },
  });
}
