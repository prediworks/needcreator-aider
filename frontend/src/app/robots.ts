import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/legal';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/auth', '/dashboard', '/admin', '/profile', '/messages', '/deliveries', '/earnings', '/campaigns', '/creators', '/login', '/register'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
