'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

export default function AcademyGuidePage() {
  const { slug } = useParams() as { slug: string };
  const { user } = useAuth();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { data, isLoading } = useQuery({ queryKey: ['academy'], queryFn: async () => (await api.get('/academy')).data, staleTime: 3600000 });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<any>(null);
  const submit = useMutation({
    mutationFn: async (payload: number[]) => (await api.post(`/auth/academy/${slug}/quiz`, { answers: payload })).data,
    onSuccess: async (d) => { setResult(d); await refreshUser(); if (d.passed) toast.success(d.trained ? `Guide réussi. Badge « Formé » obtenu !` : `Guide réussi (${d.score} %)`); else toast.error(`Score ${d.score} % : relisez le guide et réessayez.`); },
    onError: (e: any) => toast.error(getErrorMessage(e)),
  });
  if (isLoading || !data) return <Spinner />;
  const guide = data.guides.find((g: any) => g.slug === slug);
  if (!guide) return <div className="p-12 text-center text-neutral-600">Guide introuvable. <Link href="/academie" className="text-primary-600 underline">Retour à l&apos;académie</Link></div>;
  const complete = guide.quiz.every((_: any, i: number) => answers[i] !== undefined);
  const isCreator = user?.role === 'creator';
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/academie"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" /> Académie</Button></Link>
        <Card className="p-8 mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">{guide.title}</h1>
          <p className="text-neutral-600 mb-6">{guide.summary} · {guide.minutes} min de lecture</p>
          <div className="space-y-5">
            {guide.sections.map(([h, p]: [string, string]) => (
              <section key={h}>
                <h2 className="text-lg font-semibold text-neutral-900 mb-1">{h}</h2>
                <p className="text-neutral-700 leading-relaxed">{p}</p>
              </section>
            ))}
          </div>
        </Card>
        <Card className="p-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-1">Quiz</h2>
          <p className="text-sm text-neutral-600 mb-5">{guide.quiz.length} questions, {data.passScore} % pour valider le guide.{!isCreator && ' Réservé aux créateurs connectés.'}</p>
          <div className="space-y-5">
            {guide.quiz.map((q: any, i: number) => {
              const corr = result?.corrections?.[i];
              return (
                <div key={i}>
                  <div className="font-medium text-neutral-900 mb-2">{i + 1}. {q.q}</div>
                  <div className="space-y-1">
                    {q.options.map((o: string, j: number) => {
                      const chosen = answers[i] === j;
                      const state = corr ? (j === corr.correct ? 'good' : chosen ? 'bad' : '') : '';
                      return (
                        <label key={j} className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer ${state === 'good' ? 'border-green-400 bg-green-50' : state === 'bad' ? 'border-red-300 bg-red-50' : chosen ? 'border-primary-400 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="radio" name={`q${i}`} checked={chosen} disabled={!!result} onChange={() => setAnswers({ ...answers, [i]: j })} className="mt-0.5" />
                          <span>{o}</span>
                          {state === 'good' && <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto shrink-0" />}
                          {state === 'bad' && <XCircle className="w-4 h-4 text-red-500 ml-auto shrink-0" />}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            {!result ? (
              <Button onClick={() => submit.mutate(guide.quiz.map((_: any, i: number) => answers[i]))} isLoading={submit.isPending} disabled={!complete || !isCreator}>Valider mes réponses</Button>
            ) : (
              <>
                <span className={`font-semibold ${result.passed ? 'text-green-700' : 'text-orange-700'}`}>{result.correct}/{result.total} bonnes réponses ({result.score} %) {result.passed ? '· guide réussi' : '· à refaire'}</span>
                {!result.passed && <Button variant="outline" size="sm" onClick={() => { setResult(null); setAnswers({}); }}>Réessayer</Button>}
                <Link href="/academie"><Button size="sm">Guide suivant</Button></Link>
              </>
            )}
            {!complete && !result && <span className="text-xs text-orange-700">Il manque : {guide.quiz.length - Object.keys(answers).length} réponse(s).</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
