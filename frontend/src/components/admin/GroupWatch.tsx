'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

const KIND: Record<string, { label: string; cls: string }> = {
  brand_seeks_creators: { label: 'Marque cherche des créateurs', cls: 'bg-green-100 text-green-800' },
  brand_question: { label: 'Question d\'une marque', cls: 'bg-blue-100 text-blue-800' },
  creator_seeks_brands: { label: 'Créateur cherche des marques', cls: 'bg-purple-100 text-purple-800' },
  creator_question: { label: 'Question d\'un créateur', cls: 'bg-neutral-100 text-neutral-700' },
};
const AUDIENCE: Record<string, string> = { creators: 'Créateurs UGC', brands: 'Marques et e-commerçants', ads: 'Annonceurs (publicité)', other: 'Autre' };
const STATUS: Record<string, string> = { answered: 'Répondu', skipped: 'Passée' };

/** Requête partagée avec le bouton à compteur de l'outil de prospection */
export function useGroupWatch() {
  return useQuery({ queryKey: ['acq-groups'], queryFn: async () => (await api.get('/admin/acquisition/groups')).data, refetchInterval: 60000 });
}

/**
 * Groupes Facebook : les demandes relevées par l'extension, avec un commentaire proposé. On répond à des demandes, on ne démarche pas
 * des membres : l'outil ne publie rien, ne rejoint rien, n'écrit à personne.
 */
