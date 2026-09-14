import type { Metadata } from 'next';
import RateCalculator from '@/components/RateCalculator';

export const metadata: Metadata = {
  title: 'Calculateur de tarif UGC : combien facturer une vidéo ?',
  description: 'Estimez le prix d\'une vidéo UGC selon le type, la durée des droits, les supports, l\'exclusivité et le volume. Fourchettes observées sur les devis acceptés sur NeedCreator.',
  alternates: { canonical: '/calculateur-tarif-ugc' },
};
export const revalidate = 300;

export default function RateCalculatorPage() {
  return (
    <div className="min-h-screen bg-white py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-4 text-sm font-medium text-primary-700">Outil gratuit pour les créateurs</div>
          <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 mb-3">Combien facturer une vidéo UGC ?</h1>
          <p className="text-lg text-neutral-600">Une fourchette indicative selon le type de vidéo, les droits cédés, les supports, l&apos;exclusivité et le volume. Basée sur les devis réellement acceptés sur NeedCreator quand ils sont assez nombreux.</p>
        </div>
        <RateCalculator />
      </div>
    </div>
  );
}
