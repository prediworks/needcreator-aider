'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import { formatDate } from '@/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En cours de validation', cls: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Validée : à vous de tourner', cls: 'bg-green-100 text-green-800' },
  refused: { label: 'Non retenue', cls: 'bg-neutral-100 text-neutral-600' },
};

/**
 * « Ma marque n'est pas dans la liste » : le créateur possède un produit d'une marque que NeedCreator ne démarche pas encore et la suggère.
 * L'équipe valide avant tout tournage ; une grande marque demande une confirmation, une très grande est refusée d'office.
 */
export default function BrandSuggestForm({ onPick }: { onPick: (brand: any) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Lien « la suggérer » du tableau de bord (« ?suggerer=1 ») : le formulaire s'ouvre d'office
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('suggerer')) setOpen(true); } catch { /* adresse illisible */ } }, []);
  const [warn, setWarn] = useState('');
  const [f, setF] = useState({ name: '', website: '', instagram: '', tiktok: '', product: '' });
  const set = (k: string, v: string) => { setWarn(''); setF((p) => ({ ...p, [k]: v })); };
  const { data } = useQuery({ queryKey: ['showcase-suggestions'], queryFn: async () => (await api.get('/showcase/suggestions')).data });
  const missing = [!f.name.trim() && 'le nom de la marque', !f.product.trim() && 'le produit que vous possédez', !f.instagram.trim() && 'l\'Instagram de la marque'].filter(Boolean) as string[];
  const full = (data?.pending || 0) >= (data?.max || 3);
  const send = useMutation({
    mutationFn: async (confirm: boolean) => (await api.post('/showcase/suggestions', { ...f, confirm })).data,
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['showcase-suggestions'] });
      if (d.outcome === 'confirm') { setWarn(d.message); return; }
      setWarn('');
      if (d.outcome === 'refused') { toast.error(d.message, { duration: 15000 }); return; }
      toast.success(d.message, { duration: 12000 });
      if (d.outcome === 'existing') { queryClient.invalidateQueries({ queryKey: ['showcase-brands'] }); onPick({ ...d.brand, product: f.product }); }
      setF({ name: '', website: '', instagram: '', tiktok: '', product: '' }); setOpen(false);
    },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 12000 }),
  });
  const list = data?.suggestions || [];
  return (
    <div className="mt-3" data-testid="brand-suggest">
      <button type="button" onClick={() => setOpen(!open)} className="text-sm text-primary-700 underline" data-testid="brand-suggest-toggle">{open ? 'Fermer' : 'Ma marque n\'est pas dans la liste : la suggérer'}</button>
      {open && (
        <div className="mt-3 border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <p className="text-sm text-neutral-700 mb-3">Vous possédez un produit d&apos;une marque absente de la liste ? Proposez-la. Son profil Instagram est vérifié, puis l&apos;équipe la valide, en général sous 48 heures, et vous la réserve dix jours. <strong>Attendez la validation avant de tourner.</strong> Les petites et moyennes marques répondent ; les très grandes ne sont pas acceptées.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Nom de la marque" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="ex. Maison Verveine" />
            <Input label="Produit que vous possédez" value={f.product} onChange={(e) => set('product', e.target.value)} placeholder="ex. Sérum éclat 30 ml" />
            <Input label="Instagram de la marque (indispensable)" value={f.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@maisonverveine" />
            <Input label="Site de la marque (facultatif)" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="maisonverveine.fr" />
            <Input label="TikTok de la marque (facultatif)" value={f.tiktok} onChange={(e) => set('tiktok', e.target.value)} placeholder="@maisonverveine" />
          </div>
          <p className="text-xs text-neutral-500 mt-2">L&apos;Instagram est indispensable : c&apos;est là que nous présentons votre vidéo à la marque, et c&apos;est ce qui nous permet de vérifier qu&apos;il s&apos;agit bien d&apos;une marque.</p>
          {warn && <div className="mt-3 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-3" data-testid="brand-suggest-warning">{warn}</div>}
          <div className="flex gap-2 flex-wrap items-center mt-3">
            {warn
              ? <><Button size="sm" onClick={() => send.mutate(true)} isLoading={send.isPending}>La proposer quand même</Button><Button size="sm" variant="outline" onClick={() => { setWarn(''); setF({ name: '', website: '', instagram: '', tiktok: '', product: '' }); }}>Choisir une autre marque</Button></>
              : <Button size="sm" onClick={() => send.mutate(false)} isLoading={send.isPending} disabled={missing.length > 0 || full} data-testid="brand-suggest-send">Suggérer cette marque</Button>}
            {full ? <span className="text-xs text-orange-700">Vous avez déjà {data?.max} suggestions en attente de validation.</span> : <MissingHint items={missing} />}
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div className="mt-3 space-y-1" data-testid="brand-suggest-list">
          <div className="text-xs font-medium text-neutral-700">Mes suggestions</div>
          {list.slice(0, 6).map((s: any) => (
            <div key={s.id} className="text-xs text-neutral-700 flex gap-2 flex-wrap items-center">
              <span className="font-medium">{s.name}</span><span className="text-neutral-500">· {s.product} · {formatDate(s.createdAt)}</span>
              <span className={`px-2 py-0.5 rounded-full ${STATUS[s.status]?.cls}`}>{STATUS[s.status]?.label}</span>
              {s.status === 'approved' && s.leadId && <button type="button" className="underline text-primary-700" onClick={() => onPick({ id: s.leadId, name: s.name, website: s.website, product: s.product })}>Choisir cette marque</button>}
              {s.status === 'refused' && s.reason && <span className="text-neutral-500 basis-full">{s.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
