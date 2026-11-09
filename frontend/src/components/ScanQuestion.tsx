'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { readRef } from '@/lib/scanRef';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Turnstile, { turnstileEnabled } from '@/components/Turnstile';

/**
 * « Une question ? » sous un scan ou un audit : un humain répond, sans afficher d'adresse sur le site. Même envoi que la page Contact
 * (réglage « Adresse de réception du formulaire de contact », réponse directe à l'expéditeur) ; le message rappelle la page et, pour une
 * marque venue de l'email, sa fiche prospect.
 */
export default function ScanQuestion({ slug, pageName, audit = false }: { slug: string; pageName: string; audit?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const from = (user as any)?.email || email;
  const send = useMutation({
    mutationFn: async () => {
      const ref = readRef();
      const context = [`Page : ${window.location.origin}/publicites/${slug}${audit ? '?vue=audit' : ''}`, /^[a-f0-9]{24}$/i.test(ref) ? `Marque venue de l'email de prospection (fiche ${ref})` : ''].filter(Boolean).join('\n');
      const name = (user as any)?.profile?.companyName || (user as any)?.profile?.name || from.split('@')[0] || 'Visiteur';
      return (await api.post('/contact', { name: name.length >= 2 ? name : `${name} ·`, email: from, role: (user as any)?.role === 'creator' ? 'creator' : 'brand', subject: `Question sur ${audit ? 'l\'audit' : 'les publicités'} de ${pageName}`.slice(0, 150), message: `${message.trim()}\n\n${context}`, userId: (user as any)?._id || '', turnstileToken: token || '' })).data;
    },
    onSuccess: () => setSent(true),
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const missing = [!from && 'votre email', message.trim().length < 20 && 'un message de 20 caractères', turnstileEnabled && !token && 'la vérification anti-robot'].filter(Boolean);

  if (sent) return <Card className="p-4 text-sm text-neutral-700" data-testid="scan-question-sent">Message envoyé. Nous vous répondons par email.</Card>;
  return (
    <Card className="p-5" data-testid="scan-question">
      <div className="flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold text-neutral-900">Une question ?</div>
          <p className="text-sm text-neutral-600">Sur cette lecture, sur le prix d&apos;une vidéo ou sur la façon de travailler avec un créateur : posez-la, une personne de l&apos;équipe vous répond par email.</p>
          {!open ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)} data-testid="scan-question-open">Poser ma question</Button>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (!missing.length) send.mutate(); }}>
              {!(user as any)?.email && <Input label="Votre email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@votre-marque.fr" />}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1" htmlFor="scan-question-text">Votre question</label>
                <textarea id="scan-question-text" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={2000} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Par exemple : combien coûterait une vidéo témoignage pour notre sérum ?" />
              </div>
              <Turnstile onToken={setToken} />
              <div className="flex items-center gap-3 flex-wrap">
                <Button type="submit" size="sm" isLoading={send.isPending} disabled={missing.length > 0}>Envoyer</Button>
                {missing.length > 0 && <span className="text-xs text-neutral-500">{`Il manque : ${missing.join(', ')}.`}</span>}
              </div>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
