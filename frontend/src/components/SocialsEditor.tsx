'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SocialIcons, { PlatformIcon } from '@/components/SocialIcons';
import { useUpdateProfile } from '@/hooks/useProfile';
import { PLATFORMS } from '@/lib/labels';
import { Plus, Trash2, Save } from 'lucide-react';

const NETWORKS = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'other'];
const REAL_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x', 'website', 'other'];

function guessPlatform(url: string) {
  const u = url.toLowerCase();
  if (u.includes('tiktok')) return 'tiktok';
  if (u.includes('instagram')) return 'instagram';
  if (u.includes('youtu')) return 'youtube';
  if (u.includes('linkedin')) return 'linkedin';
  if (u.includes('facebook') || u.includes('fb.')) return 'facebook';
  if (u.includes('twitter') || u.includes('x.com')) return 'x';
  return 'other';
}

/**
 * Édition des réseaux sociaux du créateur (liens + stats déclarées)
 */
export function SocialsEditor({ socials = [] }: { socials?: any[] }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const update = useUpdateProfile();

  const start = () => { setRows(socials.map((s) => ({ ...s }))); setEditing(true); };
  const setRow = (i: number, patch: any) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    await update.mutateAsync({ socials: rows.filter((r) => r.url) });
    setEditing(false);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-neutral-900">Mes réseaux sociaux</h2>
        {!editing && <Button size="sm" variant="outline" onClick={start}>{socials.length ? 'Modifier' : 'Ajouter'}</Button>}
      </div>
      <p className="text-sm text-neutral-500 mb-4">Les marques voient vos réseaux et vos audiences sur votre profil. Renseignez vos chiffres actuels (nous les vérifierons automatiquement plus tard).</p>

      {!editing ? (
        socials.length ? <SocialIcons socials={socials} /> : <p className="text-sm text-neutral-500">Aucun réseau renseigné.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid md:grid-cols-12 gap-2 items-end border border-neutral-100 rounded-lg p-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-neutral-600 mb-1">Réseau</label>
                <select value={r.network} onChange={(e) => setRow(i, { network: e.target.value })} className="w-full px-2 py-2 border border-neutral-300 rounded-lg text-sm">
                  {NETWORKS.map((n) => <option key={n} value={n}>{PLATFORMS[n]}</option>)}
                </select>
              </div>
              <div className="md:col-span-4"><Input label="Lien du profil" type="url" value={r.url || ''} onChange={(e) => setRow(i, { url: e.target.value, network: r.network || guessPlatform(e.target.value) })} placeholder="https://www.tiktok.com/@vous" /></div>
              <div className="md:col-span-2"><Input label="Pseudo" value={r.handle || ''} onChange={(e) => setRow(i, { handle: e.target.value })} placeholder="@vous" /></div>
              <div className="md:col-span-2"><Input label="Abonnés" type="number" min={0} value={r.followers ?? ''} onChange={(e) => setRow(i, { followers: e.target.value })} /></div>
              <div className="md:col-span-1"><Input label="Vues moy." type="number" min={0} value={r.avgViews ?? ''} onChange={(e) => setRow(i, { avgViews: e.target.value })} /></div>
              <div className="md:col-span-1 flex justify-end">
                <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-red-500 p-2" title="Retirer"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setRows([...rows, { network: 'tiktok', url: '', handle: '', followers: '', avgViews: '' }])} disabled={rows.length >= 10}>
              <Plus className="w-4 h-4 mr-1" /> Ajouter un réseau
            </Button>
            <Button size="sm" onClick={save} isLoading={update.isPending}><Save className="w-4 h-4 mr-1" /> Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Édition des réalisations externes (vidéos publiées hors NeedCreator)
 */
export function RealisationsEditor({ realisations = [] }: { realisations?: any[] }) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [brandName, setBrandName] = useState('');
  const [platform, setPlatform] = useState('other');
  const [showAll, setShowAll] = useState(false);
  const update = useUpdateProfile();

  const add = async () => {
    const next = [{ url, title, brandName, platform: platform === 'other' ? guessPlatform(url) : platform, addedAt: new Date().toISOString() }, ...realisations];
    await update.mutateAsync({ realisations: next });
    setUrl(''); setTitle(''); setBrandName(''); setPlatform('other'); setAdding(false);
  };
  const remove = async (i: number) => {
    if (!confirm('Retirer cette réalisation ?')) return;
    await update.mutateAsync({ realisations: realisations.filter((_, j) => j !== i) });
  };

  const shown = showAll ? realisations : realisations.slice(0, 6);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-neutral-900">Mes réalisations ({realisations.length})</h2>
        <Button size="sm" onClick={() => setAdding(!adding)}><Plus className="w-4 h-4 mr-1" /> Ajouter un lien</Button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">Vidéos que vous avez déjà publiées pour des marques, hors NeedCreator. Les vidéos livrées via la plateforme s&apos;ajoutent automatiquement si la marque et vous les rendez publiques.</p>

      {adding && (
        <div className="bg-neutral-50 rounded-lg p-4 mb-4 grid md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-5"><Input label="Lien de la vidéo" type="url" value={url} onChange={(e) => { setUrl(e.target.value); setPlatform(guessPlatform(e.target.value)); }} placeholder="https://www.instagram.com/reel/…" /></div>
          <div className="md:col-span-3"><Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Unboxing sérum vitamine C" /></div>
          <div className="md:col-span-2"><Input label="Marque" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Nom de la marque" /></div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-neutral-600 mb-1">Réseau</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full px-2 py-2 border border-neutral-300 rounded-lg text-sm">
              {REAL_PLATFORMS.map((n) => <option key={n} value={n}>{PLATFORMS[n]}</option>)}
            </select>
          </div>
          <div className="md:col-span-12 flex gap-2">
            <Button size="sm" onClick={add} isLoading={update.isPending} disabled={!/^https?:\/\//.test(url)}>Ajouter</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {realisations.length ? (
        <>
          <div className="grid sm:grid-cols-2 gap-2">
            {shown.map((r: any, i: number) => (
              <div key={r._id || i} className="border border-neutral-200 rounded-lg p-3 flex items-start gap-2">
                <PlatformIcon platform={r.platform} className="text-lg" />
                <div className="min-w-0 flex-1">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-neutral-900 hover:text-primary-600 truncate block">{r.title || r.url}</a>
                  <div className="text-xs text-neutral-500">{r.brandName ? `${r.brandName} · ` : ''}{PLATFORMS[r.platform] || r.platform}</div>
                </div>
                <button onClick={() => remove(i)} className="text-red-500 p-1" title="Retirer"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          {realisations.length > 6 && (
            <button onClick={() => setShowAll(!showAll)} className="text-sm text-primary-600 hover:underline mt-3">
              {showAll ? 'Réduire' : `Voir les ${realisations.length - 6} autres`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">Aucune réalisation ajoutée.</p>
      )}
    </Card>
  );
}
