'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Users, UserPlus, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

/**
 * Équipe marque : le propriétaire invite des collaborateurs qui agissent au nom de l'entreprise.
 * Un membre voit un simple rappel (il ne gère pas l'équipe).
 */
export default function TeamCard({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const isMember = !!profile.actor;
  const { data, isLoading } = useQuery({ queryKey: ['team'], queryFn: async () => (await api.get('/auth/team')).data, enabled: !isMember });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const invite = useMutation({
    mutationFn: async () => (await api.post('/auth/team/invite', { email, name })).data,
    onSuccess: (d) => { toast.success(d.message); setEmail(''); setName(''); queryClient.invalidateQueries({ queryKey: ['team'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/auth/team/members/${id}`)).data,
    onSuccess: (d) => { toast.success(d.message); queryClient.invalidateQueries({ queryKey: ['team'] }); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: async (mail: string) => (await api.delete(`/auth/team/invitations/${encodeURIComponent(mail)}`)).data,
    onSuccess: (d) => { toast.success(d.message); queryClient.invalidateQueries({ queryKey: ['team'] }); },
  });

  if (isMember) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-primary-500" /> Équipe</h2>
        <p className="text-sm text-neutral-600">Vous êtes connecté(e) en tant que <strong>{profile.actor.name || profile.actor.email}</strong>, membre de l&apos;équipe <strong>{profile.profile?.companyName}</strong>. Campagnes, missions et factures sont celles de l&apos;entreprise. La gestion de l&apos;équipe, des informations administratives et de l&apos;abonnement est réservée au propriétaire du compte.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-primary-500" /> Équipe</h2>
      <p className="text-sm text-neutral-600 mb-4">Invitez vos collaborateurs : chacun se connecte avec son propre accès et agit au nom de {profile.profile?.companyName}. Ils voient les mêmes campagnes, missions et factures, mais ne peuvent ni gérer l&apos;équipe, ni modifier les informations administratives, ni l&apos;abonnement.</p>
      {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : (
        <>
          {data?.members?.length ? (
            <ul className="divide-y divide-neutral-100 mb-4">
              {data.members.map((m: any) => (
                <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span><strong>{m.name || m.email}</strong> <span className="text-neutral-500">· {m.email} · depuis le {formatDate(m.joinedAt)}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Retirer ${m.name || m.email} de l'équipe ? Son compte devient indépendant.`)) remove.mutate(m.id); }} isLoading={remove.isPending}><Trash2 className="w-4 h-4" /></Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-500 mb-4">Aucun membre pour l&apos;instant.</p>}
          {data?.invitations?.length ? (
            <div className="mb-4">
              <div className="text-xs text-neutral-500 mb-1">Invitations en attente</div>
              <ul className="space-y-1 text-sm">
                {data.invitations.map((i: any) => (
                  <li key={i.email} className="flex items-center justify-between gap-3"><span>{i.name ? `${i.name} · ` : ''}{i.email} <span className="text-neutral-400">({formatDate(i.invitedAt)})</span></span><button type="button" className="text-xs text-neutral-500 underline" onClick={() => cancel.mutate(i.email)}>Annuler</button></li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <Input label="Email du collaborateur" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@entreprise.fr" />
            <Input label="Prénom (optionnel)" value={name} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" onClick={() => invite.mutate()} isLoading={invite.isPending} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}><UserPlus className="w-4 h-4 mr-1" /> Inviter</Button>
          </div>
        </>
      )}
    </Card>
  );
}
