'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth';
import api, { getErrorMessage } from '@/lib/api';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';

/**
 * Demande l'acceptation de la nouvelle version des CGU aux utilisateurs déjà inscrits.
 */
export default function TermsBanner() {
  const { user } = useAuth();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [loading, setLoading] = useState(false);

  if (!user || (user as any).legalUpToDate !== false) return null;

  const accept = async () => {
    setLoading(true);
    try {
      await api.post('/auth/accept-terms');
      await refreshUser();
      toast.success('Merci, votre acceptation a été enregistrée.');
    } catch (e) {
      toast.error(getErrorMessage(e, 'Impossible d\'enregistrer votre acceptation'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-primary-50 border-b border-primary-200">
      <div className="container mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 text-sm text-neutral-800">
        <p className="flex-1">
          Nos <Link href="/legal/cgu" className="underline font-medium">conditions générales d&apos;utilisation</Link> et notre{' '}
          <Link href="/legal/confidentialite" className="underline font-medium">politique de confidentialité</Link> ont été mises à jour.
          Merci de les accepter pour continuer.
        </p>
        <Button size="sm" onClick={accept} isLoading={loading}>J&apos;accepte</Button>
      </div>
    </div>
  );
}
