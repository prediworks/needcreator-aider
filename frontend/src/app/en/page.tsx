'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { writeLangCookie } from '@/lib/i18n';

/** Entrée anglaise à partager (needcreator.com/en) : mémorise l'anglais et ouvre la page marques */
export default function EnglishEntry() {
  const router = useRouter();
  useEffect(() => { writeLangCookie('en'); router.replace('/marques'); }, [router]);
  return <div className="min-h-[40vh] flex items-center justify-center text-neutral-500 text-sm">Loading NeedCreator in English…</div>;
}
