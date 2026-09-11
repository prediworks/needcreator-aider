'use client';

import { useState, useEffect } from 'react';
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

  // Pendant la résolution de la session : un visiteur voit tout de suite le menu public ; un utilisateur connu
  // (indice mémorisé dans le navigateur) voit tout de suite le menu connecté. Plus de menu qui change après coup.
  const [knownUser, setKnownUser] = useState(false);
  useEffect(() => {
    try { setKnownUser(localStorage.getItem('nc_auth') === '1'); } catch {}
  }, []);
  useEffect(() => {
    if (loading) return;
    try { localStorage.setItem('nc_auth', isAuthenticated ? '1' : '0'); } catch {}
  }, [loading, isAuthenticated]);
  const connected = loading ? knownUser : isAuthenticated;

  const links = connected
    ? [
        { href: '/dashboard', label: 'Tableau de bord' },
        { href: '/campaigns', label: 'Campagnes' },
        { href: '/deliveries', label: user?.role === 'creator' ? 'Missions' : 'Livraisons' },
        ...(user?.role === 'brand' || user?.role === 'creator' ? [{ href: '/messages', label: unreadCount ? `Messages (${unreadCount})` : 'Messages' }] : []),
        ...(user?.role === 'brand' || user?.role === 'admin' ? [{ href: '/creators', label: 'Créateurs' }] : []),
        ...(user?.role === 'creator' ? [{ href: '/earnings', label: 'Mes revenus' }, { href: '/profile#portfolio', label: 'Mon portfolio' }] : []),
        ...(user?.role === 'admin' ? [{ href: '/admin', label: 'Administration' }] : []),
      ]
    : [
        { href: '/marques', label: 'Marques' },
        { href: '/createurs', label: 'Créateurs' },
        { href: '/how-it-works', label: 'Comment ça marche' },
        { href: '/nos-createurs', label: 'Nos créateurs' },
        { href: '/annuaire-createurs', label: 'Annuaire' },
        { href: '/pricing', label: 'Tarifs' },
      ];

  const navLink = (l: { href: string; label: string }) => (
    <Link
      key={l.href}
      href={l.href}
      onClick={() => setOpen(false)}
      className={cn(
        'text-neutral-700 hover:text-primary-600 transition whitespace-nowrap',
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
          <Link href="/" className="flex items-center gap-2 shrink-0 mr-6 lg:mr-10">
            <img src="/icon.svg" alt="" width={32} height={32} className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-bold text-neutral-900 whitespace-nowrap">NeedCreator</span>
          </Link>

          {/* Navigation desktop (à partir de lg : en dessous, le menu hamburger évite tout chevauchement) */}
          <nav className="hidden lg:flex items-center gap-x-4 xl:gap-x-7 flex-1 min-w-0 text-[15px] xl:text-base">
            {links.map(navLink)}
          </nav>

          {/* Actions */}
          <div className="hidden lg:flex items-center gap-x-2 xl:gap-x-3 shrink-0 ml-4">
            {loading && knownUser ? null : connected ? (
              <>
                <Link href="/profile" title="Mon profil">
                  <Button variant="ghost" size="sm" aria-label="Mon profil">
                    <User className="w-4 h-4 xl:mr-2" />
                    <span className="hidden xl:inline max-w-[160px] truncate">{user?.profile?.companyName || user?.profile?.name}</span>
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Déconnexion" title="Déconnexion">
                  <LogOut className="w-4 h-4 xl:mr-2" />
                  <span className="hidden xl:inline">Déconnexion</span>
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
          <button className="lg:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden pb-4 flex flex-col space-y-3 border-t border-neutral-100 pt-3">
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
