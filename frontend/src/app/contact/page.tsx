import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';
import { COMPANY } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Nous contacter',
  description: 'Une question sur NeedCreator, une campagne, un paiement ou votre compte ? Écrivez-nous, nous répondons sous deux jours ouvrés.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">Nous contacter</h1>
          <p className="text-lg text-neutral-600">Une question sur une campagne, un paiement, votre compte ou un partenariat ? Nous répondons sous deux jours ouvrés.</p>
        </div>
        <ContactForm />
        <p className="text-sm text-neutral-500 text-center mt-6">Vous préférez l&apos;email ? <a href={`mailto:${COMPANY.contactEmail}`} className="text-primary-600 underline">{COMPANY.contactEmail}</a>. Pour une mission en cours, la messagerie de la mission reste le plus rapide.</p>
      </div>
    </div>
  );
}
