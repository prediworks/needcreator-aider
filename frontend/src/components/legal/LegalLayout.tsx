import Link from 'next/link';
import { LEGAL_VERSION_DATE } from '@/lib/legal';

const NAV = [
  { href: '/legal/cgu', label: 'CGU' },
  { href: '/legal/confidentialite', label: 'Confidentialité' },
  { href: '/legal/mentions-legales', label: 'Mentions légales' },
];

export default function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <nav className="flex gap-4 text-sm mb-6" aria-label="Documents légaux">
          {NAV.map(n => (
            <Link key={n.href} href={n.href} className="text-neutral-600 hover:text-primary-600">{n.label}</Link>
          ))}
        </nav>
        <article className="legal bg-white rounded-xl border border-neutral-200 p-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-1">{title}</h1>
          <p className="text-sm text-neutral-500 mb-6">Version du {LEGAL_VERSION_DATE}</p>
          {children}
        </article>
      </div>
    </div>
  );
}
