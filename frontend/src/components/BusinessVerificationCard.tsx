'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';

/**
 * Vérification de l'entreprise (marque) : SIRET ou TVA + site web + email pro
 */
export default function BusinessVerificationCard({ profile }: { profile: any }) {
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const business = profile.verification?.business || { status: 'unverified' };
  const [siret, setSiret] = useState(profile.profile?.company?.siret || '');
  const [vat, setVat] = useState(profile.profile?.company?.vatNumber || '');
  const [website, setWebsite] = useState(profile.profile?.website || '');
  const [open, setOpen] = useState(business.status !== 'verified');

  const verify = useMutation({
    mutationFn: async () => (await api.post('/auth/business-verification', { siret: siret || undefined, vatNumber: vat || undefined, website: website || undefined })).data,
    onSuccess: async (d) => {
      if (d.business.status === 'verified') toast.success(d.message);
      else if (d.business.status === 'pending') toast.info(d.message, { duration: 8000 });
      else toast.error(`${d.message} : ${d.reasons.join(', ')}`, { duration: 8000 });
      await refreshUser();
      if (d.business.status === 'verified') setOpen(false);
    },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  const badge = {
    verified: { icon: ShieldCheck, cls: 'text-green-700 bg-green-50 border-green-200', label: 'Entreprise vérifiée' },
    pending: { icon: Clock, cls: 'text-orange-700 bg-orange-50 border-orange-200', label: 'Vérification manuelle en cours (sous 24 h)' },
    rejected: { icon: ShieldAlert, cls: 'text-red-700 bg-red-50 border-red-200', label: 'Vérification refusée' },
    unverified: { icon: ShieldAlert, cls: 'text-orange-700 bg-orange-50 border-orange-200', label: 'Entreprise non vérifiée : vous ne pouvez pas encore publier de campagne' },
  }[business.status as string] || { icon: ShieldAlert, cls: '', label: '' };
  const Icon = badge.icon;

  return (
    <Card className={`p-6 border ${business.status !== 'verified' ? 'border-orange-200' : ''}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary-500" /> Vérification de l&apos;entreprise</h2>
        {business.status === 'verified' && !open && <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Modifier</Button>}
      </div>
      <div className={`text-sm rounded-lg border p-3 flex items-center gap-2 mb-3 ${badge.cls}`}><Icon className="w-4 h-4" /> {badge.label}{business.note && business.status !== 'verified' ? ` — ${business.note}` : ''}</div>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Indiquez votre SIRET ou votre numéro de TVA intracommunautaire. Avec un site web et un email professionnel, la vérification est immédiate ; sinon notre équipe contrôle sous 24 h.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="SIRET (14 chiffres)" value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="732 829 320 00074" />
            <Input label="ou numéro de TVA" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="FR40303265045" />
          </div>
          <Input label="Site web" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://votre-site.fr" />
          <Button onClick={() => verify.mutate()} isLoading={verify.isPending} disabled={!siret && !vat}>Vérifier mon entreprise</Button>
        </div>
      )}
    </Card>
  );
}
