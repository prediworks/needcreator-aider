'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useRequireAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import Conversation from '@/components/Conversation';
import Badge from '@/components/ui/Badge';
import { CAMPAIGN_STATUS } from '@/lib/labels';
import { formatRelativeTime, cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';

function MessagesContent() {
  const { user, ready } = useRequireAuth({ roles: ['brand', 'creator'] });
  const searchParams = useSearchParams();
  const initialCampaign = searchParams.get('campaign');
  const initialCreator = searchParams.get('creator');
  const [selected, setSelected] = useState<{ campaignId: string; creatorId: string } | null>(
    initialCampaign ? { campaignId: initialCampaign, creatorId: initialCreator || '' } : null
  );

  const { data, isLoading } = useQuery({
    queryKey: ['messages', 'list'],
    queryFn: async () => (await api.get('/messages')).data,
    enabled: ready,
    refetchInterval: 20000,
  });

  if (!ready) return <Spinner />;

  const conversations: any[] = data?.conversations || [];
  const isBrand = user?.role === 'brand';
  const current = selected && conversations.find((c) => String(c.campaignId?._id) === selected.campaignId && (!isBrand || String(c.creatorId?._id) === selected.creatorId));

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 mb-1">Messages</h1>
          <p className="text-neutral-600">Vos discussions par campagne{data?.totalUnread ? ` · ${data.totalUnread} non lu(s)` : ''}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="p-2 lg:col-span-1 max-h-[70vh] overflow-y-auto">
            {isLoading ? <Spinner fullScreen={false} /> : conversations.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 px-4">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                <p className="text-sm">Aucune discussion. Elles s&apos;ouvrent depuis une campagne, après une candidature ou une invitation.</p>
              </div>
            ) : (
              conversations.map((c) => {
                const active = selected && String(c.campaignId?._id) === selected.campaignId && (!isBrand || String(c.creatorId?._id) === selected.creatorId);
                const other = isBrand ? c.creatorId?.profile?.name : c.brandId?.profile?.companyName;
                return (
                  <button
                    key={c._id}
                    onClick={() => setSelected({ campaignId: String(c.campaignId?._id), creatorId: String(c.creatorId?._id) })}
                    className={cn('w-full text-left px-3 py-3 rounded-lg hover:bg-neutral-50 transition border-b border-neutral-100 last:border-0', active && 'bg-primary-50')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900 truncate">{other || '—'}</span>
                      {c.unreadCount > 0 && <span className="text-xs bg-primary-500 text-white rounded-full px-2 py-0.5">{c.unreadCount}</span>}
                    </div>
                    <div className="text-xs text-neutral-500 truncate">{c.campaignId?.title}</div>
                    <div className="text-xs text-neutral-600 truncate mt-1">{c.lastMessagePreview || 'Nouvelle discussion'}</div>
                    <div className="text-[10px] text-neutral-400">{c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : ''}</div>
                  </button>
                );
              })
            )}
          </Card>

          <Card className="p-6 lg:col-span-2">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-neutral-900">{isBrand ? current?.creatorId?.profile?.name : current?.brandId?.profile?.companyName}</h2>
                    <Link href={`/campaigns/${selected.campaignId}`} className="text-sm text-primary-600 hover:underline">{current?.campaignId?.title || 'Voir la campagne'}</Link>
                  </div>
                  {current?.campaignId?.status && <Badge map={CAMPAIGN_STATUS} value={current.campaignId.status} />}
                </div>
                <Conversation campaignId={selected.campaignId} creatorId={selected.creatorId} />
              </>
            ) : (
              <div className="text-center py-20 text-neutral-500">Sélectionnez une discussion</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MessagesContent />
    </Suspense>
  );
}
