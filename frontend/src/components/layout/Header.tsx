'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import Button from '@/components/ui/Button';
import { User, LogOut, LayoutDashboard } from 'lucide-react';

export default function Header() {
  const { user, isAuthenticated } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/';
  };

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg"></div>
            <span className="text-xl font-bold text-neutral-900">UGC Platform</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="text-neutral-700 hover:text-primary-500 transition">
                  Dashboard
                </Link>
                <Link href="/campaigns" className="text-neutral-700 hover:text-primary-500 transition">
                  Campagnes
                </Link>
                {user?.role === 'creator' && (
                  <Link href="/portfolio" className="text-neutral-700 hover:text-primary-500 transition">
                    Portfolio
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link href="/how-it-works" className="text-neutral-700 hover:text-primary-500 transition">
                  Comment ça marche
                </Link>
                <Link href="/pricing" className="text-neutral-700 hover:text-primary-500 transition">
                  Tarifs
                </Link>
              </>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="ghost" size="sm">
                    <User className="w-4 h-4 mr-2" />
                    {user?.profile.name}
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
                  <Button variant="ghost" size="sm">
                    Connexion
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="primary" size="sm">
                    S'inscrire
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
