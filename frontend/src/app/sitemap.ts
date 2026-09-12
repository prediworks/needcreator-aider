import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/legal';
import { fetchPublicCampaigns } from '@/lib/publicCampaigns';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const campaigns = await fetchPublicCampaigns();
  return [
    { url: `${SITE_URL}/campagnes`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...campaigns.map((c) => ({ url: `${SITE_URL}/campagnes/${c.id}`, lastModified: c.publishedAt ? new Date(c.publishedAt) : now, changeFrequency: 'daily' as const, priority: 0.7 })),
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/marques`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/createurs`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/academie`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/nos-createurs`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/annuaire-createurs`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/legal/cgu`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/confidentialite`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/legal/mentions-legales`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
