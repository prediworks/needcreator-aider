import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export function useUploadPortfolioVideo() {
  const queryClient = useQueryClient();

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useDeletePortfolioVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (videoId: string) => {
      const response = await api.delete(`/portfolio/${videoId}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
