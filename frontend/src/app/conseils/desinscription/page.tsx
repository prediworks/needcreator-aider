'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';

/** Lien « Ne plus recevoir les conseils » des emails hebdomadaires aux inscrits : la désinscription se fait à l'ouverture de la page */
function Unsubscribe() {
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!token) { setState({ ok: false, text: 'Lien incomplet.' }); return; }
    api.post('/ad-scans/unsubscribe-tips', { token }).then(r => setState({ ok: true, text: r.data.message })).catch(e => setState({ ok: false, text: getErrorMessage(e) }));
  }, [token]);
  return (
    <Card className="p-8 text-center max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-neutral-900 mb-2">Conseils hebdomadaires</h1>
      <p className="text-neutral-700">{state ? state.text : 'Un instant…'}</p>
      <p className="text-sm text-neutral-500 mt-4">Les notifications de vos missions, devis et messages continuent. Pour recevoir à nouveau les conseils, écrivez-nous depuis la page Contact.</p>
    </Card>
  );
}

export default function TipsUnsubscribePage() {
  return <div className="min-h-screen bg-neutral-50 py-16 px-4"><Suspense fallback={null}><Unsubscribe /></Suspense></div>;
}
