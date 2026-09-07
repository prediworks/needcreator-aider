'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useCreateReview } from '@/hooks/useReviews';
import { cn } from '@/lib/utils';

const CRITERIA: Array<{ key: 'communication' | 'quality' | 'timeliness' | 'professionalism'; label: string }> = [
  { key: 'communication', label: 'Communication' },
  { key: 'quality', label: 'Qualité' },
  { key: 'timeliness', label: 'Respect des délais' },
  { key: 'professionalism', label: 'Professionnalisme' },
];

function Stars({ value, onChange, size = 'w-6 h-6' }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn('transition', onChange && 'hover:scale-110')}
          aria-label={`${n} étoile(s)`}
        >
          <Star className={cn(size, n <= value ? 'text-yellow-500 fill-yellow-500' : 'text-neutral-300')} />
        </button>
      ))}
    </div>
  );
}

export { Stars };

interface ReviewFormProps {
  campaignId: string;
  revieweeName: string;
  onDone?: () => void;
}

export default function ReviewForm({ campaignId, revieweeName, onDone }: ReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [criteria, setCriteria] = useState({ communication: 5, quality: 5, timeliness: 5, professionalism: 5 });
  const [comment, setComment] = useState('');
  const mutation = useCreateReview();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await mutation.mutateAsync({ campaignId, data: { rating, comment, ...criteria } });
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm font-medium text-neutral-700 mb-1">Note globale pour {revieweeName}</p>
        <Stars value={rating} onChange={setRating} size="w-8 h-8" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {CRITERIA.map((c) => (
          <div key={c.key} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2">
            <span className="text-sm text-neutral-700">{c.label}</span>
            <Stars value={criteria[c.key]} onChange={(v) => setCriteria({ ...criteria, [c.key]: v })} size="w-4 h-4" />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Commentaire (optionnel, public)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Qu'avez-vous apprécié ? Que pourrait-on améliorer ?"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <Button type="submit" isLoading={mutation.isPending} className="w-full">
        Envoyer mon avis
      </Button>
    </form>
  );
}
