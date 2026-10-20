'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/**
 * « Demander un devis » sans compte, sur la page publique d'un créateur : entreprise, email, le besoin. Le créateur répond par un devis ;
 * la marque ne crée un compte que si elle l'accepte.
 */
export default function QuoteRequestForm({ creatorId, creatorName }: { creatorId: string; creatorName: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ company: '', contactName: '', email: '', need: '', budget: '', website: '', website2: '' });
  const [sent, setSent] = useState('');
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const send = useMutation({
    mutationFn: async () => (await api.post(`/creators/${creatorId}/quote-request`, f)).data,
    onSuccess: (d) => { setSent(d.message); toast.success(d.message, { duration: 8000 }); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const first = creatorName.split(' ')[0];
  if (sent) return <p className="text-sm text-green-700 max-w-[260px]" data-testid="quote-request-sent">{sent}</p>;
  if (!open) return <Button className="w-full" onClick={() => setOpen(true)} data-testid="quote-request-open">Demander un devis</Button>;
  return (
    <form className="w-full sm:w-80 space-y-2 text-left" onSubmit={(e) => { e.preventDefault(); send.mutate(); }} data-testid="quote-request-form">
      <Input label="Entreprise ou marque" required value={f.company} onChange={(e) => set('company', e.target.value)} maxLength={120} />
      <Input label="Votre nom" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={120} />
      <Input label="Votre email" type="email" required value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="prenom@marque.fr" />
      <label className="block text-sm font-medium text-neutral-700">Votre besoin
        <textarea required value={f.need} onChange={(e) => set('need', e.target.value)} rows={4} maxLength={1500} placeholder="Le produit, le nombre de vidéos, où elles seront diffusées, la date souhaitée" className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-normal" />
      </label>
      <Input label="Budget (facultatif)" value={f.budget} onChange={(e) => set('budget', e.target.value)} maxLength={60} placeholder="ex. 300 €" />
      {/* Champ caché : les robots le remplissent, pas les personnes */}
      <input type="text" name="website2" value={f.website2} onChange={(e) => set('website2', e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <Button type="submit" className="w-full" isLoading={send.isPending}>Envoyer la demande à {first}</Button>
      <p className="text-xs text-neutral-500">Sans compte. {first} vous répond par email avec un devis et un projet de contrat ; vous ne créez un compte que si vous l&apos;acceptez.</p>
    </form>
  );
}
