'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import { VIDEO_TYPES, RIGHTS_DURATION, RIGHTS_SUPPORTS } from '@/lib/labels';
import { Calculator } from 'lucide-react';

/** Calculateur de tarif créateur : fourchette indicative par vidéo et totale, avec le détail des facteurs */
export default function RateCalculator({ compact = false }: { compact?: boolean }) {
  const [f, setF] = useState<any>({ videoType: 'testimonial', duration: '30', deliverables: '1', rights: '1y', supports: ['social_organic'], exclusivity: false, exclusivityMonths: '6' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const toggle = (v: string) => set('supports', f.supports.includes(v) ? f.supports.filter((x: string) => x !== v) : [...f.supports, v]);
  const params = new URLSearchParams({ videoType: f.videoType, duration: f.duration, deliverables: f.deliverables, rights: f.rights, supports: f.supports.join(','), exclusivity: String(f.exclusivity), exclusivityMonths: f.exclusivityMonths }).toString();
  const { data } = useQuery({ queryKey: ['rate-calculator', params], queryFn: async () => (await api.get(`/campaigns/rate-calculator?${params}`)).data, staleTime: 60000, placeholderData: (prev) => prev });
  return (
    <div className={`grid ${compact ? '' : 'lg:grid-cols-5'} gap-6`}>
      <Card className={`p-6 ${compact ? '' : 'lg:col-span-3'}`}>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type de vidéo</label><select value={f.videoType} onChange={(e) => set('videoType', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(VIDEO_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><Input label="Durée (s)" type="number" min={5} value={f.duration} onChange={(e) => set('duration', e.target.value)} /><Input label="Nombre de vidéos" type="number" min={1} max={20} value={f.deliverables} onChange={(e) => set('deliverables', e.target.value)} /></div>
          <div><label className="block text-sm font-medium text-neutral-700 mb-1">Durée des droits</label><select value={f.rights} onChange={(e) => set('rights', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">{Object.entries(RIGHTS_DURATION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="flex items-end gap-2"><label className="flex items-center gap-2 text-sm text-neutral-700 pb-2"><input type="checkbox" checked={f.exclusivity} onChange={(e) => set('exclusivity', e.target.checked)} /> Exclusivité</label>{f.exclusivity && <Input label="Mois" type="number" min={1} max={36} value={f.exclusivityMonths} onChange={(e) => set('exclusivityMonths', e.target.value)} />}</div>
        </div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Supports de diffusion</label>
        <div className="flex flex-wrap gap-2">{Object.keys(RIGHTS_SUPPORTS).map((s) => <button key={s} type="button" onClick={() => toggle(s)} className={`px-3 py-1 rounded-full text-xs ${f.supports.includes(s) ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{RIGHTS_SUPPORTS[s]}</button>)}</div>
      </Card>
      <Card className={`p-6 ${compact ? '' : 'lg:col-span-2'} bg-primary-50 border-primary-100`}>
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2 mb-2"><Calculator className="w-5 h-5 text-primary-600" /> Fourchette indicative</h2>
        {data ? (
          <>
            <div className="text-3xl font-bold text-neutral-900" data-testid="rate-mid">{formatCurrency(data.perVideo.mid)} <span className="text-base font-normal text-neutral-600">HT par vidéo</span></div>
            <div className="text-sm text-neutral-700 mb-2">entre {formatCurrency(data.perVideo.low)} et {formatCurrency(data.perVideo.high)}{data.deliverables > 1 ? ` · total ${formatCurrency(data.total.mid)} pour ${data.deliverables} vidéos` : ''}</div>
            <ul className="text-xs text-neutral-600 space-y-0.5 mb-3">
              <li>Base {VIDEO_TYPES[data.videoType]} : {formatCurrency(data.base.min)} à {formatCurrency(data.base.max)}</li>
              {data.factors.map((x: any) => <li key={x.label}>{x.label} : ×{x.factor}</li>)}
            </ul>
            <p className="text-xs text-neutral-500 mb-3">{data.note} Vous restez libre de votre prix : c&apos;est vous qui fixez votre devis.</p>
          </>
        ) : <p className="text-sm text-neutral-600">Calcul…</p>}
        {!compact && <Link href="/register?role=creator"><Button size="sm" className="w-full">Vendre mes vidéos sur NeedCreator</Button></Link>}
      </Card>
    </div>
  );
}
