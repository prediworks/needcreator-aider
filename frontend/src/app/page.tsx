'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Sparkles, Users, TrendingUp, Shield, Zap, CheckCircle } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary-50 to-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center px-4 py-2 bg-primary-100 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary-600 mr-2" />
              <span className="text-sm font-medium text-primary-700">
                La plateforme UGC la plus simple et transparente
              </span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 mb-6">
              Créez du contenu UGC
              <span className="text-primary-500"> authentique</span>
            </h1>
            
            <p className="text-xl text-neutral-600 mb-8 max-w-2xl mx-auto">
              Connectez-vous avec plus de 15 000 créateurs vérifiés en France. 
              Obtenez des vidéos UGC professionnelles en 7 jours.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register?role=brand">
                <Button size="lg" className="w-full sm:w-auto">
                  Je suis une marque
                </Button>
              </Link>
              <Link href="/register?role=creator">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Je suis créateur
                </Button>
              </Link>
            </div>
            
            <div className="mt-8 flex items-center justify-center gap-8 text-sm text-neutral-600">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>Vidéos dès 80€</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>Livraison en 7 jours</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                <span>Révisions illimitées</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
              Pourquoi choisir notre plateforme ?
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Une solution complète pour créer du contenu UGC de qualité
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-900 mb-2">
                Matching IA intelligent
              </h3>
              <p className="text-neutral-600">
                Notre algorithme trouve automatiquement les créateurs parfaits pour votre marque
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-900 mb-2">
                Paiement sécurisé
              </h3>
              <p className="text-neutral-600">
                Paiements via Stripe Connect avec validation automatique après 7 jours
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-900 mb-2">
                Analytics temps réel
              </h3>
              <p className="text-neutral-600">
                Suivez les performances de vos campagnes avec des métriques détaillées
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-neutral-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
            <div>
              <div className="text-4xl font-bold text-primary-500 mb-2">15K+</div>
              <div className="text-neutral-600">Créateurs vérifiés</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-500 mb-2">1500+</div>
              <div className="text-neutral-600">Marques satisfaites</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-500 mb-2">7 jours</div>
              <div className="text-neutral-600">Délai moyen</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-500 mb-2">4.9/5</div>
              <div className="text-neutral-600">Note moyenne</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary-500">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Prêt à créer du contenu authentique ?
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Rejoignez plus de 1500 marques qui font confiance à notre plateforme
          </p>
          <Link href="/register">
            <Button variant="secondary" size="lg">
              Commencer gratuitement
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
