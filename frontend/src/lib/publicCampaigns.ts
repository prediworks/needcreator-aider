/** Campagnes publiques (GET /api/campaigns/public) : pages indexables, cache 5 minutes */
export interface PublicCampaign {
  id: string; title: string; description: string; type: 'paid' | 'gifting';
  videoType: string; duration: number; deliverables: number; platforms: string[]; productShipping: boolean; requirements: string[];
  niches: string[]; creatorsWanted: number; budget: number | null; budgetPerVideo: number | null;
  publishedAt?: string; applicationDeadline?: string | null; applications: number; open: boolean;
  brand: { name: string; industry: string | null; avatar: string | null; website: string | null };
}

const base = process.env.NEXT_PUBLIC_API_URL;

export async function fetchPublicCampaigns(): Promise<PublicCampaign[]> {
  if (!base) return [];
  try {
    const res = await fetch(`${base}/campaigns/public`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return ((await res.json()).campaigns || []).map((c: any) => ({ ...c, open: true }));
  } catch { return []; }
}

export async function fetchPublicCampaign(id: string): Promise<PublicCampaign | null> {
  if (!base || !/^[a-f0-9]{24}$/i.test(id)) return null;
  try {
    const res = await fetch(`${base}/campaigns/public/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()).campaign || null;
  } catch { return null; }
}
