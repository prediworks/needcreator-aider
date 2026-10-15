'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { isFreeEmail, emailDomain } from '@/lib/email';
import { COUNTRIES } from '@/lib/countries';
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react';


/**
 * Vérification de l'entreprise (marque) : SIRET ou TVA en France, numéro d'entreprise ou TVA ailleurs (site web facultatif) + email pro
 */
export default function BusinessVerificationCard({ profile }: { profile: any }) {
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const queryClient = useQueryClient();
  const business = profile.verification?.business || { status: 'unverified' };
  const [siret, setSiret] = useState(profile.profile?.company?.siret || '');
  const [vat, setVat] = useState(profile.profile?.company?.vatNumber || '');
  const [website, setWebsite] = useState(profile.profile?.website || '');
  const initialCountry = profile.profile?.company?.country || 'FR';
  const [country, setCountry] = useState(COUNTRIES.some(c => c.code === initialCountry) ? initialCountry : 'FR');
  const fr = country === 'FR';
  const [registrationNumber, setRegistrationNumber] = useState(profile.profile?.company?.registrationNumber || '');
  const [open, setOpen] = useState(business.status !== 'verified');
  const canSubmit = fr ? !!(siret || vat) : !!(vat || registrationNumber.trim().length >= 4);

  const verify = useMutation({
    mutationFn: async () => (await api.post('/auth/business-verification', {
      siret: fr && siret ? siret : undefined,
      vatNumber: vat ? vat : undefined,
      country,
      registrationNumber: !fr && registrationNumber ? registrationNumber : undefined,
      website: website || undefined,
    })).data,
    onSuccess: async (d) => {
      if (d.business.status === 'verified') toast.success(d.registry?.legalName ? `${d.message} : ${d.registry.legalName}` : d.message);
      else if (d.business.status === 'pending') toast.info(d.message, { duration: 8000 });
      else toast.error(`${d.message} : ${d.reasons.join(', ')}`, { duration: 8000 });
      await Promise.all([refreshUser(), queryClient.invalidateQueries({ queryKey: ['profile'] })]);
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
      {profile.profile?.company?.legalName && (
        <p className="text-sm text-neutral-700 mb-3">Registre des entreprises : <strong>{profile.profile.company.legalName}</strong>{profile.profile.company.registryAddress ? ` — ${profile.profile.company.registryAddress}` : ''}</p>
      )}
      {open && (
        <div className="space-y-3">
          <div>
            <label htmlFor="business-country" className="block text-sm font-medium text-neutral-700 mb-1">Où votre entreprise est-elle immatriculée ?</label>
            <select id="business-country" value={country} onChange={(e) => setCountry(e.target.value)} className="border border-neutral-300 rounded-lg px-3 py-2 text-sm" data-testid="business-country">
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          {fr ? <p className="text-sm text-neutral-600">Indiquez votre SIRET ou votre numéro de TVA intracommunautaire : il est contrôlé au registre national des entreprises.</p>
            : <p className="text-sm text-neutral-600">Indiquez le numéro de votre entreprise au registre de votre pays{country === 'BE' ? ' (BCE, 10 chiffres)' : ''}, ou votre numéro de TVA. Il est enregistré tel quel ; l&apos;email professionnel ou le site web confirme la vérification.</p>}
          {isFreeEmail(profile.email) ? (
            <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-3">Votre adresse <strong>{emailDomain(profile.email)}</strong> est une adresse grand public : sans site web, notre équipe contrôle votre entreprise manuellement sous 24 h. <strong>Ajoutez votre site web</strong> pour une vérification immédiate.</p>
          ) : (
            <p className="text-sm text-neutral-600">Votre adresse email est au nom de votre entreprise : la vérification est immédiate. Le site web est facultatif.</p>
          )}
          {fr ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label="SIRET (14 chiffres) ou SIREN (9 chiffres)" value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="732 829 320 00074" />
              <Input label="ou numéro de TVA" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="FR40303265045" />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <Input label={country === 'BE' ? "Numéro d'entreprise (BCE)" : "Numéro d'immatriculation"} value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder={country === 'BE' ? '0123.456.789' : 'Le numéro au registre de votre pays'} />
              <Input label="ou numéro de TVA" value={vat} onChange={(e) => setVat(e.target.value)} placeholder={country === 'BE' ? 'BE0123456789' : 'Votre numéro de TVA'} />
            </div>
          )}
          <Input label={isFreeEmail(profile.email) ? 'Site web (pour une vérification immédiate)' : 'Site web (facultatif)'} type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://votre-site.fr" />
          <Button onClick={() => verify.mutate()} isLoading={verify.isPending} disabled={!canSubmit}>Vérifier mon entreprise</Button>
          {!canSubmit && <p className="text-xs text-neutral-500">Il manque : {fr ? 'un SIRET ou un numéro de TVA' : 'un numéro d\'entreprise ou de TVA'}.</p>}
        </div>
      )}
    </Card>
  );
}
