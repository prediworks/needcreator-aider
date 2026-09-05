'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import api from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<'creator' | 'brand'>('creator');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Creator fields
  const [bio, setBio] = useState('');
  const [niches, setNiches] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('100');

  // Brand fields
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'brand' || roleParam === 'creator') {
      setRole(roleParam);
    }
  }, [searchParams]);

  const nicheOptions = [
    'beauty', 'fashion', 'tech', 'food', 'travel',
    'fitness', 'gaming', 'lifestyle', 'parenting', 'pets',
    'home', 'business', 'education', 'health'
  ];

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : [...prev, niche]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('Starting registration process...', { role, email });
      
      // Create Firebase user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Firebase user created:', userCredential.user.uid);
      
      const idToken = await userCredential.user.getIdToken();
      console.log('ID token obtained');

      // Register in backend
      const endpoint = role === 'creator' ? '/auth/register/creator' : '/auth/register/brand';
      const data = role === 'creator'
        ? { email, name, bio, niches, minPrice: parseInt(minPrice) }
        : { email, companyName, website, industry };

      console.log('Sending registration to backend:', endpoint);
      const response = await api.post(endpoint, data, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      console.log('Backend registration successful:', response.data);

      // Wait for the auth state to update and user to be created in DB
      await new Promise(resolve => setTimeout(resolve, 2500));

      toast.success('Compte créé avec succès !');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Registration error:', error);
      
      // Better error messages
      let errorMessage = 'Erreur lors de l\'inscription';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Cet email est déjà utilisé';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email invalide';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'L\'inscription est temporairement désactivée';
      } else if (error.code === 'auth/configuration-not-found') {
        errorMessage = 'Firebase Authentication n\'est pas configuré. Vérifiez votre configuration Firebase.';
      } else if (error.code === 'auth/invalid-api-key') {
        errorMessage = 'Clé API Firebase invalide. Vérifiez votre fichier .env.local';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Créer un compte
          </h1>
          <p className="text-neutral-600">
            Rejoignez notre communauté de créateurs et marques
          </p>
        </div>

        {/* Role Selection */}
        {step === 1 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Je suis...</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => setRole('creator')}
                className={`p-6 border-2 rounded-lg text-left transition ${
                  role === 'creator'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="text-2xl mb-2">🎥</div>
                <h3 className="font-semibold text-lg mb-1">Créateur</h3>
                <p className="text-sm text-neutral-600">
                  Je crée du contenu UGC pour les marques
                </p>
              </button>

              <button
                onClick={() => setRole('brand')}
                className={`p-6 border-2 rounded-lg text-left transition ${
                  role === 'brand'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="text-2xl mb-2">🏢</div>
                <h3 className="font-semibold text-lg mb-1">Marque</h3>
                <p className="text-sm text-neutral-600">
                  Je cherche des créateurs pour mes campagnes
                </p>
              </button>
            </div>

            <Button onClick={() => setStep(2)} className="w-full mt-6">
              Continuer
            </Button>
          </Card>
        )}

        {/* Registration Form */}
        {step === 2 && (
          <Card className="p-6">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-neutral-600 hover:text-neutral-900 mb-4"
            >
              ← Retour
            </button>

            <form onSubmit={handleRegister} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
              />

              <Input
                label="Mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />

              {role === 'creator' ? (
                <>
                  <Input
                    label="Nom"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Votre nom"
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Parlez-nous de vous..."
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Niches (sélectionnez au moins 1)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {nicheOptions.map(niche => (
                        <button
                          key={niche}
                          type="button"
                          onClick={() => handleNicheToggle(niche)}
                          className={`px-3 py-1 rounded-full text-sm transition ${
                            niches.includes(niche)
                              ? 'bg-primary-500 text-white'
                              : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                          }`}
                        >
                          {niche}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Input
                    label="Prix minimum par vidéo (€)"
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="100"
                    required
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Nom de l'entreprise"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Votre entreprise"
                    required
                  />

                  <Input
                    label="Site web"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://votre-site.com"
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Secteur d'activité
                    </label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      required
                    >
                      <option value="">Sélectionnez...</option>
                      <option value="ecommerce">E-commerce</option>
                      <option value="tech">Tech</option>
                      <option value="beauty">Beauté</option>
                      <option value="fashion">Mode</option>
                      <option value="food">Alimentation</option>
                      <option value="health">Santé</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                isLoading={loading}
                disabled={loading || (role === 'creator' && niches.length === 0)}
              >
                Créer mon compte
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-neutral-600">Déjà un compte ? </span>
              <Link href="/login" className="text-primary-500 hover:text-primary-600 font-medium">
                Se connecter
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
