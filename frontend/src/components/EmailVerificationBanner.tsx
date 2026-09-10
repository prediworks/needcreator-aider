'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';

/**
 * Rappelle de confirmer l'adresse email (obligatoire pour publier une campagne ou envoyer un devis).
 */
export default function EmailVerificationBanner() {
  const { firebaseUser, user } = useAuth();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  const isVerified = verified ?? firebaseUser?.emailVerified ?? true;
  if (!firebaseUser || !user || isVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      const { data } = await api.post('/auth/send-verification');
      if (data.verified) { setVerified(true); toast.success('Adresse déjà confirmée.'); return; }
      toast.success('Email de confirmation envoyé. Pensez à vérifier vos spams.');
    } catch (e: any) {
      toast.error(getErrorMessage(e, 'Envoi impossible pour le moment'), { duration: 8000 });
    } finally {
      setSending(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);
      const ok = !!auth.currentUser?.emailVerified;
      setVerified(ok);
      if (ok) toast.success('Adresse email confirmée, merci !');
      else toast.info('Pas encore confirmée : cliquez sur le lien reçu par email, puis réessayez.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-yellow-50 border-b border-yellow-200">
      <div className="container mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-yellow-900">
        <p className="flex-1">
          <strong>Confirmez votre adresse email</strong> ({firebaseUser.email}) : un lien vous a été envoyé. Sans confirmation, vous ne pourrez pas
          {user.role === 'brand' ? ' publier de campagne' : ' envoyer de devis'}.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={resend} isLoading={sending}>Renvoyer l&apos;email</Button>
          <Button size="sm" onClick={check} isLoading={checking}>J&apos;ai confirmé</Button>
        </div>
      </div>
    </div>
  );
}
