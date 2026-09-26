'use client';

import { useEffect, useState } from 'react';
import { detectLang, writeLangCookie, type Lang } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

/** FR / EN dans l'en-tête : cookie + préférence du compte, puis rechargement pour appliquer partout */
export default function LangToggle({ className = '' }: { className?: string }) {
  const { isAuthenticated } = useAuth();
  const [lang, setLang] = useState<Lang>('fr');
  useEffect(() => { setLang(detectLang()); }, []);
  const choose = async (l: Lang) => {
    if (l === lang) return;
    writeLangCookie(l);
    if (isAuthenticated) { try { await api.patch('/auth/profile', { preferences: { language: l } }); } catch { /* préférence non enregistrée : le cookie suffit */ } }
    window.location.reload();
  };
  return (
    <div className={`inline-flex items-center rounded-lg border border-neutral-200 text-xs overflow-hidden ${className}`} role="group" aria-label="Langue">
      {(['fr', 'en'] as Lang[]).map((l) => <button key={l} type="button" onClick={() => choose(l)} className={`px-2 py-1 ${lang === l ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`} aria-pressed={lang === l} data-testid={`lang-${l}`}>{l.toUpperCase()}</button>)}
    </div>
  );
}
