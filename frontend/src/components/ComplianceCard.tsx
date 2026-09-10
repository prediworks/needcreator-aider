'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@/components/ui/Card';
import { ShieldCheck, CheckCircle, AlertTriangle, XCircle, MinusCircle, Loader2 } from 'lucide-react';

const ICON: Record<string, any> = { ok: CheckCircle, warn: AlertTriangle, fail: XCircle, skip: MinusCircle };
const COLOR: Record<string, string> = { ok: 'text-green-600', warn: 'text-orange-500', fail: 'text-red-600', skip: 'text-neutral-400' };

/**
 * Score de conformité au brief, calculé automatiquement à la soumission (durée, format, résolution, son, mentions)
 */
export default function ComplianceCard({ delivery, role }: { delivery: any; role: 'brand' | 'creator' }) {
  const queryClient = useQueryClient();
  const c = delivery.compliance;
  const [showTranscript, setShowTranscript] = useState(false);

  // Rafraîchit pendant l'analyse
  useEffect(() => {
    if (c?.status !== 'pending') return;
    const t = setInterval(() => queryClient.invalidateQueries({ queryKey: ['delivery', delivery._id] }), 4000);
    return () => clearInterval(t);
  }, [c?.status, delivery._id, queryClient]);

  if (!c || c.status === 'none') return null;

  const score = c.score;
  const tone = score === null || score === undefined ? 'neutral' : score >= 80 ? 'green' : score >= 50 ? 'orange' : 'red';
  const badge = { green: 'bg-green-100 text-green-800', orange: 'bg-orange-100 text-orange-800', red: 'bg-red-100 text-red-800', neutral: 'bg-neutral-100 text-neutral-700' }[tone];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary-500" /> Conformité au brief</h2>
        {c.status === 'pending' ? (
          <span className="text-sm text-neutral-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</span>
        ) : score !== null && score !== undefined ? (
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${badge}`}>{score} / 100</span>
        ) : null}
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        {role === 'brand'
          ? 'Vérification automatique des points objectifs du brief. Elle vous aide à valider vite ; regardez toujours les vidéos.'
          : 'Ce que la marque verra avant de valider. Les points orange ou rouges méritent une explication dans votre message.'}
      </p>
      {c.status === 'unavailable' && <p className="text-sm text-orange-700">{c.summary}</p>}
      {c.status === 'done' && (
        <>
          <p className="text-sm text-neutral-800 mb-3">{c.summary}</p>
          <ul className="space-y-2">
            {(c.items || []).map((it: any, i: number) => {
              const Icon = ICON[it.status] || MinusCircle;
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${COLOR[it.status]}`} />
                  <div>
                    <span className="font-medium text-neutral-900">{it.label}</span>
                    {it.file && <span className="text-neutral-400"> · {it.file}</span>}
                    <div className="text-neutral-600">{it.detail}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          {c.transcript && (
            <div className="mt-4">
              <button type="button" className="text-sm text-primary-600 underline" onClick={() => setShowTranscript(!showTranscript)}>
                {showTranscript ? 'Masquer la transcription' : 'Voir la transcription'}
              </button>
              {showTranscript && <pre className="mt-2 text-xs text-neutral-700 whitespace-pre-wrap bg-neutral-50 rounded-lg p-3 max-h-64 overflow-auto">{c.transcript}</pre>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
