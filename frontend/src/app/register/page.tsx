'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { NICHES, NICHE_OPTIONS, COUNTRIES, LANGUAGES } from '@/lib/labels';
import Turnstile, { turnstileEnabled } from '@/components/Turnstile';
import { toast } from 'sonner';
import { isFreeEmail } from '@/lib/email';
import MissingHint from '@/components/ui/MissingHint';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const { firebaseUser, user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<'creator' | 'brand'>('creator');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Creator fields
  const [niches, setNiches] = useState<string[]>([]);

  // Brand fields
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('FR');
  const [language, setLanguage] = useState('fr');
  const referralCode = searchParams.get('ref') || '';
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  // Cas "compte Firebase existant sans profil" : on finalise l'inscription sans recréer le compte
  const completing = searchParams.get('complete') === '1' && !!firebaseUser && !user;

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'brand' || roleParam === 'creator') {
      setRole(roleParam);
      setStep(2);
    }
  }, [searchParams]);

  useEffect(() => {
    if (completing && firebaseUser?.email) {
      setEmail(firebaseUser.email);
      setStep(2);
      toast.info('Votre compte existe déjà, il ne manque que votre profil.');
    }
  }, [completing, firebaseUser]);

  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  const handleNicheToggle = (niche: string) => {
    setNiches(prev =>
      prev.includes(niche)
        ? prev.filter(n => n !== niche)
        : prev.length >= 5 ? prev : [...prev, niche]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let idToken: string;
      if (completing && auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        idToken = await userCredential.user.getIdToken();
      }

      const endpoint = role === 'creator' ? '/auth/register/creator' : '/auth/register/brand';
      const data = role === 'creator'
        ? { email, name, niches, referralCode, turnstileToken, acceptTerms, country, language }
        : { email, companyName, referralCode, turnstileToken, acceptTerms, country, language };

      await api.post(endpoint, data, {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      await refreshUser();

      toast.success(
        role === 'creator'
          ? 'Compte créé ! Votre profil sera validé par notre équipe sous 24h.'
          : 'Compte créé ! Vous pouvez lancer votre première campagne.'
      );
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Registration error:', error);

      let errorMessage = getErrorMessage(error, 'Erreur lors de l\'inscription');

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Cet email est déjà utilisé. Connectez-vous pour finaliser votre profil.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Le mot de passe doit contenir au moins 6 caractères';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email invalide';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'L\'inscription par email n\'est pas activée dans Firebase';
      } else if (error.code === 'auth/configuration-not-found' || error.code === 'auth/invalid-api-key') {
        errorMessage = 'Configuration Firebase invalide. Vérifiez frontend/.env.local';
      }

      toast.error(errorMessage, { duration: 8000 });
      // Un jeton Turnstile ne sert qu'une fois : nouveau défi
      setTurnstileReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            {completing ? 'Finaliser mon profil' : 'Créer un compte'}
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
                type="button"
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
                type="button"
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
              type="button"
              onClick={() => setStep(1)}
              className="text-sm text-neutral-600 hover:text-neutral-900 mb-4"
            >
              ← Changer de type de compte ({role === 'creator' ? 'Créateur' : 'Marque'})
            </button>

            {referralCode && (
              <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                🎁 Vous êtes parrainé(e) avec le code <strong>{referralCode}</strong>{role === 'brand' ? ' : 5 % de réduction sur votre première campagne.' : '.'}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                disabled={completing}
              />

              {role === 'brand' && isFreeEmail(email) && (
                <p className="text-xs text-neutral-500 -mt-2">Avec une adresse au nom de votre entreprise, la vérification de votre entreprise sera immédiate. Vous pourrez aussi la changer plus tard.</p>
              )}

              {!completing && (
                <Input
                  label="Mot de passe (6 caractères minimum)"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Pays</label>
                  <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {Object.entries(COUNTRIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Langue</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                    {Object.entries(LANGUAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              {role === 'creator' ? (
                <>
                  <Input
                    label="Nom ou pseudo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Votre nom"
                    minLength={2}
                    required
                  />


                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Niches (1 à 5)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {NICHE_OPTIONS.map(niche => (
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
                          {NICHES[niche]}
                        </button>
                      ))}
                    </div>
                  </div>

                </>
              ) : (
                <>
                  <Input
                    label="Nom de l'entreprise"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Votre entreprise"
                    minLength={2}
                    required
                  />


                </>
              )}

              <label className="flex items-start gap-3 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                  required
                />
                <span>
                  J&apos;accepte les <Link href="/legal/cgu" target="_blank" className="text-primary-600 underline">conditions générales d&apos;utilisation</Link> et la{' '}
                  <Link href="/legal/confidentialite" target="_blank" className="text-primary-600 underline">politique de confidentialité</Link>.
                </span>
              </label>

              <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />

              <Button
                type="submit"
                className="w-full"
                isLoading={loading}
                disabled={loading || !acceptTerms || (role === 'creator' && niches.length === 0) || (turnstileEnabled && !turnstileToken)}
              >
                {completing ? 'Enregistrer mon profil' : 'Créer mon compte'}
              </Button>
              <MissingHint items={[
                role === 'creator' && niches.length === 0 && 'au moins une niche',
                !acceptTerms && 'l\'acceptation des CGU',
                turnstileEnabled && !turnstileToken && 'la vérification anti-robot (quelques secondes)',
              ]} />
            </form>

            {!completing && (
              <div className="mt-6 text-center text-sm">
                <span className="text-neutral-600">Déjà un compte ? </span>
                <Link href="/login" className="text-primary-500 hover:text-primary-600 font-medium">
                  Se connecter
                </Link>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
