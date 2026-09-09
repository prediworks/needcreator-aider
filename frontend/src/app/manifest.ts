import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NeedCreator',
    short_name: 'NeedCreator',
    description: 'Plateforme UGC : marques et créateurs de contenu',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#05ddb2',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
