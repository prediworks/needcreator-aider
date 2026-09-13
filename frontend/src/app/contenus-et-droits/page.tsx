import type { Metadata } from 'next';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { FolderOpen, Clock, FileSignature, Upload, Bell, Users, Search, ArrowRight, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contenus & droits : le CRM de votre contenu créatif',
  description: 'Suivez tous vos contenus UGC et créatifs et leurs droits au même endroit, y compris ceux achetés ailleurs : créateur, type de contrat, supports, territoire, date de fin, facture, où c\'est utilisé. Rappels avant expiration, renouvellement en un clic. Gratuit.',
  alternates: { canonical: '/contenus-et-droits' },
};

export default function ContentsRightsPage() {
  const questions: [any, string, string][] = [
    [Users, 'Qui a créé quoi ?', 'Créateur, pseudo, email, origine : mission NeedCreator, agence, autre plateforme ou achat direct.'],
    [FileSignature, 'Avec quels droits ?', 'Type de contrat (cession, licence, gifting, influence), supports autorisés, territoire, exclusivité, contrat et facture joints.'],
    [Clock, 'Jusqu\'à quand ?', 'Date de fin pour chaque contenu, statut calculé : actif, expire sous 30 jours, expiré, illimité.'],
    [Search, 'Où est-ce utilisé ?', 'Fiche produit, publicité, réseaux, site, emailing : chaque diffusion notée avec son lien, pour retirer ce qui n\'est plus couvert.'],
    [Bell, 'Qui prévient ?', 'Rappel par email 30 jours puis 7 jours avant la fin des droits. Un tableau « expire ce mois » pour votre équipe.'],
    [ArrowRight, 'Qui peut le renouveler ?', 'Un clic : prolongation payée au créateur NeedCreator, ou email pré-rédigé au créateur extérieur.'],
  ];
  return (
    <div className="min-h-screen bg-white">
      <section className="bg-gradient-to-br from-primary-50 to-white py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-6 text-sm font-medium text-primary-700"><FolderOpen className="w-4 h-4 mr-2" /> Pour les marques, inclus et gratuit</div>
          <h1 className="text-4xl md:text-6xl font-bold text-neutral-900 mb-6">Vos contenus et leurs droits, <span className="text-primary-500">au même endroit</span></h1>
          <p className="text-xl text-neutral-600 mb-4 max-w-2xl mx-auto">Le CRM de votre contenu créatif. Pas celui de vos clients : celui de vos vidéos, photos et voix, et des contrats qui vont avec, y compris ceux achetés ailleurs.</p>
          <p className="text-neutral-600 mb-8 max-w-2xl mx-auto">Une marque qui a des dizaines de contenus en circulation ne sait plus lesquels sont encore couverts. NeedCreator vous le dit, et vous relance avant l&apos;échéance.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register?role=brand"><Button size="lg" className="w-full sm:w-auto">Ouvrir mon registre <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link href="/marques"><Button variant="outline" size="lg" className="w-full sm:w-auto">NeedCreator pour les marques</Button></Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 text-center mb-3">Six questions, une seule fiche par contenu</h2>
          <p className="text-lg text-neutral-600 text-center mb-14">Contenus des missions NeedCreator ajoutés automatiquement. Contenus extérieurs saisis en une minute ou importés depuis Excel.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {questions.map(([Icon, title, text]) => (
              <Card key={title} className="p-6">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4"><Icon className="w-6 h-6 text-primary-600" /></div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h3>
                <p className="text-sm text-neutral-600">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-neutral-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-bold text-neutral-900 text-center mb-10">Tout contenu et tout contrat artistique, d&apos;où qu&apos;il vienne</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-primary-500" /> Missions NeedCreator</h3>
              <p className="text-sm text-neutral-600">Chaque vidéo validée entre dans le registre avec les droits du contrat, le prix, le créateur, le contrat PDF et les factures. Rien à saisir.</p>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2"><Upload className="w-5 h-5 text-primary-500" /> Contenus achetés ailleurs</h3>
              <p className="text-sm text-neutral-600">Agence, autre plateforme, créateur contacté en direct, photographe, voix off : type de contrat, dates, supports, territoire, prix, liens vers le contrat et la facture. Saisie ou import Excel, export CSV pour votre juridique ou votre comptable.</p>
            </Card>
          </div>
          <p className="text-center text-sm text-neutral-500 mt-8">Partagé avec les collaborateurs de votre compte marque. Aucune détection automatique d&apos;usage hors droits : le registre dit ce qui est couvert, vous décidez.</p>
        </div>
      </section>

      <section className="py-20 bg-primary-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Sachez ce qui est encore couvert</h2>
          <p className="text-xl text-primary-50 mb-8">Inclus dans l&apos;offre gratuite. Cinq minutes pour créer votre compte marque.</p>
          <Link href="/register?role=brand"><Button size="lg" variant="outline" className="bg-white text-primary-600 hover:bg-primary-50 border-white">Créer mon compte marque</Button></Link>
        </div>
      </section>
    </div>
  );
}
