'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Bell } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

/**
 * Cloche de notifications : compteur non lu, liste des 20 dernières, tout marqué lu à l'ouverture.
 */
export default function NotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications', { params: { limit: 20 } })).data,
    enabled,
    refetchInterval: 30000,
  });
  const markRead = useMutation({
    mutationFn: async () => (await api.post('/notifications/read', {})).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread: number = data?.unread || 0;
  const items: any[] = data?.notifications || [];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!enabled) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markRead.mutate();
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={toggle} aria-label={unread ? `Notifications (${unread} non lues)` : 'Notifications'} className="relative p-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition">
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-lg z-50">
          <div className="px-4 py-3 border-b border-neutral-100 font-semibold text-neutral-900 text-sm">Notifications</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500 text-center">Rien pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {items.map((n) => {
                const inner = (
                  <div className={`px-4 py-3 text-sm ${!n.readAt ? 'bg-primary-50/50' : ''}`}>
                    <div className="font-medium text-neutral-900">{n.title}</div>
                    {n.text && <div className="text-neutral-600 text-xs mt-0.5 line-clamp-2">{n.text}</div>}
                    <div className="text-[11px] text-neutral-400 mt-1">{formatRelativeTime(n.createdAt)}</div>
                  </div>
                );
                return (
                  <li key={n._id}>
                    {n.href ? <Link href={n.href} onClick={() => setOpen(false)} className="block hover:bg-neutral-50">{inner}</Link> : inner}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
