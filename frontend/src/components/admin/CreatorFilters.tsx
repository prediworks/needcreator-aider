'use client';

import { NICHES } from '@/lib/labels';
import api from '@/lib/api';

/**
 * Filtres propres aux créateurs dans Admin → Utilisateurs : réseau, abonnés déclarés, niche, tri, profil complet, entreprise vérifiée,
 * missions, activité, lieu ; export CSV de la sélection. Les abonnés sont ceux que le créateur a déclarés, non vérifiés.
 */
export type CreatorFilterState = { networks: string[]; niches: string[]; minFollowers: string; maxFollowers: string; sort: string; complete: string; business: string; missions: string; active: string; place: string };
export const EMPTY_CREATOR_FILTERS: CreatorFilterState = { networks: [], niches: [], minFollowers: '', maxFollowers: '', sort: '', complete: '', business: '', missions: '', active: '', place: '' };

export const NETWORKS: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', linkedin: 'LinkedIn', x: 'X', other: 'Autre' };
const PRESETS: [string, string, string][] = [['< 1 k', '', '999'], ['1 k – 10 k', '1000', '10000'], ['10 k – 50 k', '10000', '50000'], ['> 50 k', '50000', '']];

/** Paramètres envoyés au serveur (vides omis) */
export function creatorParams(f: CreatorFilterState) {
  const out: Record<string, string> = {};
  if (f.networks.length) out.networks = f.networks.join(',');
  if (f.niches.length) out.niches = f.niches.join(',');
  for (const k of ['minFollowers', 'maxFollowers', 'sort', 'complete', 'business', 'missions', 'active', 'place'] as const) if (f[k].trim()) out[k] = f[k].trim();
  return out;
}

export const formatFollowers = (n: number) => (n >= 1000000 ? `${(n / 1000000).toFixed(1).replace('.0', '')} M` : n >= 1000 ? `${Math.round(n / 100) / 10} k`.replace('.0 k', ' k') : String(n));

/** « TikTok 12 k · Instagram 3 k » */
export function socialsLine(u: any) {
  return (u.profile?.socials || []).map((s: any) => `${NETWORKS[s.network] || s.network}${s.followers ? ` ${formatFollowers(s.followers)}` : ''}`).join(' · ');
}

/** Réseaux en liens cliquables (nouvel onglet), avec les abonnés déclarés */
export function SocialLinks({ socials, views = false }: { socials?: any[]; views?: boolean }) {
  if (!socials?.length) return <span className="text-neutral-400">aucun réseau</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {socials.map((s: any, i: number) => (
        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline whitespace-nowrap" title={s.url}>
          {NETWORKS[s.network] || s.network}{s.handle ? ` ${s.handle}` : ''}{s.followers ? ` · ${formatFollowers(s.followers)}${views ? ' abonnés' : ''}` : ''}{views && s.avgViews ? ` · ${formatFollowers(s.avgViews)} vues` : ''}
        </a>
      ))}
    </span>
  );
}