export default function GroupWatch() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGroupWatch();
  const [url, setUrl] = useState('');
  const [audience, setAudience] = useState('creators');
  const [showDone, setShowDone] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['acq-groups'] });
  const onError = (e: any) => toast.error(getErrorMessage(e), { duration: 8000 });
  const add = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/groups', { url, audience })).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); setUrl(''); refresh(); }, onError });
  const edit = useMutation({ mutationFn: async ({ id, ...body }: any) => (await api.patch(`/admin/acquisition/groups/${id}`, body)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/admin/acquisition/groups/${id}`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError });
  const decide = useMutation({ mutationFn: async ({ id, action }: any) => (await api.post(`/admin/acquisition/group-posts/${id}`, { action })).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError });
  const read = useMutation({ mutationFn: async () => (await api.post('/browser-tasks/batches', { preset: 'facebook_groups' })).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); queryClient.invalidateQueries({ queryKey: ['ext-batches'] }); refresh(); }, onError });
  const copyOpen = async (p: any) => {
    try { await navigator.clipboard.writeText(p.comment || ''); toast.success('Commentaire copié : relisez-le, adaptez-le, puis publiez-le sous la publication', { duration: 6000 }); } catch { /* presse-papiers indisponible */ }
    window.open(p.searchUrl || p.groupUrl, '_blank', 'noopener,noreferrer');
  };
  const groups = data?.groups || [];
  const posts = (data?.posts || []).filter((p: any) => showDone || p.status === 'todo');
  return (
    <Card className="p-6" data-testid="group-watch">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-lg font-semibold text-neutral-900">Groupes Facebook : demandes à répondre</h2>
        <Button size="sm" onClick={() => read.mutate()} isLoading={read.isPending} disabled={!data?.toRead} data-testid="groups-read" title="Crée le lot « Groupes Facebook » : l'extension (profil de lecture) ouvre la page de chaque groupe à lire, une fois par jour au plus">Lire les groupes ({data?.toRead ?? 0})</Button>
      </div>
      <p className="text-sm text-neutral-600 mb-4">L&apos;extension lit les publications récentes des groupes suivis. Ne sont gardées que celles qui expriment un besoin, avec un commentaire proposé. Vous relisez, vous publiez vous-même, depuis votre compte : l&apos;outil ne publie rien et ne garde aucune liste de membres. Un message privé seulement après un échange public.</p>

      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : (
        <>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-900">À répondre : {data?.todo ?? 0}</h3>
            <label className="text-xs text-neutral-600 flex items-center gap-1"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Afficher aussi les demandes traitées</label>
          </div>
          {posts.length === 0 ? <p className="text-sm text-neutral-500 mb-4">{groups.length ? 'Aucune demande en attente. Lancez « Lire les groupes », puis Start dans l\'extension.' : 'Ajoutez un premier groupe ci-dessous.'}</p> : (
            <div className="space-y-3 mb-5">
              {posts.map((p: any) => (
                <div key={p.id} className={`border rounded-lg p-3 text-sm ${p.status === 'todo' ? 'border-neutral-200' : 'border-neutral-100 bg-neutral-50'}`} data-testid="group-post">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${KIND[p.kind]?.cls}`}>{KIND[p.kind]?.label}</span>
                    {p.status !== 'todo' && <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-200 text-neutral-700">{STATUS[p.status]}</span>}
                    <span className="text-xs text-neutral-600">{p.group} · {p.author || 'auteur non relevé'} · relevée le {formatDate(p.foundAt)}</span>
                  </div>
                  <p className="mt-2 text-neutral-800 whitespace-pre-line">« {p.text} »</p>
                  {p.comment && <div className="mt-2 bg-primary-50/50 border border-primary-200 rounded-lg p-2 text-neutral-800 whitespace-pre-line" data-testid="group-comment"><span className="text-xs font-medium text-primary-800">Commentaire proposé · </span>{p.comment}</div>}
                  <div className="flex gap-2 flex-wrap mt-2">
                    <Button size="sm" onClick={() => copyOpen(p)} title="Copie le commentaire et ouvre la recherche du groupe sur les premiers mots de la publication : elle apparaît en tête. Relisez et publiez vous-même." data-testid="group-open"><ExternalLink className="w-4 h-4 mr-1" /> Copier et ouvrir</Button>
                    {p.status === 'todo' ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: p.id, action: 'answered' })} isLoading={decide.isPending} data-testid="group-answered">Répondu</Button>
                        <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: p.id, action: 'skipped' })} isLoading={decide.isPending} title="Demande trop ancienne, hors sujet ou déjà couverte : elle quitte la file">Passer</Button>
                      </>
                    ) : <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: p.id, action: 'todo' })} isLoading={decide.isPending}>Remettre dans la file</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-sm font-semibold text-neutral-900 mb-2">Groupes suivis : {groups.length} / {data?.maxGroups ?? 40}</h3>
          {groups.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-neutral-500 border-b border-neutral-200"><th className="py-1 pr-2">Groupe</th><th className="py-1 pr-2">Public</th><th className="py-1 pr-2">Lectures</th><th className="py-1 pr-2">Demandes</th><th className="py-1 pr-2">Répondues</th><th className="py-1 pr-2">Dernière lecture</th><th className="py-1"></th></tr></thead>
                <tbody>
                  {groups.map((g: any) => (
                    <tr key={g.id} className={`border-b border-neutral-100 align-top ${g.active ? '' : 'text-neutral-400'}`} data-testid="group-row">
                      <td className="py-1.5 pr-2"><a href={g.url} target="_blank" rel="noopener noreferrer" className="underline text-primary-700">{g.name || g.key}</a>{!g.active && ' (en pause)'}</td>
                      <td className="py-1.5 pr-2"><select value={g.audience} onChange={(e) => edit.mutate({ id: g.id, audience: e.target.value })} className="border border-neutral-300 rounded px-1 py-0.5 text-xs">{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                      <td className="py-1.5 pr-2">{g.stats?.reads ?? 0}</td>
                      <td className="py-1.5 pr-2">{g.stats?.requests ?? 0}</td>
                      <td className="py-1.5 pr-2">{g.stats?.answered ?? 0}</td>
                      <td className="py-1.5 pr-2">{g.lastReadAt ? `${formatDate(g.lastReadAt)} · ${g.lastOutcome}` : 'jamais lu'}</td>
                      <td className="py-1.5 whitespace-nowrap">
                        <button type="button" className="underline mr-2" onClick={() => edit.mutate({ id: g.id, active: !g.active })}>{g.active ? 'Pause' : 'Reprendre'}</button>
                        <button type="button" className="underline text-red-700" onClick={() => { if (confirm(`Retirer « ${g.name || g.key} » et ses demandes ?`)) remove.mutate(g.id); }}>Retirer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2 flex-wrap items-center">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.facebook.com/groups/…" className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[240px]" data-testid="group-url" />
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <Button size="sm" variant="outline" onClick={() => add.mutate()} isLoading={add.isPending} disabled={!url.trim()} data-testid="group-add">Suivre ce groupe</Button>
          </div>
          <p className="text-xs text-neutral-500 mt-2">Rejoignez d&apos;abord le groupe à la main, avec le compte Facebook du profil Chrome de lecture : un groupe privé non rejoint ne montre aucune publication. {data?.perLot ?? 15} groupes lus par lot, chacun une fois par jour au plus. Un groupe sans demande après deux semaines est à retirer.</p>
        </>
      )}
    </Card>
  );
}
