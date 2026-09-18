'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import Turnstile, { turnstileEnabled } from '@/components/Turnstile';
import { CheckCircle, Send } from 'lucide-react';

/** Formulaire « Nous contacter » : envoi vers l'adresse réglée dans l'admin (Réglages → Site public) */
export default function ContactForm() {
  const { user } = useAuth();
  const [f, setF] = useState({ name: '', email: '', role: 'other', subject: '', message: '', website: '' });
  const [token, setToken] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [sent, setSent] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Utilisateur connecté : nom, email et profil pré-remplis
  useEffect(() => {
    if (!user) return;
    const u: any = user;
    setF((p) => ({ ...p, name: p.name || u.profile?.companyName || u.profile?.name || '', email: p.email || u.email || '', role: u.role === 'brand' ? 'brand' : u.role === 'creator' ? 'creator' : p.role }));
  }, [user]);

  const send = useMutation({
    mutationFn: async () => (await api.post('/contact', { ...f, userId: (user as any)?.id || (user as any)?._id || '', turnstileToken: token || '' })).data,
    onSuccess: () => setSent(true),
    onError: (e) => { toast.error(getErrorMessage(e)); setToken(null); setReset((r) => r + 1); },
  });

  const missing = [
    f.name.trim().length < 2 && 'votre nom',
    !/^\S+@\S+\.\S+$/.test(f.email.trim()) && 'un email valide',
    f.subject.trim().length < 3 && 'un sujet',
    f.message.trim().length < 20 && `un message (encore ${Math.max(0, 20 - f.message.trim().length)} caractères)`,
    turnstileEnabled && !token && 'la vérification anti-robot',
  ].filter(Boolean) as string[];

  if (sent) return (
    <Card className="p-8 text-center" data-testid="contact-sent">
      <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
      <h2 className="text-xl font-semibold text-neutral-900 mb-1">Message envoyé</h2>
      <p className="text-neutral-600 mb-4">Merci, nous vous répondons sous deux jours ouvrés à {f.email}. Un accusé de réception vient de vous être envoyé.</p>
      <Link href="/"><Button variant="outline">Retour à l&apos;accueil</Button></Link>
    </Card>
  );

  return (
    <Card className="p-6">
      <form onSubmit={(e) => { e.preventDefault(); if (!missing.length) send.mutate(); }} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Votre nom" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" data-testid="contact-name" />
          <Input label="Votre email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" data-testid="contact-email" />
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Vous êtes</label>
            <select value={f.role} onChange={(e) => set('role', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm">
              <option value="brand">Une marque</option><option value="creator">Un créateur</option><option value="other">Autre</option>
            </select>
          </div>
          <div className="sm:col-span-2"><Input label="Sujet" value={f.subject} onChange={(e) => set('subject', e.target.value)} maxLength={150} data-testid="contact-subject" /></div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Message</label>
          <textarea value={f.message} onChange={(e) => set('message', e.target.value)} rows={7} maxLength={4000} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder="Décrivez votre demande. Pour une mission ou une campagne précise, indiquez son nom." data-testid="contact-message" />
        </div>
        {/* Piège à robots : invisible et hors tabulation, doit rester vide */}
        <input type="text" name="website" value={f.website} onChange={(e) => set('website', e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <Turnstile onToken={setToken} resetKey={reset} />
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="submit" isLoading={send.isPending} disabled={missing.length > 0} data-testid="contact-submit"><Send className="w-4 h-4 mr-2" /> Envoyer</Button>
          <MissingHint items={missing} />
        </div>
        <p className="text-xs text-neutral-500">Vos informations servent uniquement à répondre à votre demande. Voir notre <Link href="/legal/confidentialite" className="underline">politique de confidentialité</Link>.</p>
      </form>
    </Card>
  );
}
