'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import { Send, X } from 'lucide-react';

/**
 * Bouton "Inviter sur une campagne" : choisit une campagne ouverte de la marque et envoie l'invitation
 */
export default function InviteCreatorButton({ creatorId, creatorName, size = 'md', className }: { creatorId: string; creatorName: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['campaigns', { status: 'active', forInvite: true }],
    queryFn: async () => (await api.get('/campaigns', { params: { status: 'active', limit: 50 } })).data,
    enabled: open && user?.role === 'brand',
  });

  const invite = useMutation({
    mutationFn: async () => (await api.post(`/campaigns/${campaignId}/invite/${creatorId}`, { message })).data,
    onSuccess: (d) => {
      toast.success(d.message);
      setOpen(false);
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  if (user?.role !== 'brand') return null;
  const campaigns: any[] = data?.campaigns || [];

  return (
    <>
      <Button size={size} className={className} onClick={() => setOpen(true)}>
        <Send className="w-4 h-4 mr-1" /> Inviter
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-900">Inviter {creatorName}</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-neutral-500 hover:text-neutral-800"><X className="w-5 h-5" /></button>
            </div>
            {campaigns.length === 0 ? (
              <div className="text-sm text-neutral-600">
                Vous n&apos;avez aucune campagne ouverte aux candidatures.{' '}
                <Link href="/campaigns/new" className="text-primary-600 underline">Créer une campagne</Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Campagne</label>
                  <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                    <option value="">Choisir…</option>
                    {campaigns.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Message (optionnel)</label>
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} placeholder="Bonjour, votre style correspond exactement à ce que nous cherchons…" className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
                </div>
                <p className="text-xs text-neutral-500">Le créateur reçoit un email avec le lien de la campagne et peut envoyer un devis, même pendant l&apos;avant-première.</p>
                <Button className="w-full" disabled={!campaignId} isLoading={invite.isPending} onClick={() => invite.mutate()}>
                  <Send className="w-4 h-4 mr-2" /> Envoyer l&apos;invitation
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
