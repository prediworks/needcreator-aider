'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { Send, MessageCircle } from 'lucide-react';
import ReportButton from '@/components/ReportButton';
import { formatRelativeTime, cn } from '@/lib/utils';

interface ConversationProps {
  campaignId: string;
  creatorId?: string; // requis côté marque
  title?: string;
  compact?: boolean;
}

/**
 * Fil de discussion marque ↔ créateur sur une campagne (rafraîchi toutes les 15 s)
 */
export default function Conversation({ campaignId, creatorId, title, compact = false }: ConversationProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const path = user?.role === 'brand' ? `/messages/campaign/${campaignId}/creator/${creatorId}` : `/messages/campaign/${campaignId}`;

  const { data, isLoading, error } = useQuery({
    queryKey: ['conversation', campaignId, user?.role === 'brand' ? creatorId : 'me'],
    queryFn: async () => (await api.get(path)).data.conversation,
    enabled: !!user && (user.role !== 'brand' || !!creatorId),
    refetchInterval: 15000,
  });

  const send = useMutation({
    mutationFn: async (t: string) => (await api.post(path, { text: t })).data,
    onSuccess: (d) => {
      setText('');
      if (d?.masked) toast.info('Les coordonnées (email, téléphone) sont masquées tant que le créateur n\'est pas sélectionné.');
      queryClient.invalidateQueries({ queryKey: ['conversation', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });

  const messages: any[] = data?.messages || [];
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  if (isLoading) return <Spinner fullScreen={false} />;
  if (error) return <p className="text-sm text-neutral-500">{getErrorMessage(error, 'Discussion indisponible')}</p>;

  const myId = user?.id || user?._id;
  const other = user?.role === 'brand' ? data?.creatorId?.profile?.name : data?.brandId?.profile?.companyName;

  return (
    <div className="flex flex-col">
      {title !== undefined && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary-500" />
            <h3 className="font-semibold text-neutral-900">{title || `Discussion avec ${other || ''}`}</h3>
          </div>
          {(user?.role === 'brand' ? data?.creatorId?._id : data?.brandId?._id) && (
            <ReportButton targetType="user" targetId={String(user?.role === 'brand' ? data?.creatorId?._id : data?.brandId?._id)} />
          )}
        </div>
      )}
      <div className={cn('overflow-y-auto space-y-2 bg-neutral-50 rounded-lg p-3 border border-neutral-100', compact ? 'max-h-64' : 'max-h-[28rem] min-h-[12rem]')}>
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-6">
            Aucun message. {user?.role === 'creator' ? 'Posez vos questions sur le brief ou négociez votre devis.' : 'Posez vos questions au créateur ou proposez un ajustement de devis.'}
          </p>
        ) : (
          messages.map((m: any) => {
            const mine = String(m.senderId) === String(myId);
            return (
              <div key={m._id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line', mine ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm')}>
                  {m.text}
                  <div className={cn('text-[10px] mt-1', mine ? 'text-primary-100' : 'text-neutral-400')}>{formatRelativeTime(m.createdAt)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); } }}
          rows={2}
          maxLength={4000}
          placeholder="Écrire un message… (Entrée pour envoyer)"
          className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Button type="submit" isLoading={send.isPending} disabled={!text.trim()}><Send className="w-4 h-4" /></Button>
      </form>
    </div>
  );
}
