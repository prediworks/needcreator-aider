'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '@/lib/api';
import Card from '@/components/ui/Card';
import { CalendarClock, Landmark } from 'lucide-react';
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

/**
 * Calendrier des virements Stripe (solde, prochains virements) + rappel des seuils micro-entreprise.
 */
export default function PayoutsCard() {
  const { data, isLoading } = useQuery({ queryKey: ['payouts'], queryFn: async () => (await api.get('/auth/payouts')).data, staleTime: 60000 });
  if (isLoading || !data) return null;
  const t = data.thresholds;
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
          <p className="text-sm text-neutral-600 mb-3">Chiffre d&apos;affaires facturé via NeedCreator cette année : <strong>{formatCurrency(data.ytd)}</strong> HT. Ajoutez vos autres revenus pour vos propres calculs.</p>
          {[
            ['Franchise de TVA', t.vat, `Au-delà de ${formatCurrency(t.vat)} (tolérance ${formatCurrency(t.vatTolerance)}), vous devez facturer la TVA : mettez à jour votre statut dans vos informations administratives.`, t.vatRegistered],
            ['Plafond micro-entreprise (services)', t.revenue, `Au-delà de ${formatCurrency(t.revenue)} deux années de suite, le régime micro n'est plus applicable.`, false],
          ].map(([label, max, help, done]: any) => (
            <div key={label} className="mb-3">
              <div className="flex justify-between text-sm"><span className="font-medium text-neutral-800">{label}</span><span className="text-neutral-600">{pct(data.ytd, max)} %{done ? ' · déjà assujetti' : ''}</span></div>
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden mt-1"><div className={`h-full ${pct(data.ytd, max) >= 90 ? 'bg-red-500' : pct(data.ytd, max) >= 70 ? 'bg-orange-400' : 'bg-primary-500'}`} style={{ width: `${pct(data.ytd, max)}%` }} /></div>
              <p className="text-xs text-neutral-500 mt-1">{help}</p>
            </div>
          ))}
          <p className="text-xs text-neutral-400">Seuils indicatifs (prestations de services, 2025). Vérifiez auprès de l&apos;URSSAF ou de votre comptable.</p>
        </Card>
      )}
    </div>
  );
}
