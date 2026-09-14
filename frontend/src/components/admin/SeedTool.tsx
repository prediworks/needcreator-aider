'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Sprout, Trash2, Eye } from 'lucide-react';

const EXAMPLE = `# email ; mot de passe ; entreprise ; SIRET ; site web ; secteur ; nombre de campagnes ; tarif max (0 = devis libre) ; commentaire
marque1@votre-domaine.fr ; MotDePasse123! ; Atelier Lumen ; 35600000000048 ; https://atelier-lumen.fr ; beauté ; 3 ; 400 ; Marque lyonnaise de soins bio, ton chaleureux, produits envoyés sous 48 h
marque2@votre-domaine.fr ; MotDePasse123! ; Maison Céréales ; ; ; food ; 2 ; 0`;

/** Amorçage : marques et campagnes créées en masse, invisibles côté créateur, supprimables par lot */
export default function SeedTool() {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState('');
  const [opts, setOpts] = useState({ publishedWithinDays: '30', deadlineWithinDays: '30', budgetMin: '150', budgetMax: '600', freeQuoteShare: '30', closeAtDeadline: true });
  const { data: batches } = useQuery({ queryKey: ['seed-batches'], queryFn: async () => (await api.get('/admin/seed/batches')).data });
  const preview = useMutation({ mutationFn: async () => (await api.post('/admin/seed/preview', { lines })).data, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const run = useMutation({
    mutationFn: async () => (await api.post('/admin/seed/run', { lines, publishedWithinDays: Number(opts.publishedWithinDays), deadlineWithinDays: Number(opts.deadlineWithinDays), budgetMin: Number(opts.budgetMin), budgetMax: Number(opts.budgetMax), freeQuoteShare: Number(opts.freeQuoteShare), closeAtDeadline: opts.closeAtDeadline })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); setLines(''); preview.reset(); queryClient.invalidateQueries({ queryKey: ['seed-batches'] }); queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 12000 }),
  });
  const del = useMutation({
    mutationFn: async ({ batch, users }: { batch: string; users: boolean }) => (await api.delete(`/admin/seed/batches/${encodeURIComponent(batch)}${users ? '?users=1' : ''}`)).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); queryClient.invalidateQueries({ queryKey: ['seed-batches'] }); queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  const p = preview.data;
  const ready = !!p && p.errors.length === 0 && p.rows.length > 0;
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Sprout className="w-5 h-5 text-primary-500" /> Amorçage : marques et campagnes en masse</h2>
        <p className="text-sm text-neutral-600 mb-3">Pour que l&apos;application ne paraisse pas vide aux premiers créateurs. Les comptes sont créés s&apos;ils n&apos;existent pas (email confirmé, entreprise vérifiée, signataire renseigné), puis des campagnes réalistes sont publiées à partir des modèles par secteur, avec des dates étalées. Côté créateur, aucune différence. Utilisez des adresses d&apos;un domaine que vous contrôlez : les devis reçus et les relances y arrivent. Vous pouvez vous connecter avec ces comptes pour répondre aux devis.</p>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Une marque par ligne : email ; mot de passe ; entreprise ; SIRET ; site web ; secteur ; nombre de campagnes ; tarif max ; commentaire</label>
        <textarea value={lines} onChange={(e) => { setLines(e.target.value); preview.reset(); }} rows={7} placeholder={EXAMPLE} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono" />
        <p className="text-xs text-neutral-500 mt-1">Secteurs reconnus : beauté, e-commerce, food, tech, mode, services (autre mot = modèle au hasard). SIRET et site facultatifs. Tarif max : plafond du budget des campagnes de cette marque, 0 pour des campagnes « devis libre » sans budget affiché, vide pour un mélange réaliste : la part indiquée ci-dessous en devis libre, le reste dans la fourchette du lot. Commentaire facultatif : quelques mots sur l'entreprise ou ses attentes, repris dans la présentation de la marque et à la fin de chaque brief. Ligne commençant par # ignorée.</p>
        <div className="grid sm:grid-cols-5 gap-3 mt-4">
          <Input label="Publiées dans les N derniers jours" type="number" min={0} max={90} value={opts.publishedWithinDays} onChange={(e) => setOpts({ ...opts, publishedWithinDays: e.target.value })} />
          <Input label="Dates limites dans les N prochains jours" type="number" min={3} max={120} value={opts.deadlineWithinDays} onChange={(e) => setOpts({ ...opts, deadlineWithinDays: e.target.value })} />
          <Input label="Budget minimum (€)" type="number" min={50} value={opts.budgetMin} onChange={(e) => setOpts({ ...opts, budgetMin: e.target.value })} />
          <Input label="Budget maximum (€)" type="number" min={50} value={opts.budgetMax} onChange={(e) => setOpts({ ...opts, budgetMax: e.target.value })} />
          <Input label="Part en devis libre (%)" type="number" min={0} max={100} value={opts.freeQuoteShare} onChange={(e) => setOpts({ ...opts, freeQuoteShare: e.target.value })} />
        </div>
        <label className="flex items-start gap-2 text-sm text-neutral-700 mt-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={opts.closeAtDeadline} onChange={(e) => setOpts({ ...opts, closeAtDeadline: e.target.checked })} />
          <span><strong>Clôturer chaque campagne à sa date limite</strong> et prévenir les candidats : email de non-sélection avec, en premier conseil, le programme Ambassadeur. Recommandé : aucun créateur ne reste sans réponse.</span>
        </label>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button variant="outline" onClick={() => preview.mutate()} isLoading={preview.isPending} disabled={!lines.trim()}><Eye className="w-4 h-4 mr-1" /> Vérifier</Button>
          <Button onClick={() => { if (confirm(`Créer ${p?.rows.length} compte(s) et ${p?.totalCampaigns} campagne(s) ?`)) run.mutate(); }} isLoading={run.isPending} disabled={!ready}>Créer le lot</Button>
          <MissingHint className="self-center" items={[!lines.trim() && 'au moins une ligne', lines.trim() && !p && 'une vérification (bouton Vérifier)', p && p.errors.length > 0 && `${p.errors.length} ligne(s) à corriger`]} />
        </div>
        {p && (
          <div className="mt-4 text-sm">
            {p.errors.length > 0 && <ul className="text-red-700 mb-2 list-disc list-inside">{p.errors.map((e: any) => <li key={e.line}>Ligne {e.line} : {e.errors.join(', ')} · <span className="font-mono text-xs">{e.raw}</span></li>)}</ul>}
            {p.rows.length > 0 && (
              <table className="w-full text-xs"><thead><tr className="text-left text-neutral-500"><th className="py-1 pr-3">Email</th><th className="py-1 pr-3">Entreprise</th><th className="py-1 pr-3">SIRET</th><th className="py-1 pr-3">Modèle</th><th className="py-1 pr-3">Campagnes</th><th className="py-1 pr-3">Tarif max</th><th className="py-1 pr-3">Commentaire</th><th className="py-1">Compte</th></tr></thead>
                <tbody>{p.rows.map((r: any) => <tr key={r.email} className="border-t border-neutral-100"><td className="py-1 pr-3">{r.email}</td><td className="py-1 pr-3">{r.companyName}</td><td className="py-1 pr-3">{r.siret || '—'}</td><td className="py-1 pr-3">{r.template}</td><td className="py-1 pr-3">{r.count}</td><td className="py-1 pr-3">{r.maxBudget === 0 ? 'devis libre' : r.maxBudget ? `${r.maxBudget} €` : 'mélange (fourchette + devis libres)'}</td><td className="py-1 pr-3 max-w-[200px] truncate" title={r.comment}>{r.comment || '—'}</td><td className="py-1">{r.existing ? `existe (${r.existing})` : 'à créer'}</td></tr>)}</tbody></table>
            )}
            <p className="text-neutral-600 mt-2">{p.rows.length} compte(s), {p.totalCampaigns} campagne(s) au total.</p>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-neutral-900 mb-1">Lots créés</h3>
        <p className="text-sm text-neutral-600 mb-3">Supprimer un lot retire ses campagnes et les devis reçus. « Avec les comptes » supprime aussi les marques du lot, dans la base et dans Firebase.</p>
        {batches?.batches?.length ? (
          <ul className="divide-y divide-neutral-100 text-sm">
            {batches.batches.map((b: any) => (
              <li key={b.batch} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div><span className="font-mono text-xs">{b.batch}</span> · {b.accounts} compte(s) · {b.campaigns} campagne(s) dont {b.active} ouverte(s) · {b.applications} devis reçu(s){b.createdAt ? ` · ${formatDate(b.createdAt)}` : ''}<div className="text-xs text-neutral-500">{b.emails.join(', ')}</div></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" isLoading={del.isPending} onClick={() => { if (confirm(`Supprimer les ${b.campaigns} campagne(s) du lot ${b.batch} ? Les comptes sont conservés.`)) del.mutate({ batch: b.batch, users: false }); }}><Trash2 className="w-4 h-4 mr-1" /> Campagnes</Button>
                  <Button size="sm" variant="ghost" isLoading={del.isPending} onClick={() => { if (confirm(`Supprimer le lot ${b.batch} AVEC ses ${b.accounts} compte(s) marque (base + Firebase) ?`)) del.mutate({ batch: b.batch, users: true }); }}><Trash2 className="w-4 h-4 mr-1" /> Avec les comptes</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-500">Aucun lot pour l&apos;instant.</p>}
      </Card>
    </div>
  );
}
