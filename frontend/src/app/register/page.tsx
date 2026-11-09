'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
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
import { detectLang } from '@/lib/i18n';
import { isFreeEmail } from '@/lib/email';
import MissingHint from '@/components/ui/MissingHint';
import { canReceivePayouts, PAYOUT_COUNTRY_NOTE } from '@/lib/countries';
import { trackRef } from '@/lib/scanRef';

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
  // Créateur : uniquement les pays où Stripe peut verser les gains
  const countryOptions = Object.entries(COUNTRIES).filter(([v]) => role !== 'creator' || canReceivePayouts(v));
  useEffect(() => { if (role === 'creator' && !canReceivePayouts(country)) setCountry('FR'); }, [role, country]);
  const [language, setLanguage] = useState('fr');
  useEffect(() => { try { setLanguage(detectLang()); } catch { /* langue illisible : français */ } }, []);
  const referralCode = searchParams.get('ref') || '';
  const teamToken = searchParams.get('team') || '';
  const campaignInviteToken = searchParams.get('campaignInvite') || '';
  const quoteToken = searchParams.get('quote') || '';
  const leadId = searchParams.get('lead') || '';
  const briefId = searchParams.get('brief') || ''; // brief généré depuis une URL produit
  const nextPath = /^\/[a-z0-9\-/]*$/i.test(searchParams.get('next') || '') ? (searchParams.get('next') as string) : ''; // retour après inscription (ex. /quotes depuis le devis sans compte)
  const targetCampaign = searchParams.get('campaign') || '';
  const [campaignInvite, setCampaignInvite] = useState<{ email: string; name?: string; campaignId: string; campaignTitle: string; companyName: string } | null>(null);
  const [teamInfo, setTeamInfo] = useState<{ email: string; name?: string; companyName: string } | null>(null);
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
    if (!authLoading && user) router.replace(nextPath || '/dashboard');
  }, [authLoading, user, router, nextPath]);

  // Invitation à rejoindre l'équipe d'une marque : email et entreprise pré-remplis
  useEffect(() => {
    if (!teamToken) return;
    api.get(`/auth/team/invitations/${teamToken}`).then(({ data }) => {
      setTeamInfo(data); setRole('brand'); setStep(2); setEmail(data.email); setCompanyName(data.companyName); setName(data.name || '');
    }).catch(() => toast.error('Invitation introuvable ou déjà utilisée', { duration: 8000 }));
  }, [teamToken]);

  // Invitation d'une marque sur une campagne (créateur pas encore inscrit) : email pré-rempli, campagne ouverte à l'inscription
  useEffect(() => {
    if (!campaignInviteToken) return;
    api.get(`/campaigns/invitation/${campaignInviteToken}`).then(({ data }) => {
      setCampaignInvite(data); setRole('creator'); setStep(2); setEmail(data.email); setName(data.name || '');
    }).catch(() => toast.error('Invitation introuvable ou déjà utilisée', { duration: 8000 }));
  }, [campaignInviteToken]);
  useEffect(() => { if (targetCampaign) { setRole('creator'); setStep(2); } }, [targetCampaign]);
  useEffect(() => { if (briefId) { setRole('brand'); setStep(2); } }, [briefId]);
  // Marque venue de la prospection : compte pré-rempli, première campagne préparée après l'inscription
  // Marque venue de l'email (lien ?lead= ou référence gardée depuis l'outil de scan) : formulaire d'inscription ouvert, étape de l'entonnoir
  useEffect(() => { trackRef('register', '', false, leadId); }, [leadId]);
  useEffect(() => { if (!leadId) return; setRole('brand'); setStep(2); const e = searchParams.get('email'); const c = searchParams.get('company'); if (e) setEmail(e); if (c) setCompanyName(c); }, [leadId, searchParams]);
  // Client d'un créateur (devis extérieur) : compte marque pré-rempli, la mission démarre à l'inscription
  useEffect(() => {
    if (!quoteToken) return;
    api.get(`/external-quotes/public/${quoteToken}`).then(({ data }) => {
      const q = data.quote; setRole('brand'); setStep(2); if (q.client?.email) setEmail(q.client.email); if (q.client?.companyName) setCompanyName(q.client.companyName);
    }).catch(() => toast.error('Devis introuvable ou expiré', { duration: 8000 }));
  }, [quoteToken]);

  // Inscription avec Google : pas de mot de passe ; le compte Google ouvert, on reste sur cette page (fiche prospect, brief, retour gardés)
  // en mode « finaliser », où il ne reste que le nom (de l'entreprise) et les CGU
  const [googleLoading, setGoogleLoading] = useState(false);
  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      const existing = await refreshUser();
      if (existing) return; // déjà inscrit : redirigé vers le tableau de bord
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('complete', '1'); sp.set('role', role);
      router.replace(`/register?${sp.toString()}`);
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
      toast.error(error?.code === 'auth/unauthorized-domain' ? 'Ce domaine n\'est pas autorisé pour Google dans Firebase (Authentication → Settings → Authorized domains)' : 'Inscription avec Google impossible pour le moment', { duration: 8000 });
    } finally { setGoogleLoading(false); }
  };

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
        ? { email, name, niches, referralCode, turnstileToken, acceptTerms, country, language, ...(campaignInviteToken ? { campaignInviteToken } : {}) }
        : { email, companyName, referralCode, turnstileToken, acceptTerms, country, language, ...(teamToken ? { teamToken } : {}), ...(quoteToken ? { quoteToken } : {}), ...(leadId ? { leadId } : {}), ...(briefId ? { briefId } : {}) };

      const res = await api.post(endpoint, data, {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      await refreshUser();

      toast.success(
        role === 'creator'
          ? 'Compte créé ! Votre profil sera validé par notre équipe sous 24h.'
          : 'Compte créé ! Vous pouvez lancer votre première campagne.'
      );
      const invited = (res as any)?.data?.invitedCampaignId || campaignInvite?.campaignId || targetCampaign;
      const quoteDelivery = (res as any)?.data?.quoteDeliveryId;
      const briefCampaign = (res as any)?.data?.briefCampaignId;
      router.push(quoteDelivery ? `/deliveries/${quoteDelivery}` : briefCampaign ? `/campaigns/${briefCampaign}` : invited && role === 'creator' ? `/campaigns/${invited}` : nextPath || '/dashboard');
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

            {quoteToken && role === 'brand' && (
              <div className="mb-4 bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-900">
                📄 Vous acceptez le devis d&apos;un créateur. Créez votre compte marque : la mission sera créée et vous réglerez ensuite par carte, montant conservé par NeedCreator puis versé au créateur après votre validation des vidéos.
              </div>
            )}
            {campaignInvite && (
              <div className="mb-4 bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-900">
                🎬 <strong>{campaignInvite.companyName}</strong> vous invite sur sa campagne « {campaignInvite.campaignTitle} ». Créez votre profil avec l&apos;adresse invitée : la campagne vous sera ouverte tout de suite.
              </div>
            )}
            {teamInfo && (
              <div className="mb-4 bg-primary-50 border border-primary-200 rounded-lg p-3 text-sm text-primary-900">
                👥 Vous rejoignez l&apos;équipe <strong>{teamInfo.companyName}</strong>. Créez votre accès avec l&apos;adresse invitée : vous agirez au nom de l&apos;entreprise.
              </div>
            )}
            {referralCode && (
              <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
                🎁 Vous êtes parrainé(e) avec le code <strong>{referralCode}</strong>{role === 'brand' ? ' : 5 % de réduction sur votre première campagne.' : '.'}
              </div>
            )}

            {!completing && !teamToken && !campaignInviteToken && (
              <div className="mb-5" data-testid="register-google">
                <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignup} isLoading={googleLoading} disabled={loading}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continuer avec Google
                </Button>
                <p className="text-xs text-neutral-500 mt-1 text-center">Sans mot de passe à créer.</p>
                <div className="relative mt-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-200" /></div><div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-neutral-500">ou avec votre email</span></div></div>
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
                    {countryOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {role === 'creator' && <p className="text-xs text-neutral-500 mt-1">{PAYOUT_COUNTRY_NOTE}</p>}
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
