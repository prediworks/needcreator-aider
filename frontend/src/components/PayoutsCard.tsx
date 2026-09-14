'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import { CalendarClock, Landmark, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

const PAYOUT_STATUS: Record<string, string> = { paid: 'Versé', pending: 'En cours', in_transit: 'En transit', canceled: 'Annulé', failed: 'Échoué' };

function scheduleLabel(s: any) {
  if (!s) return '';
  const delay = s.delayDays != null ? `, ${s.delayDays} jour${s.delayDays > 1 ? 's' : ''} après l'encaissement` : '';
  if (s.interval === 'daily') return `Virement quotidien${delay}`;
  if (s.interval === 'weekly') return `Virement hebdomadaire${s.weeklyAnchor ? ` (${s.weeklyAnchor})` : ''}${delay}`;
  if (s.interval === 'monthly') return `Virement mensuel${s.monthlyAnchor ? ` (le ${s.monthlyAnchor})` : ''}${delay}`;
  return 'Virement manuel';
}

/** Revenus hors NeedCreator (clients directs, autres plateformes) : saisie et liste de l'année */
function ExternalIncomes({ year }: { year: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: '', client: '', amountHT: '', date: new Date().toISOString().slice(0, 10) });
  const { data } = useQuery({ queryKey: ['external-incomes', year], queryFn: async () => (await api.get(`/external-incomes?year=${year}`)).data, staleTime: 60000 });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['external-incomes'] }); queryClient.invalidateQueries({ queryKey: ['payouts'] }); };
  const add = useMutation({ mutationFn: async () => (await api.post('/external-incomes', { ...f, amountHT: parseFloat(f.amountHT) })).data, onSuccess: (d) => { toast.success(d.message); setF({ label: '', client: '', amountHT: '', date: new Date().toISOString().slice(0, 10) }); setOpen(false); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/external-incomes/${id}`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const missing = [!f.label.trim() && 'un libellé', !(parseFloat(f.amountHT) > 0) && 'un montant HT'].filter(Boolean) as string[];
  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-medium text-neutral-800">Autres revenus {year} : {formatCurrency(data?.total || 0)} HT</div>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}><Plus className="w-4 h-4 mr-1" /> Ajouter un revenu</Button>
      </div>
      <p className="text-xs text-neutral-500 mt-1">Vos devis « payés en direct » sont comptés automatiquement. Ajoutez vos autres clients et plateformes : les seuils ci-dessus s&apos;apprécient sur le total. Ces montants restent privés.</p>
      {open && (
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <Input label="Libellé" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ex : 3 vidéos pour une agence" />
          <Input label="Client (optionnel)" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} />
          <Input label="Montant HT (€)" type="number" min={0} step="0.01" value={f.amountHT} onChange={(e) => setF({ ...f, amountHT: e.target.value })} />
          <Input label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <div className="sm:col-span-2 flex items-center gap-2 flex-wrap"><Button size="sm" onClick={() => add.mutate()} isLoading={add.isPending} disabled={missing.length > 0}>Enregistrer</Button><MissingHint items={missing} /></div>
        </div>
      )}
      {data?.incomes?.length ? (
        <table className="w-full text-sm mt-3">
          <tbody>{data.incomes.map((i: any) => (
            <tr key={i._id} className="border-b border-neutral-100"><td className="py-1 pr-2">{formatDate(i.date)}</td><td className="py-1 pr-2">{i.label}{i.client ? ` · ${i.client}` : ''}{i.source === 'quote' ? ' · devis NeedCreator' : ''}</td><td className="py-1 pr-2 text-right font-medium whitespace-nowrap">{formatCurrency(i.amountHT)}</td><td className="py-1 text-right">{i.source === 'manual' && <button type="button" onClick={() => { if (confirm('Retirer ce revenu ?')) remove.mutate(i._id); }} className="text-neutral-400 hover:text-red-600" aria-label="Retirer"><Trash2 className="w-4 h-4" /></button>}</td></tr>
          ))}</tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * Calendrier des virements Stripe (solde, prochains virements) + rappel des seuils micro-entreprise.
 */
export default function PayoutsCard() {
  const { data, isLoading } = useQuery({ queryKey: ['payouts'], queryFn: async () => (await api.get('/auth/payouts')).data, staleTime: 60000 });
  if (isLoading || !data) return null;
  const t = data.thresholds;
  const total = data.ytdTotal ?? data.ytd;
  const pct = (v: number, max: number) => Math.min(100, Math.round((v / max) * 100));
  return (
    <div className="grid lg:grid-cols-2 gap-6 mb-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2 mb-1"><CalendarClock className="w-5 h-5 text-primary-500" /> Calendrier des virements</h2>
        {!data.connected ? (
          <p className="text-sm text-neutral-600">Connectez votre compte Stripe depuis <Link href="/profile#stripe" className="text-primary-600 underline">votre profil</Link> pour recevoir vos virements et voir leur calendrier.</p>
        ) : data.stripeError ? (
          <p className="text-sm text-neutral-600">Calendrier indisponible pour le moment ({data.stripeError}).</p>
        ) : (
          <>
            <p className="text-sm text-neutral-600 mb-3">{scheduleLabel(data.schedule)}. Chaque validation de mission déclenche un virement vers votre compte Stripe, puis Stripe le vire sur votre compte bancaire selon ce calendrier.</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-neutral-50 rounded-lg p-3"><div className="text-xs text-neutral-500">Disponible sur Stripe</div><div className="text-lg font-semibold">{formatCurrency(data.balance?.available || 0)}</div></div>
              <div className="bg-neutral-50 rounded-lg p-3"><div className="text-xs text-neutral-500">En attente (délai Stripe)</div><div className="text-lg font-semibold">{formatCurrency(data.balance?.pending || 0)}</div></div>
            </div>
            {data.payouts?.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-neutral-500 border-b"><th className="py-1 pr-3">Arrivée sur votre compte</th><th className="py-1 pr-3 text-right">Montant</th><th className="py-1">Statut</th></tr></thead>
                <tbody>{data.payouts.map((p: any) => (
                  <tr key={p.id} className="border-b border-neutral-100"><td className="py-1 pr-3">{formatDate(p.arrivalDate)}</td><td className="py-1 pr-3 text-right font-medium">{formatCurrency(p.amount)}</td><td className="py-1">{PAYOUT_STATUS[p.status] || p.status}</td></tr>
                ))}</tbody>
              </table>
            ) : <p className="text-sm text-neutral-500">Aucun virement bancaire pour l&apos;instant.</p>}
          </>
        )}
      </Card>
      {t && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Landmark className="w-5 h-5 text-primary-500" /> Seuils micro-entreprise {data.year}</h2>
          <p className="text-sm text-neutral-600 mb-3">Chiffre d&apos;affaires cette année : <strong>{formatCurrency(total)}</strong> HT, dont {formatCurrency(data.ytd)} facturés via NeedCreator{data.ytdExternal ? ` et ${formatCurrency(data.ytdExternal)} hors plateforme` : ''}.</p>
          {[
            ['Franchise de TVA', t.vat, `Au-delà de ${formatCurrency(t.vat)} (tolérance ${formatCurrency(t.vatTolerance)}), vous devez facturer la TVA : mettez à jour votre statut dans vos informations administratives.`, t.vatRegistered],
            ['Plafond micro-entreprise (services)', t.revenue, `Au-delà de ${formatCurrency(t.revenue)} deux années de suite, le régime micro n'est plus applicable.`, false],
          ].map(([label, max, help, done]: any) => (
            <div key={label} className="mb-3">
              <div className="flex justify-between text-sm"><span className="font-medium text-neutral-800">{label}</span><span className="text-neutral-600">{pct(total, max)} %{done ? ' · déjà assujetti' : ''}</span></div>
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden mt-1"><div className={`h-full ${pct(total, max) >= 90 ? 'bg-red-500' : pct(total, max) >= 70 ? 'bg-orange-400' : 'bg-primary-500'}`} style={{ width: `${pct(total, max)}%` }} /></div>
              <p className="text-xs text-neutral-500 mt-1">{help}</p>
            </div>
          ))}
          <p className="text-xs text-neutral-400">Seuils indicatifs (prestations de services, 2025). Vérifiez auprès de l&apos;URSSAF ou de votre comptable.</p>
          <ExternalIncomes year={data.year} />
        </Card>
      )}
    </div>
  );
}
