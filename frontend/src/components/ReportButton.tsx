'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Flag, X } from 'lucide-react';

export const REPORT_REASONS: Record<string, string> = {
  free_work: 'Demande de travail gratuit ou non conforme au devis',
  off_platform: 'Tentative de contournement de la plateforme (paiement ou contact hors NeedCreator)',
  scam: 'Arnaque ou fausse marque / faux créateur',
  inappropriate: 'Contenu inapproprié ou offensant',
  spam: 'Spam ou messages répétés',
  fake: 'Faux portfolio ou fausses statistiques',
  other: 'Autre',
};

/**
 * Signaler une campagne, un utilisateur, un message ou une livraison
 */
export default function ReportButton({ targetType, targetId, size = 'sm', label = 'Signaler' }: { targetType: 'campaign' | 'user' | 'message' | 'delivery'; targetId: string; size?: 'sm' | 'md'; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('free_work');
  const [details, setDetails] = useState('');

  const send = useMutation({
    mutationFn: async () => (await api.post('/reports', { targetType, targetId, reason, details })).data,
    onSuccess: (d) => { toast.success(d.message); setOpen(false); setDetails(''); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  return (
    <>
      <Button size={size} variant="ghost" className="text-neutral-500 hover:text-red-600" onClick={() => setOpen(true)}>
        <Flag className="w-4 h-4 mr-1" /> {label}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-neutral-900">Signaler un problème</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-neutral-500"><X className="w-5 h-5" /></button>
            </div>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm mb-3">
              {Object.entries(REPORT_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} placeholder="Précisez ce qui s'est passé (optionnel)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm mb-3" />
            <p className="text-xs text-neutral-500 mb-3">Notre équipe traite les signalements sous 24 h. Les abus répétés entraînent la suspension du compte.</p>
            <Button className="w-full" onClick={() => send.mutate()} isLoading={send.isPending}>Envoyer le signalement</Button>
          </div>
        </div>
      )}
    </>
  );
}
