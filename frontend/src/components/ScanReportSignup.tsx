'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Mail } from 'lucide-react';
import { detectLang } from '@/lib/i18n';

/**
 * Rapport du scan par email : une adresse, le rapport tout de suite, puis un email par semaine au plus quand la marque lance de nouvelles
 * publicités. Sans compte : la marche la plus basse pour garder le contact. Connecté : l'adresse du compte, sans question sur le rôle.
 * « Marque » ou « créateur » sert à ne jamais prospecter un créateur comme une marque. Créateur : son prénom (« Bonjour Julie ») ;
 * marque : son nom, pré-rempli avec la page lue (souvent la sienne), qui devient le nom de sa fiche de prospection.
 */
export default function ScanReportSignup({ slug, pageName, audit = false }: { slug: string; pageName: string; audit?: boolean }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'brand' | 'creator' | ''>('');
  const [firstName, setFirstName] = useState('');
  const [company, setCompany] = useState(pageName);
  const [done, setDone] = useState('');
  const subscribe = useMutation({
    mutationFn: async () => (await api.post(`/ad-scans/${slug}/subscribe`, { email: user?.email || email, role: user ? '' : role, firstName: !user && role === 'creator' ? firstName.trim() : '', company: !user && role === 'brand' ? company.trim() : '', lang: detectLang() })).data,
    onSuccess: () => { toast.success('Rapport envoyé', { duration: 6000 }); setDone(user?.email || email); }, // le détail est dans le cadre, traduisible
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  // Audit : la personne lit en général ses propres publicités, on lui parle d'elle (nom de la marque à part : le reste se traduit)
  if (done) return <Card className="p-4 text-sm text-neutral-700" data-testid="scan-report-done">Rapport envoyé à <strong>{done}</strong>. {audit ? <span>Vous serez prévenu quand vous lancerez de nouvelles publicités.</span> : <><span>Vous serez prévenu quand</span> {pageName} <span>lancera de nouvelles publicités.</span></>}</Card>;
  return (
    <Card className="p-5" data-testid="scan-report-signup">
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold text-neutral-900">{audit ? 'Recevoir le rapport de vos publicités par email' : 'Recevoir ce rapport par email'}</div>
          <p className="text-sm text-neutral-600 mb-3">{audit ? <>Le rapport de vos publicités tout de suite, puis un email par semaine au plus, seulement quand vous lancez de nouvelles publicités ou qu&apos;une des vôtres passe les 90 jours. Désinscription en un clic.</> : <>Le rapport complet tout de suite, puis un email par semaine au plus, seulement quand {pageName} lance de nouvelles publicités ou qu&apos;une passe les 90 jours. Désinscription en un clic.</>}</p>
          <form onSubmit={(e) => { e.preventDefault(); if (!user && !role) { toast.error('Dites-nous si vous êtes une marque ou un créateur'); return; } if (!user && role === 'creator' && !firstName.trim()) { toast.error('Indiquez votre prénom'); return; } if (!user && role === 'brand' && !company.trim()) { toast.error('Indiquez le nom de votre marque'); return; } subscribe.mutate(); }} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            {user ? <div className="text-sm text-neutral-700 sm:flex-1">À <strong>{user.email}</strong></div> : (
              <>
                <div className="sm:flex-1"><Input label="Votre email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@votre-marque.fr" /></div>
                <div className="flex gap-3 text-sm text-neutral-700 pb-2" data-testid="scan-report-role">
                  <label className="inline-flex items-center gap-1 cursor-pointer"><input type="radio" name="scan-role" checked={role === 'brand'} onChange={() => setRole('brand')} /> Je suis une marque</label>
                  <label className="inline-flex items-center gap-1 cursor-pointer"><input type="radio" name="scan-role" checked={role === 'creator'} onChange={() => setRole('creator')} /> Je suis créateur</label>
                </div>
                {role === 'brand' && <div className="sm:w-48" data-testid="scan-report-company"><Input label="Nom de votre marque" required value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} /></div>}
                {role === 'creator' && <div className="sm:w-40" data-testid="scan-report-firstname"><Input label="Votre prénom" required value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} /></div>}
              </>
            )}
            <Button type="submit" size="sm" isLoading={subscribe.isPending}>Recevoir le rapport</Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
