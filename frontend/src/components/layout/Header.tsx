'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import Button from '@/components/ui/Button';
import { User, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Header() {
  const { user, isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: async () => (await api.get('/messages/unread')).data,
    enabled: isAuthenticated && (user?.role === 'brand' || user?.role === 'creator'),
    refetchInterval: 30000,
  });
  const unreadCount = unread?.totalUnread || 0;

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  const links = isAuthenticated
    ? [
        { href: '/dashboard', label: 'Tableau de bord' },
        { href: '/campaigns', label: 'Campagnes' },
        { href: '/deliveries', label: 'Livraisons' },
        ...(user?.role === 'brand' || user?.role === 'creator' ? [{ href: '/messages', label: unreadCount ? `Messages (${unreadCount})` : 'Messages' }] : []),
        ...(user?.role === 'brand' || user?.role === 'admin' ? [{ href: '/creators', label: 'Créateurs' }] : []),
        ...(user?.role === 'creator' ? [{ href: '/profile', label: 'Mon portfolio' }] : []),
        ...(user?.role === 'admin' ? [{ href: '/admin', label: 'Administration' }] : []),
      ]
    : [
        { href: '/how-it-works', label: 'Comment ça marche' },
        { href: '/pricing', label: 'Tarifs' },
      ];

  const navLink = (l: { href: string; label: string }) => (
    <Link
      key={l.href}
      href={l.href}
      onClick={() => setOpen(false)}
      className={cn(
        'text-neutral-700 hover:text-primary-600 transition',
        pathname === l.href && 'text-primary-600 font-medium'
      )}
    >
      {l.label}
    </Link>
  );

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg"></div>
            <span className="text-xl font-bold text-neutral-900">NeedCreator</span>
          </Link>

          {/* Navigation desktop */}
          <nav className="hidden md:flex items-center space-x-6">
            {links.map(navLink)}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center space-x-3">
            {loading ? null : isAuthenticated ? (
              <>
                <Link href="/profile">
                  <Button variant="ghost" size="sm">
                    <User className="w-4 h-4 mr-2" />
                    {user?.profile?.companyName || user?.profile?.name}
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Déconnexion
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">Connexion</Button>
                </Link>
                <Link href="/register">
                  <Button variant="primary" size="sm">S&apos;inscrire</Button>
                </Link>
              </>
            )}
          </div>

          {/* Menu mobile */}
          <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {open && (
          <div className="md:hidden pb-4 flex flex-col space-y-3 border-t border-neutral-100 pt-3">
            {links.map(navLink)}
            {isAuthenticated ? (
              <>
                <Link href="/profile" onClick={() => setOpen(false)} className="text-neutral-700">Mon profil</Link>
                <button onClick={handleLogout} className="text-left text-neutral-700">Déconnexion</button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)} className="text-neutral-700">Connexion</Link>
                <Link href="/register" onClick={() => setOpen(false)} className="text-primary-600 font-medium">S&apos;inscrire</Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
