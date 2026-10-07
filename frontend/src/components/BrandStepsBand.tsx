import Link from 'next/link';
import { Search, FileText, Clapperboard, ShieldCheck, ArrowRight } from 'lucide-react';

const STEPS = [
  { n: 1, title: 'Comprendre', text: 'Les publicités de vos concurrents qui durent, l\'audit des vôtres.', href: '/publicites-concurrents', cta: 'Scanner un concurrent', Icon: Search },
  { n: 2, title: 'Préparer', text: 'Un brief prêt à publier depuis un simple lien produit.', href: '/brief-depuis-url', cta: 'Mon brief depuis un lien', Icon: FileText },
  { n: 3, title: 'Produire', text: 'Des créateurs vérifiés, ou une vidéo déjà tournée à regarder avant de payer.', href: '/nos-createurs', cta: 'Voir des créateurs', Icon: Clapperboard },
  { n: 4, title: 'Protéger', text: 'Un contrat de droits par vidéo, un registre de tous vos contenus.', href: '/contenus-et-droits', cta: 'Le registre des droits', Icon: ShieldCheck },
];

/** Les quatre étapes côté marque (accueil, page Marques) : chaque outil gratuit est une étape qui mène à la vidéo */
export default function BrandStepsBand() {
  return (
    <section className="py-12 bg-white border-y border-neutral-100" data-testid="brand-steps">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ n, title, text, href, cta, Icon }) => (
            <div key={n} className="p-5 rounded-xl border border-neutral-200 bg-neutral-50 flex flex-col">
              <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center">{n}</span><span className="font-semibold text-neutral-900">{title}</span><Icon className="w-4 h-4 text-primary-500 ml-auto" /></div>
              <p className="text-sm text-neutral-700 flex-1">{text}</p>
              <Link href={href} className="mt-3 text-sm font-medium text-primary-700 hover:underline inline-flex items-center gap-1">{cta} <ArrowRight className="w-4 h-4" /></Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
