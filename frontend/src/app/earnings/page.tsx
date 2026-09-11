'use client';

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Download, Euro, Clock, Gift, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function EarningsPage() {
  const { ready } = useRequireAuth({ roles: ['creator'] });
  const { data, isLoading } = useQuery({
    queryKey: ['earnings'],
    queryFn: async () => (await api.get('/auth/earnings')).data,
    enabled: ready,
  });

  const downloadCsv = async () => {
    try {
      const res = await api.get('/auth/earnings', { params: { format: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revenus-needcreator-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(getErrorMessage(e, 'Export impossible'));
    }
  };

  if (!ready || isLoading) return <Spinner />;

  const t = data?.totals || {};
  const rows: any[] = data?.rows || [];
  const bonuses: any[] = data?.bonuses || [];
  const months = Object.entries(data?.byMonth || {}).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900 mb-1">Mes revenus</h1>
            <p className="text-neutral-600">Missions payées, virements Stripe et bonus de parrainage. Export CSV pour votre comptabilité.</p>
          <p className="text-sm mt-1"><Link href="/invoices" className="text-primary-600 underline">Mes factures et commissions</Link> : émises automatiquement à chaque mission validée.</p>
          </div>
          <Button variant="outline" onClick={downloadCsv}><Download className="w-4 h-4 mr-2" /> Exporter en CSV</Button>
        </div>

        {!data?.stripeConnected && (t.pendingPayout || 0) > 0 && (
          <Card className="p-4 mb-6 bg-orange-50 border-orange-200 text-sm text-orange-800">
            {formatCurrency(t.pendingPayout)} vous attendent : <Link href="/profile#stripe" className="underline font-medium">connectez votre compte Stripe</Link> pour recevoir le virement.
          </Card>
        )}

        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            ['Viré sur mon compte', t.released, Euro, 'text-green-600'],
            ['En attente de virement', t.pendingPayout, Clock, 'text-orange-500'],
            ['Chiffre d\'affaires brut', t.gross, TrendingUp, 'text-primary-500'],
            ['Bonus parrainage', t.bonuses, Gift, 'text-purple-500'],
          ].map(([label, val, Icon, color]: any) => (
            <Card key={label} className="p-5">
              <div className="flex items-center justify-between mb-1"><span className="text-sm text-neutral-600">{label}</span><Icon className={`w-5 h-5 ${color}`} /></div>
              <div className="text-2xl font-bold text-neutral-900">{formatCurrency(val || 0)}</div>
            </Card>
          ))}
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Missions payées ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">Aucune mission approuvée pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Campagne</th>
                    <th className="py-2 pr-4">Marque</th>
                    <th className="py-2 pr-4 text-right">Brut</th>
                    <th className="py-2 pr-4 text-right">Commission</th>
                    <th className="py-2 pr-4 text-right">Net</th>
                    <th className="py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.deliveryId} className="border-b border-neutral-100">
                      <td className="py-2 pr-4 whitespace-nowrap">{r.date ? formatDate(r.date) : '—'}</td>
                      <td className="py-2 pr-4"><Link href={`/deliveries/${r.deliveryId}`} className="hover:text-primary-600">{r.campaign}</Link></td>
                      <td className="py-2 pr-4 text-neutral-600">{r.brand}</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(r.amount)}</td>
                      <td className="py-2 pr-4 text-right text-neutral-500">{r.platformFeePercent}% · {formatCurrency(r.platformFee)}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-green-700">{formatCurrency(r.net)}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'released' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                          {r.status === 'released' ? `Viré${r.releasedAt ? ' le ' + formatDate(r.releasedAt) : ''}` : 'En attente (compte Stripe)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Par mois (net)</h2>
            {months.length === 0 ? <p className="text-neutral-500 text-sm">—</p> : (
              <ul className="text-sm space-y-1">
                {months.map(([m, v]: any) => (
                  <li key={m} className="flex justify-between border-b border-neutral-100 py-1"><span>{new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span><span className="font-medium">{formatCurrency(v)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Gift className="w-5 h-5 text-purple-500" /> Bonus de parrainage</h2>
            {bonuses.length === 0 ? (
              <p className="text-neutral-500 text-sm">Aucun bonus. <Link href="/profile#parrainage" className="text-primary-600 underline">Parrainez un créateur</Link> : vous gagnez un bonus dès sa première mission livrée.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {bonuses.map((b, i) => (
                  <li key={i} className="flex justify-between border-b border-neutral-100 py-1 gap-3"><span>{b.description}</span><span className="font-medium whitespace-nowrap">{formatCurrency(b.amount)} {b.status === 'paid' ? '✓' : '⏳'}</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <p className="text-xs text-neutral-500 mt-6">Ce relevé est fourni à titre indicatif pour votre déclaration (micro-entreprise ou autre). Il ne constitue pas une facture. Les virements sont effectués par Stripe sur le compte que vous avez connecté.</p>
      </div>
    </div>
  );
}