export default function CreatorFilters({ value, onChange, baseParams, total }: { value: CreatorFilterState; onChange: (v: CreatorFilterState) => void; baseParams: Record<string, any>; total?: number }) {
  const set = (k: keyof CreatorFilterState, v: any) => onChange({ ...value, [k]: v });
  const toggle = (k: 'networks' | 'niches', v: string) => set(k, value[k].includes(v) ? value[k].filter((x) => x !== v) : [...value[k], v]);
  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-neutral-700 border-neutral-300'}`;
  const sel = (on: boolean) => `border rounded-lg px-2 py-1.5 text-sm ${on ? 'border-primary-500 bg-primary-50' : 'border-neutral-300'}`;
  const active = JSON.stringify(value) !== JSON.stringify(EMPTY_CREATOR_FILTERS);

  const exportCsv = async () => {
    const { data } = await api.get('/admin/users', { params: { ...baseParams, ...creatorParams(value), role: 'creator', sort: value.sort || 'recent', limit: 5000, page: 1 } });
    const cell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Nom', 'Email', 'Statut', 'Réseaux', 'Abonnés', 'Niches', 'Ville', 'Code postal', 'Missions', 'Note', 'Entreprise vérifiée', 'Manque', 'Dernière connexion', 'Inscrit le']];
    for (const u of data.users || []) {
      const addr = u.profile?.address?.city ? u.profile.address : u.legalInfo?.address || {};
      rows.push([u.profile?.name || '', u.email, u.status, socialsLine(u), u.followers ?? '', (u.profile?.niches || []).map((n: string) => NICHES[n] || n).join(', '), addr.city || '', addr.postalCode || '', u.profile?.stats?.completedJobs || 0, u.profile?.stats?.rating || '', u.verification?.business?.status === 'verified' ? 'oui' : 'non', (u.missing || []).join(', '), u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fr-FR') : '', new Date(u.createdAt).toLocaleDateString('fr-FR')]);
    }
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `createurs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mb-4 p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2 text-sm" data-testid="creator-filters">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-neutral-500 w-16">Réseaux</span>
        {Object.entries(NETWORKS).map(([k, l]) => <button key={k} type="button" onClick={() => toggle('networks', k)} className={chip(value.networks.includes(k))}>{l}</button>)}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-neutral-500 w-16" title="Abonnés déclarés par le créateur, non vérifiés : sur les réseaux choisis, sinon sur tous ses réseaux">Abonnés</span>
        {PRESETS.map(([l, mn, mx]) => <button key={l} type="button" onClick={() => onChange({ ...value, minFollowers: value.minFollowers === mn && value.maxFollowers === mx ? '' : mn, maxFollowers: value.minFollowers === mn && value.maxFollowers === mx ? '' : mx })} className={chip(value.minFollowers === mn && value.maxFollowers === mx && !!(mn || mx))}>{l}</button>)}
        <input type="number" min={0} value={value.minFollowers} onChange={(e) => set('minFollowers', e.target.value)} placeholder="min" className="border border-neutral-300 rounded-lg px-2 py-1 text-xs w-20" aria-label="Abonnés minimum" />
        <input type="number" min={0} value={value.maxFollowers} onChange={(e) => set('maxFollowers', e.target.value)} placeholder="max" className="border border-neutral-300 rounded-lg px-2 py-1 text-xs w-20" aria-label="Abonnés maximum" />
        <span className="text-[11px] text-neutral-500">déclarés, non vérifiés</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-neutral-500 w-16">Niches</span>
        {Object.entries(NICHES).map(([k, l]) => <button key={k} type="button" onClick={() => toggle('niches', k)} className={chip(value.niches.includes(k))}>{l}</button>)}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={value.sort} onChange={(e) => set('sort', e.target.value)} className={sel(!!value.sort)} aria-label="Tri">
          <option value="">Tri : inscription récente</option>
          <option value="followers">Tri : abonnés</option>
          <option value="rating">Tri : note</option>
          <option value="missions">Tri : missions</option>
        </select>
        <select value={value.complete} onChange={(e) => set('complete', e.target.value)} className={sel(!!value.complete)} aria-label="Profil"><option value="">Profil : tous</option><option value="1">Complet</option><option value="0">Incomplet</option></select>
        <select value={value.business} onChange={(e) => set('business', e.target.value)} className={sel(!!value.business)} aria-label="Entreprise"><option value="">Entreprise : toutes</option><option value="1">Vérifiée (payable)</option><option value="0">Non vérifiée</option></select>
        <select value={value.missions} onChange={(e) => set('missions', e.target.value)} className={sel(!!value.missions)} aria-label="Missions"><option value="">Missions : toutes</option><option value="1">Au moins une</option><option value="0">Jamais</option></select>
        <select value={value.active} onChange={(e) => set('active', e.target.value)} className={sel(!!value.active)} aria-label="Activité"><option value="">Activité : toute</option><option value="30">Connecté depuis moins de 30 jours</option><option value="old">Pas connecté depuis 30 jours</option></select>
        <input value={value.place} onChange={(e) => set('place', e.target.value)} placeholder="Ville ou département (ex. 69)" className={`${sel(!!value.place)} w-52`} aria-label="Lieu" />
        {active && <button type="button" onClick={() => onChange(EMPTY_CREATOR_FILTERS)} className="text-primary-600 underline text-xs">Effacer ces filtres</button>}
        <button type="button" onClick={exportCsv} className="ml-auto text-primary-700 underline text-xs" data-testid="creators-csv">Exporter la sélection (CSV{total != null ? `, ${total}` : ''})</button>
      </div>
    </div>
  );
}
