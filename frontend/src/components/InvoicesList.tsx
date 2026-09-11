'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { FileText, Download } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

const KIND_LABELS: Record<string, string> = {
  creator_to_brand: 'Facture de mission (créateur → marque)',
  commission: 'Commission NeedCreator',
  platform_to_brand: 'Service NeedCreator',
  credit_note: 'Avoir',
};
const SOURCE_LABELS: Record<string, string> = { mission: 'Mission', gifting: 'Gifting', ready_pack: 'Pack prêt à diffuser', rights_extension: 'Prolongation des droits', dispute: 'Litige tranché' };

async function openInvoice(id: string) {
  const { data } = await api.get(`/invoices/${id}`);
  if (data?.invoice?.pdfUrl) window.open(data.invoice.pdfUrl, '_blank', 'noopener');
}

/**
 * Liste de factures (page « Factures » ou bloc d'une mission). `invoices` fourni = pas de requête.
 */
export default function InvoicesList({ invoices, compact = false }: { invoices?: any[]; compact?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => (await api.get('/invoices')).data,
    enabled: !invoices,
  });
  const list: any[] = invoices || data?.invoices || [];
  if (!invoices && isLoading) return <p className="text-sm text-neutral-500">Chargement…</p>;
  if (!list.length) return <p className="text-sm text-neutral-500">{compact ? 'Les factures sont émises à la validation de la mission.' : 'Aucune facture pour l\'instant. Elles sont émises automatiquement à la validation de chaque mission.'}</p>;
  return (
    <div className={compact ? 'space-y-2' : 'overflow-x-auto'}>
      {compact ? list.map((inv) => (
        <button key={inv._id} type="button" onClick={() => openInvoice(inv._id)} className="w-full flex items-center justify-between gap-3 text-left text-sm border border-neutral-200 rounded-lg px-3 py-2 hover:bg-neutral-50">
          <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-primary-500 shrink-0" /><span className="truncate">{KIND_LABELS[inv.kind] || inv.kind} · n° {inv.number}</span></span>
          <span className="whitespace-nowrap font-medium">{formatCurrency(inv.totals?.ttc)} TTC <Download className="w-3.5 h-3.5 inline ml-1 text-neutral-400" /></span>
        </button>
      )) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Numéro</th><th className="py-2 pr-4">Nature</th><th className="py-2 pr-4">Campagne</th>
              <th className="py-2 pr-4 text-right">HT</th><th className="py-2 pr-4 text-right">TVA</th><th className="py-2 pr-4 text-right">TTC</th><th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((inv) => (
              <tr key={inv._id} className="border-b border-neutral-100">
                <td className="py-2 pr-4 whitespace-nowrap">{formatDate(inv.issuedAt)}</td>
                <td className="py-2 pr-4 font-mono text-xs">{inv.number}</td>
                <td className="py-2 pr-4">{KIND_LABELS[inv.kind] || inv.kind}<span className="text-xs text-neutral-500"> · {SOURCE_LABELS[inv.source] || inv.source}{inv.creditedBy ? ' · annulée par avoir' : ''}</span></td>
                <td className="py-2 pr-4">{inv.campaignId?.title || '—'}</td>
                <td className="py-2 pr-4 text-right">{formatCurrency(inv.totals?.ht)}</td>
                <td className="py-2 pr-4 text-right text-neutral-500">{inv.totals?.vatRate ? `${formatCurrency(inv.totals?.vat)} (${inv.totals.vatRate} %)` : '—'}</td>
                <td className="py-2 pr-4 text-right font-semibold">{formatCurrency(inv.totals?.ttc)}</td>
                <td className="py-2"><button type="button" onClick={() => openInvoice(inv._id)} className="text-primary-600 hover:underline inline-flex items-center gap-1"><Download className="w-4 h-4" /> PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
