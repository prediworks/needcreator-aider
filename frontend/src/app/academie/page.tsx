'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { GraduationCap, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

/**
 * Académie : guides courts + quiz. Réussir `required` guides donne le badge « Formé », visible par les marques.
 */
export default function AcademyPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['academy'], queryFn: async () => (await api.get('/academy')).data, staleTime: 3600000 });
  if (isLoading || !data) return <Spinner />;
  const done: Record<string, any> = Object.fromEntries(((user?.profile?.academy as any[]) || []).map((a) => [a.slug, a]));
  const passed = Object.values(done).filter((a: any) => a.passed).length;
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2 flex items-center gap-2"><GraduationCap className="w-7 h-7 text-primary-500" /> Académie</h1>
          <p className="text-neutral-600">Cinq guides de cinq minutes pour livrer des vidéos que les marques valident du premier coup. Chaque guide se termine par un quiz. {user?.role === 'creator' ? <>Réussissez-en {data.required} pour obtenir le badge <strong>Formé</strong>, visible par les marques et pris en compte dans le matching.</> : null}</p>
          {user?.role === 'creator' && (
            <div className="mt-3 text-sm bg-white border border-neutral-200 rounded-lg px-4 py-2 inline-flex items-center gap-2">
              <span className="font-medium">{passed}/{data.required} guides réussis</span>
              {passed >= data.required ? <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> badge Formé obtenu</span> : <span className="text-neutral-500">· badge Formé à {data.required}</span>}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {data.guides.map((g: any, i: number) => {
            const d = done[g.slug];
            return (
              <Card key={g.slug} className="p-5 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-7 h-7 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                    <h2 className="text-lg font-semibold text-neutral-900">{g.title}</h2>
                    {d?.passed && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> réussi ({d.score} %)</span>}
                    {d && !d.passed && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">dernier score {d.score} %</span>}
                  </div>
                  <p className="text-sm text-neutral-600 mt-1">{g.summary}</p>
                  <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {g.minutes} min · quiz de {g.quiz.length} questions</p>
                </div>
                <Link href={`/academie/${g.slug}`}><Button size="sm" variant={d?.passed ? 'outline' : 'primary'}>{d?.passed ? 'Relire' : 'Lire le guide'} <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
