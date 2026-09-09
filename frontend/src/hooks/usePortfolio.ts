import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { directUpload, ProgressFn } from '@/lib/upload';
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
      videoType,
      onProgress,
    }: {
      file: File;
      title: string;
      description?: string;
      videoType: string;
      onProgress?: ProgressFn;
    }) => {
      // Envoi direct vers le stockage, puis enregistrement de la vidéo
      const { key } = await directUpload('/portfolio/upload-url', file, onProgress);
      const response = await api.post('/portfolio/videos', { key, title, description, videoType });
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refreshUser();
      toast.success('Vidéo ajoutée au portfolio');
    },
    onError: (error: any) => {
      toast.error(error?.response ? getErrorMessage(error, 'Erreur lors de l\'upload') : (error?.message || 'Erreur lors de l\'upload'), { duration: 8000 });
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
