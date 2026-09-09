import Link from 'next/link';
import { COMPANY } from '@/lib/legal';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 mt-auto">
      <div className="container mx-auto px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div className="md:col-span-1">
          <Link href="/" className="flex items-center gap-2 mb-3">
            <img src="/icon.svg" alt="" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-bold text-neutral-900">NeedCreator</span>
          </Link>
          <p className="text-neutral-600">La plateforme UGC française qui met en relation marques et créateurs, avec paiement sécurisé et validation garantie.</p>
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900 mb-3">Plateforme</h3>
          <ul className="space-y-2 text-neutral-600">
            <li><Link href="/how-it-works" className="hover:text-primary-600">Comment ça marche</Link></li>
            <li><Link href="/pricing" className="hover:text-primary-600">Tarifs</Link></li>
            <li><Link href="/register?role=brand" className="hover:text-primary-600">Je suis une marque</Link></li>
            <li><Link href="/register?role=creator" className="hover:text-primary-600">Je suis créateur</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900 mb-3">Légal</h3>
          <ul className="space-y-2 text-neutral-600">
            <li><Link href="/legal/cgu" className="hover:text-primary-600">Conditions générales d&apos;utilisation</Link></li>
            <li><Link href="/legal/confidentialite" className="hover:text-primary-600">Politique de confidentialité</Link></li>
            <li><Link href="/legal/mentions-legales" className="hover:text-primary-600">Mentions légales</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-neutral-900 mb-3">Contact</h3>
          <ul className="space-y-2 text-neutral-600">
            <li><a href={`mailto:${COMPANY.contactEmail}`} className="hover:text-primary-600">{COMPANY.contactEmail}</a></li>
            <li><Link href="/login" className="hover:text-primary-600">Connexion</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-100">
        <div className="container mx-auto px-4 py-4 text-xs text-neutral-500 flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} {COMPANY.brand}. Tous droits réservés.</span>
          <span>Paiements sécurisés par Stripe</span>
        </div>
      </div>
    </footer>
  );
}
