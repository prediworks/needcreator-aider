import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { toast } from 'sonner';

export function useUploadPortfolioVideo() {
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  return useMutation({
    mutationFn: async ({
      file,
      title,
      description,
      videoType
    }: {
      file: File;
      title: string;
      description?: string;
      videoType: string;
    }) => {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('title', title);
      if (description) formData.append('description', description);
      formData.append('videoType', videoType);

      const response = await api.post('/portfolio/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refreshUser();
      toast.success('Vidéo ajoutée au portfolio');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de l\'upload'));
    },
  });
}

export function useDeletePortfolioVideo() {
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  return useMutation({
    mutationFn: async (videoId: string) => {
      const response = await api.delete(`/portfolio/${videoId}`);
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refreshUser();
      toast.success('Vidéo supprimée');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Erreur lors de la suppression'));
    },
  });
}
