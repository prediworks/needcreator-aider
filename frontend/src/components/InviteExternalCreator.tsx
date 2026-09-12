'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { UserPlus } from 'lucide-react';

/**
 * La marque invite un créateur qui n'est pas encore sur NeedCreator : il reçoit un lien d'inscription
 * et la campagne lui est ouverte dès son inscription. S'il a déjà un compte, invitation directe.
 */
export default function InviteExternalCreator({ campaignId }: { campaignId: string }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const invite = useMutation({
    mutationFn: async () => (await api.post(`/campaigns/${campaignId}/invite-external`, { email, name })).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 6000 }); setSent((s) => [...s, email]); setEmail(''); setName(''); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return (
    <Card className="p-6">
      <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><UserPlus className="w-4 h-4 text-primary-500" /> Inviter un créateur que vous connaissez</h3>
      <p className="text-sm text-neutral-600 mb-3">Il n&apos;est pas encore sur NeedCreator ? Il reçoit un email à votre nom avec un lien d&apos;inscription, et votre campagne lui est ouverte dès son profil créé. S&apos;il a déjà un compte, il est invité directement.</p>
      <div className="space-y-2">
        <Input label="Email du créateur" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.fr" />
        <Input label="Prénom (optionnel)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" className="w-full" onClick={() => invite.mutate()} isLoading={invite.isPending} disabled={!valid}>Envoyer l&apos;invitation</Button>
      </div>
      {sent.length > 0 && <p className="text-xs text-neutral-500 mt-2">Invité(s) : {sent.join(', ')}</p>}
    </Card>
  );
}
