'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export interface NextStep { title: string; text: string; href?: string; cta?: string; done?: boolean }
export interface NextItem { label: string; href: string; key?: string }

/**
 * Une seule prochaine étape mise en avant, le reste en petit dessous
 */
export default function NextStepCard({ step, remaining = [], children }: { step: NextStep | null; remaining?: NextItem[]; children?: React.ReactNode }) {
  if (!step) return null;
  return (
    <Card className="p-5 mb-6 border-primary-300 bg-primary-50/60">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="text-xs uppercase tracking-wide text-primary-700 font-semibold mb-1">Prochaine étape</div>
          <h3 className="text-lg font-semibold text-neutral-900">{step.title}</h3>
          <p className="text-sm text-neutral-700 mt-1">{step.text}</p>
          {children}
        </div>
        {step.href && step.cta && (
          <Link href={step.href}><Button>{step.cta} <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
        )}
      </div>
      {remaining.length > 0 && (
        <p className="text-xs text-neutral-500 mt-3 flex items-start gap-1 flex-wrap"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> Ensuite :{' '}
          {remaining.map((r, i) => (
            <span key={r.key || r.label}>{i > 0 && ' · '}<Link href={r.href} className="underline decoration-dotted hover:text-primary-600">{r.label}</Link></span>
          ))}
        </p>
      )}
    </Card>
  );
}
