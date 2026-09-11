'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { LayoutTemplate, History } from 'lucide-react';

export interface CampaignPrefill {
  title: string; description: string; videoType: string; duration: number; deliverables: number;
  niches: string[]; platforms: string[]; productShipping: boolean; requirements: string[];
}

/**
 * Point de départ d'une campagne : un modèle par secteur, ou une campagne passée à dupliquer.
 */
export default function TemplatePicker({ onPick, enabled }: { onPick: (p: CampaignPrefill, label: string) => void; enabled: boolean }) {
  const { data: tpl } = useQuery({ queryKey: ['campaign-templates'], queryFn: async () => (await api.get('/campaigns/templates')).data, enabled, staleTime: 3600000 });
  const { data: past } = useQuery({ queryKey: ['campaigns', 'past-for-templates'], queryFn: async () => (await api.get('/campaigns', { params: { limit: 6 } })).data, enabled, staleTime: 60000 });
  const pastCampaigns: any[] = (past?.campaigns || []).filter((c: any) => ['completed', 'in_progress', 'active', 'cancelled'].includes(c.status));
  if (!tpl?.templates?.length && !pastCampaigns.length) return null;
  return (
    <div className="mb-6 space-y-3">
      {tpl?.templates?.length ? (
        <div>
          <div className="text-sm font-medium text-neutral-800 flex items-center gap-2 mb-2"><LayoutTemplate className="w-4 h-4 text-primary-500" /> Partir d&apos;un modèle</div>
          <div className="flex flex-wrap gap-2">
            {tpl.templates.map((t: any) => (
              <button key={t.key} type="button" onClick={() => onPick({ title: t.title, description: t.description, videoType: t.videoType, duration: t.duration, deliverables: t.deliverables, niches: t.niches, platforms: t.platforms, productShipping: t.productShipping, requirements: t.requirements }, t.title)} className="text-left border border-neutral-200 rounded-lg px-3 py-2 hover:border-primary-400 hover:bg-primary-50 transition max-w-[260px]">
                <div className="text-xs text-primary-700 font-medium">{t.sector}</div>
                <div className="text-sm text-neutral-900">{t.title}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {pastCampaigns.length ? (
        <div>
          <div className="text-sm font-medium text-neutral-800 flex items-center gap-2 mb-2"><History className="w-4 h-4 text-primary-500" /> Dupliquer une campagne passée</div>
          <div className="flex flex-wrap gap-2">
            {pastCampaigns.map((c: any) => (
              <button key={c._id} type="button" onClick={() => onPick({ title: `${c.title} (copie)`, description: c.description || '', videoType: c.brief?.videoType || 'testimonial', duration: c.brief?.duration || 30, deliverables: c.brief?.deliverables || 1, niches: c.matching?.niches || [], platforms: c.brief?.platforms || [], productShipping: !!c.brief?.productShipping, requirements: c.brief?.requirements || [] }, c.title)} className="text-left border border-neutral-200 rounded-lg px-3 py-2 hover:border-primary-400 hover:bg-primary-50 transition max-w-[260px]">
                <div className="text-sm text-neutral-900 truncate">{c.title}</div>
                <div className="text-xs text-neutral-500">{c.brief?.deliverables || 1} vidéo(s) · {c.budget?.total ? `${c.budget.total} €` : 'budget libre'}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
