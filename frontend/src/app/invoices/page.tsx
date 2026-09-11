'use client';

import { useRequireAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import InvoicesList from '@/components/InvoicesList';
import Button from '@/components/ui/Button';
import api, { getErrorMessage } from '@/lib/api';
import { useState } from 'react';
import { toast } from 'sonner';
import { FileDown } from 'lucide-react';

function monthOptions() {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ value: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`, label: dt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) });
  }
  return out;
}

export default function InvoicesPage() {
  const { user, ready } = useRequireAuth();
  const [month, setMonth] = useState(monthOptions()[0].value);
  const [downloading, setDownloading] = useState(false);
  const downloadStatement = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/invoices/statement', { params: { month }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
    } catch (e: any) {
      toast.error(getErrorMessage(e, 'Relevé indisponible'));
    } finally {
      setDownloading(false);
    }
  };
  if (!ready) return <Spinner />;
  const isBrand = user?.role === 'brand';
  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">{isBrand ? 'Mes factures' : 'Mes factures et commissions'}</h1>
          <p className="text-neutral-600">
            {isBrand
              ? 'À chaque mission validée, vous recevez la facture du créateur (émise en son nom par NeedCreator) et, le cas échéant, une facture NeedCreator pour les services de plateforme.'
              : 'À chaque mission validée, NeedCreator émet en votre nom votre facture à la marque (mandat de facturation) et vous adresse sa facture de commission, réglée par compensation sur votre virement.'}
          </p>
        </div>
        <Card className="p-5 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="font-semibold text-neutral-900">Relevé mensuel</div>
              <div className="text-sm text-neutral-600">{isBrand ? 'Toutes les factures reçues sur le mois, avec les totaux HT, TVA et TTC.' : 'Chiffre d\'affaires facturé, commissions et net versé sur le mois, pour votre comptabilité.'}</div>
            </div>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-3 py-2 border border-neutral-300 rounded-lg text-sm">
              {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button size="sm" onClick={downloadStatement} isLoading={downloading}><FileDown className="w-4 h-4 mr-1" /> Télécharger le relevé</Button>
          </div>
        </Card>
        <Card className="p-6">
          <InvoicesList />
        </Card>
      </div>
    </div>
  );
}
