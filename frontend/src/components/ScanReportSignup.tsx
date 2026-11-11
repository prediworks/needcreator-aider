'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FileDown, CheckCircle2 } from 'lucide-react';
import { detectLang } from '@/lib/i18n';
import { trackRef, readRef } from '@/lib/scanRef';

/**
 * L'action principale de la page d'un scan ou d'un audit : le rapport complet en PDF contre une adresse email. Une seule question, l'adresse ;
 * le PDF part tout de suite en pièce jointe, puis un email par semaine au plus quand la marque lance de nouvelles publicités. Sans compte :
 * c'est la marche la plus basse pour garder le contact, la création de compte est proposée ensuite.
 * Par défaut la personne est une marque (elle entre dans les contacts) ; « Je suis créateur » évite de prospecter un créateur comme une marque.
 * Sur un audit, la marque lit ses propres publicités : le nom de la page devient le nom de sa fiche ; sur un scan (souvent un concurrent),
 * le nom est déduit de son adresse.
 */
export default function ScanReportSignup({ slug, pageName, audit = false, signupHref = '' }: { slug: string; pageName: string; audit?: boolean; signupHref?: string }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [creator, setCreator] = useState(false);
  const [firstName, setFirstName] = useState('');
  // Marque venue de l'email de prospection (référence de sa fiche) : on sait déjà que c'est une marque, pas de question
  const [fromLead, setFromLead] = useState(false);
  useEffect(() => { if (/^[a-f0-9]{24}$/i.test(readRef())) setFromLead(true); }, []);
  const [done, setDone] = useState('');
  const subscribe = useMutation({
    mutationFn: async () => (await api.post(`/ad-scans/${slug}/subscribe`, { email: user?.email || email, role: user ? '' : creator ? 'creator' : 'brand', firstName: !user && creator ? firstName.trim() : '', company: !user && !creator && audit ? pageName : '', lang: detectLang(), view: audit ? 'audit' : 'scan' })).data,
    onSuccess: () => { setDone(user?.email || email); trackRef('email', slug, user?.role === 'admin'); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });

  if (done) return (
    <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-neutral-800" data-testid="scan-report-done">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-neutral-900">{creator ? 'Rapport envoyé' : 'PDF envoyé'}</div>
          <p>Regardez votre boîte : <strong>{done}</strong>. <span>S&apos;il n&apos;arrive pas dans deux minutes, vérifiez les courriers indésirables.</span></p>
          {!user && !creator && signupHref && <p className="mt-2"><span>Pour commander une de ces vidéos, le compte est gratuit :</span> <Link href={signupHref} className="underline text-primary-700 font-medium">Créer mon compte</Link></p>}
        </div>
      </div>
    </div>
  );
  return (
    <div className="mt-5 rounded-xl border border-primary-200 bg-primary-50 p-4 sm:p-5" data-testid="scan-report-signup">
      <div className="flex items-start gap-3">
        <FileDown className="w-6 h-6 text-primary-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-neutral-900">{audit ? 'Recevoir l\'audit complet en PDF' : 'Recevoir le rapport complet en PDF'}</div>
          <p className="text-sm text-neutral-700 mt-0.5">{audit ? 'Les angles que vous répétez, ceux que vous n\'utilisez pas, cinq accroches à tester et trois vidéos à commander avec leur prix. Gratuit, sans compte.' : 'Tous les angles avec un exemple, les accroches qui reviennent, les angles que personne n\'utilise et le prix d\'une vidéo créateur. Gratuit, sans compte.'}</p>
          <form onSubmit={(e) => { e.preventDefault(); if (!user && creator && !firstName.trim()) { toast.error('Indiquez votre prénom'); return; } subscribe.mutate(); }} className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
            {user ? <div className="text-sm text-neutral-700 sm:flex-1 sm:pb-2">À <strong>{user.email}</strong></div> : (
              <>
                <div className="sm:flex-1"><Input aria-label="Votre email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@votre-marque.fr" data-testid="scan-report-email" /></div>
                {creator && <div className="sm:w-40" data-testid="scan-report-firstname"><Input aria-label="Votre prénom" required value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} placeholder="Votre prénom" /></div>}
              </>
            )}
            <Button type="submit" isLoading={subscribe.isPending} data-testid="scan-report-submit">{creator ? 'Recevoir le rapport' : 'Recevoir le PDF'}</Button>
          </form>
          <p className="text-[11px] text-neutral-500 mt-2">
            <span>Ensuite, un email par semaine au plus, seulement quand de nouvelles publicités sortent. Désinscription en un clic.</span>
            {!user && !fromLead && <> <button type="button" className="underline" onClick={() => setCreator(v => !v)} data-testid="scan-report-role">{creator ? 'Je suis une marque' : 'Je suis créateur'}</button></>}
          </p>
        </div>
      </div>
    </div>
  );
}
