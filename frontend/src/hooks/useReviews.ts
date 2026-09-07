import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useUserReviews(userId?: string) {
  return useQuery({
    queryKey: ['reviews', userId],
    queryFn: async () => {
      const response = await api.get(`/reviews/user/${userId}`);
      return response.data as { reviews: any[]; stats: any };
    },
    enabled: !!userId,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, data }: { campaignId: string; data: any }) => {
      const response = await api.post(`/reviews/campaign/${campaignId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery'] });
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Merci pour votre avis !');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de l\'envoi de l\'avis'));
    },
  });
}
