'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

const STATE: Record<string, { label: string; cls: string }> = {
  waiting: { label: 'En attente d\'une vidéo', cls: 'bg-blue-100 text-blue-800' },
  late: { label: 'Aucune vidéo à J+7', cls: 'bg-orange-100 text-orange-800' },
  overdue: { label: 'Échéance dépassée', cls: 'bg-red-100 text-red-800' },
  deposited: { label: 'Vidéo déposée, à proposer', cls: 'bg-primary-100 text-primary-800' },
  sent: { label: 'Vidéo proposée', cls: 'bg-yellow-100 text-yellow-800' },
  bought: { label: 'Vidéo achetée', cls: 'bg-green-100 text-green-800' },
  closed: { label: 'Close', cls: 'bg-neutral-100 text-neutral-600' },
};

/** Requête partagée avec le bouton à compteur de l'outil de prospection */
export function useShowcaseRequests() {
  return useQuery({ queryKey: ['acq-showcase-requests'], queryFn: async () => (await api.get('/admin/acquisition/showcase-requests')).data.requests, refetchInterval: 60000 });
}

/** Réponse de repli (produit offert) : relue, modifiée, puis envoyée par email ou copiée pour un message privé */
function Fallback({ r, act }: { r: any; act: any }) {
  const [text, setText] = useState<string>(r.fallbackText || '');
  if (r.fallbackSentAt) return <div className="text-xs text-green-700 mt-2">Produit offert proposé le {formatDate(r.fallbackSentAt)}.</div>;
  return (
    <div className="mt-2 border-l-2 border-red-200 pl-3">
      <div className="text-xs text-neutral-700 mb-1">Réponse prête : elle propose la campagne au produit offert, créée en brouillon à l&apos;inscription de la marque.</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="w-full border border-neutral-300 rounded-lg px-2 py-1 text-xs" data-testid="request-fallback-text" />
      <div className="flex gap-2 flex-wrap mt-1">
        <Button size="sm" onClick={() => act.mutate({ id: r.id, action: 'send', via: 'email', text })} isLoading={act.isPending} disabled={!r.email || !text.trim()} title={r.email ? `Envoie cette réponse à ${r.email}` : 'Aucune adresse email sur la fiche : copiez le texte pour un message privé'}>Envoyer par email</Button>
        <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* presse-papiers indisponible */ } act.mutate({ id: r.id, action: 'send', via: 'copy', text }); }} disabled={!text.trim()} title="Copie le texte et marque la réponse comme envoyée en message privé">Copier pour un message privé</Button>
      </div>
    </div>
  );
}

/** Suivi des vidéos demandées par les marques (« oui vidéo ») : produit, créateurs prévenus, vidéos déposées, échéance de dix jours */
export default function ShowcaseRequests() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useShowcaseRequests();
  const act = useMutation({
    mutationFn: async ({ id, ...body }: any) => (await api.post(`/admin/acquisition/leads/${id}/showcase-request`, body)).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); queryClient.invalidateQueries({ queryKey: ['acq-showcase-requests'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const list = data || [];
  return (
    <Card className="p-6" data-testid="showcase-requests">
      <h2 className="text-lg font-semibold text-neutral-900 mb-1">Vidéos demandées par les marques</h2>
      <p className="text-sm text-neutral-600 mb-3">Une marque a répondu « oui vidéo » : les créateurs de sa niche sont prévenus et la première vidéo déposée lui est proposée. Sans vidéo au bout de sept jours, vous recevez une alerte ; au bout de dix jours, une réponse est préparée pour lui proposer la campagne au produit offert.</p>
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : list.length === 0 ? <p className="text-sm text-neutral-500">Aucune demande en cours. Une marque qui dit oui autrement que par « oui vidéo » s&apos;ajoute avec le bouton « Vidéo demandée » de sa fiche.</p> : (
        <div className="space-y-3">
          {list.map((r: any) => {
            const st = STATE[r.state] || STATE.waiting;
            return (
              <div key={r.id} className="border border-neutral-200 rounded-lg p-3 text-sm" data-testid="showcase-request">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-neutral-900">{r.name}</span>
                  {r.niche && <span className="text-xs text-neutral-500">· {r.niche}</span>}
                  <span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-neutral-700 mt-1">Vidéo demandée le {formatDate(r.requestedAt)} · produit : {r.product ? (/^https?:/.test(r.product) ? <a href={r.product} target="_blank" rel="noopener noreferrer" className="underline text-primary-700">page du produit</a> : <strong>{r.product}</strong>) : <span className="text-orange-700">non précisé</span>} · <strong>{r.videos}</strong> vidéo{r.videos > 1 ? 's' : ''} déposée{r.videos > 1 ? 's' : ''}</div>
                <div className="text-xs text-neutral-600 mt-0.5">Jour {r.days} sur 10 · échéance le {formatDate(r.dueAt)} · {r.notifiedAt ? `${r.notifiedCount} créateur(s) prévenu(s) le ${formatDate(r.notifiedAt)}` : 'créateurs pas encore prévenus'}{r.repliedAt ? ` · réponse envoyée à la marque le ${formatDate(r.repliedAt)}` : ' · réponse à la marque pas encore envoyée'}</div>
                {r.replyText && <div className="text-xs text-neutral-600 bg-neutral-50 rounded px-2 py-1 mt-1">« {r.replyText} »</div>}
                <div className="flex gap-3 flex-wrap mt-2 text-xs items-center">
                  <button type="button" className="underline text-primary-700" onClick={() => { const p = prompt('Produit visé (nom ou lien de la page) :', r.product || ''); if (p !== null && p.trim()) act.mutate({ id: r.id, action: 'create', product: p }); }} title="Les créateurs sont prévenus à nouveau quand le produit change">{r.product ? 'Modifier le produit' : 'Préciser le produit'}</button>
                  <button type="button" className="underline text-primary-700" onClick={() => act.mutate({ id: r.id, action: 'notify' })} title="Renvoie la notification et l'email aux créateurs de la niche">Prévenir à nouveau les créateurs</button>
                  {!r.videos && !r.fallbackAt && <button type="button" className="underline text-primary-700" onClick={() => act.mutate({ id: r.id, action: 'fallback' })} title="Prépare dès maintenant la réponse qui propose le produit offert, sans attendre le dixième jour">Préparer la réponse « produit offert »</button>}
                  {r.instagram && <a href={r.instagram} target="_blank" rel="noopener noreferrer" className="underline text-primary-700">Instagram</a>}
                  <button type="button" className="underline text-neutral-600" onClick={() => { const reason = prompt('Motif de la clôture (facultatif) :', ''); if (reason !== null) act.mutate({ id: r.id, action: 'close', reason }); }} title="La demande sort du suivi ; la marque n'apparaît plus comme « vidéo demandée » aux créateurs">Clore</button>
                </div>
                {!r.videos && r.fallbackAt && <Fallback key={r.fallbackAt} r={r} act={act} />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
