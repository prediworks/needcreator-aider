'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { RIGHTS_DURATION, RIGHTS_SUPPORTS, PLATFORMS, PLATFORM_OPTIONS, DELIVERY_TYPES } from '@/lib/labels';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface QuoteValues {
  proposal: string;
  price: number;
  estimatedDeliveryDays: number;
  rights: { duration: string; supports: string[]; territories: string; exclusivity: boolean; exclusivityMonths?: number | null };
  deliveryTypes: string[];
  platforms: string[];
  revisions: number;
  terms: string;
}

interface QuoteFormProps {
  campaign: any;
  initial?: Partial<QuoteValues> & { price?: number };
  submitLabel: string;
  isLoading?: boolean;
  onSubmit: (values: QuoteValues) => Promise<void> | void;
  onCancel?: () => void;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('px-3 py-1 rounded-full text-sm transition', active ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
    >
      {children}
    </button>
  );
}

/**
 * Devis du créateur : prix, délai, cession de droits, livraison, conditions libres
 */
export default function QuoteForm({ campaign, initial, submitLabel, isLoading, onSubmit, onCancel }: QuoteFormProps) {
  const deliverables = campaign?.brief?.deliverables || 1;
  const [proposal, setProposal] = useState(initial?.proposal || '');
  const [price, setPrice] = useState(String(initial?.price || campaign?.budget?.total || ''));
  const [days, setDays] = useState(String(initial?.estimatedDeliveryDays || 7));
  const [duration, setDuration] = useState(initial?.rights?.duration || '1y');
  const [supports, setSupports] = useState<string[]>(initial?.rights?.supports?.length ? initial.rights.supports : ['social_organic']);
  const [territories, setTerritories] = useState(initial?.rights?.territories || 'France');
  const [exclusivity, setExclusivity] = useState(!!initial?.rights?.exclusivity);
  const [exclusivityMonths, setExclusivityMonths] = useState(String(initial?.rights?.exclusivityMonths || 6));
  const [deliveryTypes, setDeliveryTypes] = useState<string[]>(initial?.deliveryTypes?.length ? initial.deliveryTypes : (campaign?.brief?.deliveryTypes || ['file', 'link']));
  const [platforms, setPlatforms] = useState<string[]>(initial?.platforms?.length ? initial.platforms : (campaign?.brief?.platforms || []));
  const [revisions, setRevisions] = useState(String(initial?.revisions ?? 2));
  const [terms, setTerms] = useState(initial?.terms || '');

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

  const priceNumber = parseInt(price) || 0;
  const allowedTypes: string[] = campaign?.brief?.deliveryTypes || ['file', 'link'];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      proposal,
      price: priceNumber,
      estimatedDeliveryDays: parseInt(days) || 7,
      rights: { duration, supports, territories, exclusivity, exclusivityMonths: exclusivity ? parseInt(exclusivityMonths) || 6 : null },
      deliveryTypes,
      platforms,
      revisions: parseInt(revisions) || 0,
      terms,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h4 className="font-semibold text-neutral-900 mb-2">1. Prix et délai</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Input
              label={`Prix total pour ${deliverables} vidéo(s) (€)`}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min={50}
              max={10000}
              required
            />
            <p className="text-xs text-neutral-500 mt-1">
              {campaign?.budget?.total
                ? `Budget indiqué par la marque : ${formatCurrency(campaign.budget.total)}.`
                : 'La marque n\'a pas fixé de budget : proposez votre prix.'}{' '}
              Vous recevrez {formatCurrency(Math.round(priceNumber * 0.9))} net (commission 10%).
            </p>
          </div>
          <Input
            label="Délai de livraison (jours)"
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            min={1}
            max={60}
            required
          />
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-2">2. Cession de droits</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Durée d&apos;utilisation</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
              {Object.entries(RIGHTS_DURATION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Input label="Territoires" value={territories} onChange={(e) => setTerritories(e.target.value)} placeholder="France, Europe, Monde…" />
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-neutral-700 mb-1">Supports autorisés</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(RIGHTS_SUPPORTS).map(([v, l]) => (
              <Chip key={v} active={supports.includes(v)} onClick={() => toggle(supports, setSupports, v)}>{l}</Chip>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={exclusivity} onChange={(e) => setExclusivity(e.target.checked)} />
            Exclusivité (je ne travaille pas pour une marque concurrente)
          </label>
          {exclusivity && (
            <div className="w-40">
              <Input label="pendant (mois)" type="number" min={1} max={36} value={exclusivityMonths} onChange={(e) => setExclusivityMonths(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-2">3. Livraison</h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {allowedTypes.map((t) => (
            <Chip key={t} active={deliveryTypes.includes(t)} onClick={() => toggle(deliveryTypes, setDeliveryTypes, t)}>{DELIVERY_TYPES[t]}</Chip>
          ))}
        </div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Réseaux de diffusion</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {PLATFORM_OPTIONS.map((p) => (
            <Chip key={p} active={platforms.includes(p)} onClick={() => toggle(platforms, setPlatforms, p)}>{PLATFORMS[p]}</Chip>
          ))}
        </div>
        <div className="w-48">
          <Input label="Révisions incluses" type="number" min={0} max={5} value={revisions} onChange={(e) => setRevisions(e.target.value)} />
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-neutral-900 mb-2">4. Message et conditions</h4>
        <textarea
          value={proposal}
          onChange={(e) => setProposal(e.target.value)}
          placeholder="Pourquoi vous êtes le bon créateur pour cette campagne…"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-3"
          rows={3}
          maxLength={1000}
        />
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Conditions particulières (ex : produit à fournir, mention du créateur, crédits, acompte…)"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={3}
          maxLength={2000}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" isLoading={isLoading} disabled={priceNumber < 50 || deliveryTypes.length === 0}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        )}
      </div>
    </form>
  );
}

/**
 * Résumé lisible d'un devis
 */
export function QuoteSummary({ application, compact = false }: { application: any; compact?: boolean }) {
  const q = application?.quote || {};
  const r = q.rights || {};
  return (
    <div className={cn('text-sm text-neutral-700 space-y-1', compact && 'text-xs')}>
      <div><span className="text-neutral-500">Prix :</span> <strong>{formatCurrency(application.price)}</strong> · livraison sous {application.estimatedDeliveryDays} j · {q.revisions ?? 2} révision(s)</div>
      <div>
        <span className="text-neutral-500">Droits :</span> {RIGHTS_DURATION[r.duration] || '1 an'} · {(r.supports || []).map((s: string) => RIGHTS_SUPPORTS[s]).join(', ') || 'réseaux sociaux'} · {r.territories || 'France'}
        {r.exclusivity ? ` · exclusivité ${r.exclusivityMonths || ''} mois` : ''}
      </div>
      {(q.platforms?.length > 0 || q.deliveryTypes?.length > 0) && (
        <div>
          <span className="text-neutral-500">Livraison :</span> {(q.deliveryTypes || []).map((t: string) => t === 'file' ? 'fichier' : 'lien').join(' ou ')}
          {q.platforms?.length ? ` · ${q.platforms.map((p: string) => PLATFORMS[p]).join(', ')}` : ''}
        </div>
      )}
      {q.terms && <div className="bg-neutral-50 rounded p-2 whitespace-pre-line"><span className="text-neutral-500">Conditions :</span> {q.terms}</div>}
      {q.version > 1 && <div className="text-xs text-neutral-500">Devis version {q.version} (modifié {q.history?.length || 0} fois)</div>}
    </div>
  );
}
