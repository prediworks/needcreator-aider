'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { adCount } from '@/lib/adCount';
import { REF_KEY, readRef, trackRef } from '@/lib/scanRef';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ScanTimeline } from '@/components/ScanTimeline';
import ScanReportSignup from '@/components/ScanReportSignup';

/**
 * Duel : les publicités de deux marques déjà lues, côte à côte. Des comptes seulement (nombre, durées, angles relevés), sans jugement ;
 * le détail et les exemples restent sur la page de chaque marque. La première marque est celle à qui la page s'adresse (souvent venue de
 * l'email de prospection, face au concurrent repéré) : c'est son audit que propose le PDF.
 */
type Side = { slug: string; pageName: string; totalActive: number; distinctActive: number | null; capped: boolean; oldestDays: number | null; over90Days: number; timeline: number[]; angles: { name: string; count: number; shared: boolean }[] };

export default function ScanDuel({ slug, other }: { slug: string; other: string }) {
  const { user, isAdmin, loading } = useAuth();
  const { data, error, isLoading } = useQuery({ queryKey: ['ad-scan-duel', slug, other], queryFn: async () => (await api.get(`/ad-scans/${slug}/duel/${other}`)).data as { a: Side; b: Side }, staleTime: 600000, retry: false });
  // Marque venue de l'email de prospection : la référence de sa fiche est gardée pour la session, la visite comptée une fois
  const [leadRef, setLeadRef] = useState('');
  const [tracked, setTracked] = useState(false);
  useEffect(() => {
    try {
      const ref = (new URLSearchParams(window.location.search).get('ref') || '').trim();
      if (/^[a-f0-9]{24}$/i.test(ref)) { sessionStorage.setItem(REF_KEY, ref); setLeadRef(ref); } else { const saved = readRef(); setLeadRef(saved.startsWith('devis:') ? '' : saved); }
    } catch { /* stockage indisponible */ }
  }, []);
  useEffect(() => { if (!leadRef || loading || tracked) return; setTracked(true); trackRef('visit', slug, isAdmin); }, [leadRef, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <p className="text-sm text-neutral-700 animate-pulse">Chargement de la comparaison…</p>;
  if (error || !data) return <Card className="p-6 text-sm text-neutral-700" data-testid="scan-duel-error">{error ? getErrorMessage(error) : 'Comparaison indisponible'} <Link href={`/publicites/${slug}`} className="underline text-primary-700">Revenir aux publicités</Link></Card>;
  const { a, b } = data;
  const scale = Math.max(a.oldestDays || 0, b.oldestDays || 0);
  const maxCount = Math.max(1, ...a.angles.map(x => x.count), ...b.angles.map(x => x.count));
  const onlyB = b.angles.filter(x => !x.shared).map(x => x.name);
  const onlyA = a.angles.filter(x => !x.shared).map(x => x.name);
  const signupHref = `/register?role=brand&next=${encodeURIComponent(`/publicites/${a.slug}?vue=audit`)}${leadRef ? `&lead=${leadRef}` : ''}`;
  const rows: { label: string; va: string; vb: string; na: number; nb: number }[] = [
    { label: 'Publicités différentes', va: adCount(a).main, vb: adCount(b).main, na: adCount(a).n, nb: adCount(b).n },
    { label: 'La plus ancienne', va: a.oldestDays != null ? `${a.oldestDays} j` : '—', vb: b.oldestDays != null ? `${b.oldestDays} j` : '—', na: a.oldestDays || 0, nb: b.oldestDays || 0 },
    { label: 'Depuis plus de 90 jours', va: String(a.over90Days), vb: String(b.over90Days), na: a.over90Days, nb: b.over90Days },
  ];
  const head = (s: Side) => <Link href={`/publicites/${s.slug}`} className="block text-base sm:text-xl font-bold text-neutral-900 truncate hover:underline" title={s.pageName}>{s.pageName}</Link>;
  const angles = (s: Side, rival: Side) => (
    <ul className="space-y-2.5">
      {s.angles.map((x, i) => (
        <li key={i} data-testid="scan-duel-angle">
          <div className="flex items-baseline justify-between gap-2 text-xs sm:text-sm"><span className="font-medium text-neutral-900 first-letter:uppercase">{x.name}</span><span className="text-neutral-500 shrink-0">{x.count}</span></div>
          <div className="mt-1 h-2 rounded-full bg-neutral-100"><div className={`h-2 rounded-full ${x.shared ? 'bg-neutral-400' : 'bg-primary-600'}`} style={{ width: `${Math.max(6, (x.count / maxCount) * 100)}%` }} /></div>
          {!x.shared && <div className="text-[11px] text-primary-700 mt-0.5">{`Pas relevé chez ${rival.pageName}`}</div>}
        </li>
      ))}
      {!s.angles.length && <li className="text-xs text-neutral-500">Lecture des angles pas encore disponible.</li>}
    </ul>
  );
  return (
    <div className="space-y-6" data-testid="scan-duel">
      <Card className="p-4 sm:p-6">
        <div className="text-xs font-medium text-primary-600">Publicités Meta actives en France, comparées</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mt-1"><span>{a.pageName}</span> <span className="text-neutral-400 font-normal">face à</span> <span>{b.pageName}</span></h1>

        <div className="grid grid-cols-2 gap-3 sm:gap-6 mt-5">
          {[a, b].map((s, col) => (
            <div key={s.slug} className={`rounded-xl border p-3 sm:p-4 min-w-0 ${col === 0 ? 'border-primary-200 bg-primary-50/40' : 'border-neutral-200 bg-white'}`}>
              {head(s)}
              <div className="mt-3 space-y-3">
                {rows.map((r) => { const v = col === 0 ? r.va : r.vb; const ahead = col === 0 ? r.na > r.nb : r.nb > r.na; return (
                  <div key={r.label}><div className="text-[11px] sm:text-xs text-neutral-600">{r.label}</div><div className={`text-xl sm:text-2xl font-bold ${ahead ? 'text-green-700' : 'text-neutral-900'}`}>{v}</div></div>
                ); })}
              </div>
              <div className="mt-4"><ScanTimeline days={s.timeline} compact scale={scale} /></div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-neutral-500">Une barre par publicité, d&apos;autant plus haute qu&apos;elle tourne depuis longtemps. Au-dessus du trait des 90 jours, en vert : une publicité maintenue trois mois est une publicité qui rapporte.</p>
      </Card>

      {(a.angles.length > 0 || b.angles.length > 0) && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-neutral-900">Les angles de leurs publicités</h2>
          {onlyB.length > 0 && <p className="text-sm text-neutral-800 mt-1" data-testid="scan-duel-gap">{`${b.pageName} utilise ${onlyB.length} angle${onlyB.length > 1 ? 's' : ''} que la lecture ne relève pas chez ${a.pageName} : ${onlyB.join(', ')}.`}</p>}
          {onlyA.length > 0 && <p className="text-sm text-neutral-600 mt-1">{`À l'inverse, ${a.pageName} en utilise ${onlyA.length} que ${b.pageName} n'a pas : ${onlyA.join(', ')}.`}</p>}
          <div className="grid grid-cols-2 gap-3 sm:gap-6 mt-4">
            <div className="min-w-0"><div className="text-xs font-medium text-neutral-500 mb-2 truncate">{a.pageName}</div>{angles(a, b)}</div>
            <div className="min-w-0"><div className="text-xs font-medium text-neutral-500 mb-2 truncate">{b.pageName}</div>{angles(b, a)}</div>
          </div>
          <p className="mt-4 text-[11px] text-neutral-500">Le chiffre est le nombre de publicités qui utilisent l&apos;angle. En couleur : un angle relevé chez une seule des deux marques.</p>
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-neutral-900">{`Et maintenant, pour ${a.pageName} ?`}</h2>
        <p className="text-sm text-neutral-700 mt-1">Un créateur vérifié tourne la version vidéo d&apos;un angle que vos publicités n&apos;utilisent pas encore. Le brief est préparé gratuitement, et le créateur n&apos;est payé qu&apos;après votre validation de la vidéo.</p>
        {user?.role !== 'creator' && !isAdmin && <ScanReportSignup slug={a.slug} pageName={a.pageName} audit signupHref={signupHref} />}
        <div className="mt-4 flex gap-3 flex-wrap">
          <Link href={`/publicites/${a.slug}?vue=audit`}><Button variant="outline" size="sm"><ClipboardCheck className="w-4 h-4 mr-1" /> <span>{`Voir l'audit de ${a.pageName}`}</span></Button></Link>
          <Link href={`/publicites/${b.slug}`}><Button variant="outline" size="sm"><span>{`Voir les publicités de ${b.pageName}`}</span> <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
        </div>
      </Card>
      <p className="text-xs text-neutral-500">Données publiques de la bibliothèque publicitaire Meta (transparence européenne). Constats comptés, sans jugement.</p>
    </div>
  );
}
