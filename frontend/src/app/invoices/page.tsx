'use client';

import { useRequireAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import InvoicesList from '@/components/InvoicesList';

export default function InvoicesPage() {
  const { user, ready } = useRequireAuth();
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
        <Card className="p-6">
          <InvoicesList />
        </Card>
      </div>
    </div>
  );
}
