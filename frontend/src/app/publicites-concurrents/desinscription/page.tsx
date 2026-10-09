'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';

/** Lien « Ne plus rien recevoir » des emails de rapport du scan : la désinscription se fait à l'ouverture de la page */
function Unsubscribe() {
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!token) { setState({ ok: false, text: 'Lien incomplet.' }); return; }
    api.post('/ad-scans/unsubscribe', { token }).then(r => setState({ ok: true, text: r.data.message })).catch(e => setState({ ok: false, text: getErrorMessage(e) }));
  }, [token]);
  return (
    <Card className="p-8 text-center max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-neutral-900 mb-2">Rapports par email</h1>
      <p className="text-neutral-700">{state ? state.text : 'Un instant…'}</p>
      <p className="text-sm text-neutral-500 mt-4">Vous pouvez toujours consulter les publicités d&apos;une marque sur <Link href="/publicites-concurrents" className="underline">l&apos;outil de scan</Link>.</p>
    </Card>
  );
}

export default function ScanUnsubscribePage() {
  return <div className="min-h-screen bg-neutral-50 py-16 px-4"><Suspense fallback={null}><Unsubscribe /></Suspense></div>;
}
