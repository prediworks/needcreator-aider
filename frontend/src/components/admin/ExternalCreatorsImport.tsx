'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { countryLabel } from '@/components/ExternalCreatorsList';

const SCOPES: Record<string, string> = { france: 'France uniquement', francophone: 'Francophonie (FR, BE, CH, LU, MC, MA, TN, DZ, CA)', europe: 'Europe', all: 'Tous les pays' };

/**
 * Admin : import de listes de créateurs (xlsx / csv) et statistiques
 */
export default function ExternalCreatorsImport() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [scope, setScope] = useState('europe');
  const [result, setResult] = useState<any>(null);
  const [exportCountry, setExportCountry] = useState('FR');
  const [exportMin, setExportMin] = useState('2000');
  const [unsubFile, setUnsubFile] = useState<File | null>(null);
  const { data: stats } = useQuery({ queryKey: ['admin', 'external-stats'], queryFn: async () => (await api.get('/external-creators/admin/stats')).data });
  const importMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData(); fd.append('file', file as File); fd.append('scope', scope);
      return (await api.post('/external-creators/admin/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    onSuccess: (d) => { setResult(d.stats); toast.success(d.message, { duration: 8000 }); setFile(null); queryClient.invalidateQueries({ queryKey: ['admin', 'external-stats'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });

  const exportCsv = async () => {
    try {
      const res = await api.get('/external-creators/admin/export', { params: { country: exportCountry || undefined, minFollowers: exportMin || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `createurs-references-${exportCountry || 'tous'}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(getErrorMessage(e, 'Export impossible')); }
  };
  const unsubMutation = useMutation({
    mutationFn: async () => { const fd = new FormData(); fd.append('file', unsubFile as File); return (await api.post('/external-creators/admin/unsubscribes', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data; },
    onSuccess: (d) => { toast.success(d.message); setUnsubFile(null); queryClient.invalidateQueries({ queryKey: ['admin', 'external-stats'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-1">Mailing : export et désabonnements</h2>
        <p className="text-sm text-neutral-600 mb-4">Export CSV pour votre outil de mailing (colonnes : email, prénom, pseudo, nom, niche, abonnés, pays, réseaux, statut, lien de la fiche, lien de retrait). Les créateurs retirés et ceux déjà inscrits ne sont jamais exportés. Après chaque campagne d&apos;emails, réimportez ici les désabonnés : ils passent en « retiré » et ne seront plus exportés ni réimportés.</p>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Pays (codes, séparés par des virgules)</label>
            <input value={exportCountry} onChange={(e) => setExportCountry(e.target.value.toUpperCase())} placeholder="FR,BE,CH" className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Abonnés minimum</label>
            <input type="number" value={exportMin} onChange={(e) => setExportMin(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" /> Exporter le CSV</Button>
        </div>
        <div className="grid md:grid-cols-4 gap-3 items-end mt-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Désabonnés (fichier csv/xlsx avec une colonne Email, ou liste d&apos;emails)</label>
            <input type="file" accept=".csv,.xlsx,.txt" onChange={(e) => setUnsubFile(e.target.files?.[0] || null)} className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-neutral-100 file:text-neutral-700" />
          </div>
          <Button variant="outline" onClick={() => unsubMutation.mutate()} isLoading={unsubMutation.isPending} disabled={!unsubFile}>Marquer comme retirés</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-1">Importer une liste de créateurs</h2>
        <p className="text-sm text-neutral-600 mb-4">Fichier xlsx ou csv avec les colonnes : Username, Name, Country, Email, Instagram, YouTube, TikTok (optionnel), Followers, Posts, Likes, Niche. L&apos;import peut être relancé : les créateurs déjà présents (même pseudo ou même email) sont mis à jour, jamais dupliqués. Ceux qui ont demandé leur retrait ne sont jamais réimportés.</p>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Fichier</label>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Périmètre</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
              {Object.entries(SCOPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <Button className="mt-4" onClick={() => importMutation.mutate()} isLoading={importMutation.isPending} disabled={!file}><Upload className="w-4 h-4 mr-2" /> Importer</Button>
        {result && (
          <div className="mt-4 text-sm bg-neutral-50 rounded-lg p-4 grid sm:grid-cols-3 gap-2">
            <div>Lignes lues : <strong>{result.rows}</strong></div>
            <div>Créés : <strong>{result.created}</strong></div>
            <div>Mis à jour : <strong>{result.updated}</strong></div>
            <div>Hors périmètre : <strong>{result.skippedCountry}</strong></div>
            <div>Doublons dans le fichier : <strong>{result.duplicatesInFile}</strong></div>
            <div>Lignes invalides : <strong>{result.invalid}</strong></div>
            {Object.keys(result.unmappedNiches || {}).length > 0 && (
              <div className="sm:col-span-3 text-orange-800">Niches non reconnues (conservées telles quelles sur les fiches) : {Object.entries(result.unmappedNiches).map(([n, c]) => `${n} (${c})`).join(', ')}</div>
            )}
          </div>
        )}
      </Card>
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-3">Annuaire des créateurs référencés</h2>
        {stats ? (
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-neutral-500 mb-1">Par statut</div>
              <ul className="space-y-1">
                <li>Référencés : <strong>{stats.byStatus.listed || 0}</strong></li>
                <li>Invités par une marque : <strong>{stats.byStatus.invited || 0}</strong></li>
                <li>Inscrits sur NeedCreator : <strong>{stats.byStatus.joined || 0}</strong></li>
                <li>Retirés à leur demande : <strong>{stats.byStatus.optout || 0}</strong></li>
              </ul>
            </div>
            <div>
              <div className="text-neutral-500 mb-1">Par pays (visibles)</div>
              <ul className="space-y-1">{stats.byCountry.map((c: any) => <li key={c.country}>{countryLabel(c.country)} : <strong>{c.count}</strong></li>)}</ul>
            </div>
          </div>
        ) : <p className="text-sm text-neutral-500">Chargement…</p>}
        <p className="text-xs text-neutral-500 mt-4">Annuaire public : <a href="/annuaire-createurs" target="_blank" className="underline">/annuaire-createurs</a>. Les emails ne sont jamais affichés ; les marques invitent via la plateforme (une invitation par créateur tous les 14 jours).</p>
      </Card>
    </div>
  );
}
