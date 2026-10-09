'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Envoyé', cls: 'bg-blue-100 text-blue-800' },
  accepted_needcreator: { label: 'Accepté via NeedCreator', cls: 'bg-green-100 text-green-800' },
  accepted_direct: { label: 'Réglé en direct', cls: 'bg-green-50 text-green-700' },
  declined: { label: 'Décliné', cls: 'bg-red-100 text-red-800' },
  expired: { label: 'Expiré', cls: 'bg-neutral-100 text-neutral-600' },
};

/**
 * Devis de créateurs : envoyé, ouvert par le client (les ouvertures du créateur et de l'équipe ne comptent pas), rappels, issue.
 * Sert à savoir où ça bloque : jamais ouvert (email), ouvert sans suite (étape suivante), et à appeler le créateur concerné.
 */
export default function QuotesAdmin() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-quotes'], queryFn: async () => (await api.get('/admin/quotes')).data.quotes as any[], staleTime: 60000 });
  const rows = data || [];
  const sent = rows.filter(q => q.status === 'sent');
  const neverOpened = sent.filter(q => !q.viewedAt).length;
  const openedNoAnswer = sent.filter(q => q.viewedAt).length;
  return (
    <Card className="p-6" data-testid="quotes-admin">
      <h2 className="text-lg font-semibold text-neutral-900">Devis des créateurs</h2>
      <p className="text-sm text-neutral-600 mb-3">Ce que font les clients des devis. « Jamais ouvert » : le problème est l&apos;email (objet, spam, adresse). « Ouvert sans réponse » : le problème est l&apos;étape suivante, appelez le créateur pour relancer. Les ouvertures du créateur et de l&apos;équipe ne comptent pas.</p>
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : !rows.length ? <p className="text-sm text-neutral-500">Aucun devis envoyé pour l&apos;instant.</p> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><div className="text-xs text-neutral-600">En attente</div><div className="text-xl font-bold">{sent.length}</div></div>
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><div className="text-xs text-neutral-600">dont jamais ouverts</div><div className="text-xl font-bold">{neverOpened}</div></div>
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><div className="text-xs text-neutral-600">dont ouverts sans réponse</div><div className="text-xl font-bold">{openedNoAnswer}</div></div>
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-100"><div className="text-xs text-neutral-600">Acceptés</div><div className="text-xl font-bold">{rows.filter(q => q.status.startsWith('accepted')).length}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-500 border-b"><th className="py-2 pr-3">Client</th><th className="pr-3">Créateur</th><th className="pr-3">Devis</th><th className="pr-3">Envoyé</th><th className="pr-3" title="Ouvertures de la page du devis par le client">Ouvert</th><th className="pr-3">Rappels</th><th className="pr-3">Issue</th></tr></thead>
              <tbody>
                {rows.map((q) => {
                  const st = STATUS[q.status] || { label: q.status, cls: 'bg-neutral-100 text-neutral-700' };
                  return (
                    <tr key={q.id} className="border-b border-neutral-100 align-top" data-testid="quotes-admin-row">
                      <td className="py-2 pr-3"><div className="font-medium text-neutral-900">{q.company}</div><div className="text-xs text-neutral-500">{q.email}</div></td>
                      <td className="pr-3">{q.creator}</td>
                      <td className="pr-3"><div>{q.title}</div><div className="text-xs text-neutral-500">{q.price != null ? `${q.price} € HT` : ''}{q.showcase ? ' · vidéo spontanée' : ''}{q.toolVisits ? ` · outils : ${q.toolVisits}` : ''}</div></td>
                      <td className="pr-3 whitespace-nowrap">{q.sentAt ? formatDate(q.sentAt) : '—'}</td>
                      <td className="pr-3 whitespace-nowrap">{q.viewedAt ? <span className="text-green-700">{formatDate(q.viewedAt)}{q.views > 1 ? ` · ${q.views} fois` : ''}</span> : <span className="text-orange-700">jamais</span>}</td>
                      <td className="pr-3">{q.reminders || 0}</td>
                      <td className="pr-3"><span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>{q.status === 'declined' && q.declineReason ? <div className="text-xs text-neutral-500 max-w-[220px]">{q.declineReason}</div> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
