'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import Conversation from '@/components/Conversation';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/lib/utils';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Messages de la mission, repliés : dernier message, date, non-lus. Dépliés automatiquement s'il y a des non-lus.
 * Même discussion que sur la campagne et dans le menu Messages.
 */
export default function MissionMessages({ campaignId, creatorId, otherName }: { campaignId: string; creatorId?: string; otherName?: string }) {
  const { user } = useAuth();
  const isBrand = user?.role === 'brand';
  const { data } = useQuery({ queryKey: ['conversations-list'], queryFn: async () => (await api.get('/messages')).data, enabled: !!user, refetchInterval: 30000 });
  const conv = (data?.conversations || []).find((c: any) => String(c.campaignId?._id || c.campaignId) === String(campaignId) && (!isBrand || String(c.creatorId?._id || c.creatorId) === String(creatorId)));
  const unread = conv?.unreadCount || 0;
  const [open, setOpen] = useState(false);
  useEffect(() => { if (unread > 0) setOpen(true); }, [unread]);
  if (isBrand && !creatorId) return null;
  return (
    <Card className="p-4" id="messages">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 text-primary-500 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-neutral-900 text-sm flex items-center gap-2">Messages avec {otherName || (isBrand ? 'le créateur' : 'la marque')}{unread > 0 && <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs">{unread} non lu{unread > 1 ? 's' : ''}</span>}</div>
            {!open && (conv?.lastMessagePreview ? <div className="text-xs text-neutral-500 truncate">{conv.lastMessagePreview} · {conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ''}</div> : <div className="text-xs text-neutral-500">Aucun message pour l&apos;instant. Une question sur la mission ? Écrivez ici.</div>)}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />}
      </button>
      {open && <div className="mt-3"><Conversation campaignId={campaignId} creatorId={creatorId} compact /></div>}
    </Card>
  );
}
