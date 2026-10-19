'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { Users } from 'lucide-react';

const STATUS: Record<string, [string, string]> = {
  invited: ['Pas encore de réponse', 'bg-orange-50 text-orange-700'],
  answered: ['A répondu', 'bg-green-50 text-green-700'],
  not_registered: ['Pas encore inscrit', 'bg-neutral-100 text-neutral-600'],
};

/**
 * Créateurs invités sur la campagne (marque) : inscrits et extérieurs invités par email, où chacun en est, et une relance
 * possible tous les trois jours pour ceux qui n'ont pas répondu.
 */
export default function InvitedCreators({ campaignId, invited }: { campaignId: string; invited: any[] }) {
  const qc = useQueryClient();
  const remind = useMutation({
    mutationFn: async (body: { creatorId?: string; email?: string }) => (await api.post(`/campaigns/${campaignId}/invitations/remind`, body)).data,
    onSuccess: (d) => { toast.success(d.message); qc.invalidateQueries({ queryKey: ['campaign', campaignId] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  if (!invited?.length) return null;
  const answered = invited.filter((i) => i.status === 'answered').length;
  return (
    <Card className="p-6" data-testid="invited-creators">
      <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary-500" /> Créateurs invités ({invited.length})</h3>
      <p className="text-sm text-neutral-600 mb-3">{answered} sur {invited.length} ont répondu. Relance possible tous les trois jours pour ceux qui n&apos;ont pas répondu.</p>
      <ul className="divide-y divide-neutral-100">
        {invited.map((i) => {
          const [label, cls] = STATUS[i.status] || [i.status, 'bg-neutral-100 text-neutral-600'];
          const key = i.creatorId || i.email;
          return (
            <li key={key} className="py-2 flex items-center justify-between gap-3 flex-wrap text-sm">
              <div className="min-w-0">
                {i.kind === 'member'
                  ? <Link href={`/profile/${i.creatorId}`} className="font-medium text-neutral-900 hover:text-primary-600">{i.name || 'Créateur'}</Link>
                  : <span className="font-medium text-neutral-900">{i.name ? `${i.name} · ` : ''}{i.email}</span>}
                <div className="text-xs text-neutral-500">
                  invité le {formatDate(i.invitedAt)}{i.kind === 'member' && i.email ? ` · par email (${i.email}), inscrit depuis` : ''}{i.profilePending ? ' · profil en cours de validation' : ''}{i.remindedAt ? ` · relancé le ${formatDate(i.remindedAt)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${cls}`}>{label}</span>
                {i.status !== 'answered' && (
                  <Button size="sm" variant="outline" disabled={!i.canRemind} title={i.canRemind ? 'Renvoyer l\'invitation par email' : 'Déjà relancé il y a moins de trois jours'} isLoading={remind.isPending && (remind.variables?.creatorId === i.creatorId && remind.variables?.email === (i.kind === 'external' ? i.email : undefined))} onClick={() => remind.mutate(i.kind === 'member' ? { creatorId: i.creatorId } : { email: i.email })}>Relancer</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
