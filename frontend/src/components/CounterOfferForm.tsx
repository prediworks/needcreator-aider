'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

/**
 * Contre-proposition de la marque sur un devis : prix, délai, révisions, message.
 * Le devis du créateur reste valable tant qu'il n'a pas accepté.
 */
export function CounterOfferForm({ application, onSubmit, onCancel, isLoading }: { application: any; onSubmit: (data: any) => Promise<any>; onCancel: () => void; isLoading?: boolean }) {
  const cfg = usePublicConfig();
  const [price, setPrice] = useState(String(application.price || ''));
  const [days, setDays] = useState(String(application.estimatedDeliveryDays || ''));
  const [revisions, setRevisions] = useState(String(application.quote?.revisions ?? cfg.maxRevisions));
  const [message, setMessage] = useState('');
  const p = parseFloat(price) || 0;
  const d = parseInt(days, 10) || 0;
  const r = parseInt(revisions, 10);
  const unchanged = p === application.price && d === application.estimatedDeliveryDays && r === (application.quote?.revisions ?? cfg.maxRevisions);
  const missing = [
    p < cfg.minQuotePrice && `un prix d'au moins ${cfg.minQuotePrice} €`,
    d < 1 && 'un délai en jours',
    (isNaN(r) || r < 0 || r > cfg.maxRevisions) && `un nombre de révisions entre 0 et ${cfg.maxRevisions}`,
    unchanged && 'au moins une différence avec le devis (sinon acceptez-le directement)',
  ].filter(Boolean) as string[];
  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (missing.length) return; await onSubmit({ price: p, estimatedDeliveryDays: d, revisions: r, message }); }}
      className="border border-primary-200 bg-primary-50 rounded-lg p-4 space-y-3"
    >
      <div className="font-medium text-neutral-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary-600" /> Contre-proposition</div>
      <p className="text-xs text-neutral-600">Devis actuel : {formatCurrency(application.price)} HT · {application.estimatedDeliveryDays} j · {application.quote?.revisions ?? cfg.maxRevisions} révision(s). Le créateur accepte en un clic, refuse, ou renvoie un devis. Son devis reste valable en attendant.</p>
      <div className="grid sm:grid-cols-3 gap-2">
        <Input label="Prix HT (€)" type="number" min={cfg.minQuotePrice} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input label="Délai (jours)" type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} />
        <Input label={`Révisions (max ${cfg.maxRevisions})`} type="number" min={0} max={cfg.maxRevisions} value={revisions} onChange={(e) => setRevisions(e.target.value)} />
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={2} placeholder="Un mot pour expliquer (optionnel) : budget, urgence, volume à venir…" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      {missing.length > 0 && <p className="text-xs text-neutral-500">Il manque : {missing.join(', ')}.</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" isLoading={isLoading} disabled={missing.length > 0}>Envoyer la contre-proposition</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  );
}

/** État d'une contre-proposition, vu par la marque */
export function CounterOfferStatus({ offer }: { offer: any }) {
  if (!offer?.status) return null;
  const label: Record<string, string> = {
    pending: 'en attente de réponse du créateur',
    accepted: 'acceptée : le devis a été mis à jour',
    declined: 'déclinée : le devis d\'origine reste valable',
    superseded: 'remplacée par un nouveau devis du créateur',
  };
  const color: Record<string, string> = { pending: 'text-yellow-800 bg-yellow-50 border-yellow-200', accepted: 'text-green-800 bg-green-50 border-green-200', declined: 'text-neutral-700 bg-neutral-50 border-neutral-200', superseded: 'text-neutral-700 bg-neutral-50 border-neutral-200' };
  return (
    <div className={`text-xs rounded-lg border px-3 py-2 mb-3 ${color[offer.status]}`}>
      <strong>Contre-proposition</strong> du {formatDate(offer.proposedAt)} : {formatCurrency(offer.price)} HT · {offer.estimatedDeliveryDays} j · {offer.revisions} révision(s), {label[offer.status]}.
    </div>
  );
}

/** Contre-proposition en attente, vue par le créateur : accepter, refuser, ou modifier son devis */
export function CounterOfferPrompt({ offer, application, companyName, onAccept, onDecline, onEdit, isLoading }: { offer: any; application: any; companyName?: string; onAccept: () => void; onDecline: () => void; onEdit: () => void; isLoading?: boolean }) {
  const cfg = usePublicConfig();
  return (
    <div className="border border-primary-300 bg-primary-50 rounded-lg p-4 mt-3">
      <div className="font-medium text-neutral-900 flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-primary-600" /> {companyName || 'La marque'} vous fait une contre-proposition</div>
      <div className="text-sm text-neutral-700 grid grid-cols-2 gap-x-3 gap-y-0.5 mb-2">
        <span className="text-neutral-500">Votre devis</span><span>{formatCurrency(application.price)} HT · {application.estimatedDeliveryDays} j · {application.quote?.revisions ?? cfg.maxRevisions} révision(s)</span>
        <span className="text-neutral-500">Proposition</span><strong>{formatCurrency(offer.price)} HT · {offer.estimatedDeliveryDays} j · {offer.revisions} révision(s)</strong>
      </div>
      {offer.message && <p className="text-sm text-neutral-700 italic bg-white rounded p-2 mb-2">« {offer.message} »</p>}
      <p className="text-xs text-neutral-600 mb-3">Si vous acceptez, votre devis est mis à jour et la marque peut le valider. Si vous refusez, votre devis d&apos;origine reste valable. Vous pouvez aussi renvoyer un devis modifié.</p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={onAccept} isLoading={isLoading}>Accepter</Button>
        <Button size="sm" variant="outline" onClick={onDecline} isLoading={isLoading}>Refuser</Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>Modifier mon devis</Button>
      </div>
    </div>
  );
}
