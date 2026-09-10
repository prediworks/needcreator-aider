'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { applyActionCode, verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const ERRORS: Record<string, string> = {
  'auth/expired-action-code': 'Ce lien a expiré. Demandez-en un nouveau depuis l\'application.',
  'auth/invalid-action-code': 'Ce lien est invalide ou a déjà été utilisé.',
  'auth/user-disabled': 'Ce compte est désactivé.',
  'auth/user-not-found': 'Aucun compte ne correspond à ce lien.',
  'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
};
const msg = (e: any) => ERRORS[e?.code] || 'Une erreur est survenue. Réessayez ou demandez un nouveau lien.';

/**
 * Page d'action Firebase hébergée par NeedCreator : confirmation d'email et nouveau mot de passe.
 * Les liens des emails pointent ici (au lieu de <projet>.firebaseapp.com).
 */
function ActionContent() {
  const params = useSearchParams();
  const router = useRouter();
  const mode = params.get('mode');
  const code = params.get('oobCode') || '';
  const continueUrl = params.get('continueUrl');
  const [state, setState] = useState<'loading' | 'verified' | 'reset' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code || !mode) { setError('Lien incomplet.'); setState('error'); return; }
    (async () => {
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, code);
          await auth.currentUser?.reload().catch(() => {});
          await auth.currentUser?.getIdToken(true).catch(() => {});
          setState('verified');
        } else if (mode === 'resetPassword') {
          setEmail(await verifyPasswordResetCode(auth, code));
          setState('reset');
        } else {
          setError('Action non prise en charge.'); setState('error');
        }
      } catch (e: any) {
        setError(msg(e)); setState('error');
      }
    })();
  }, [code, mode]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Les deux mots de passe ne correspondent pas.'); return; }
    setSaving(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setState('done');
    } catch (err: any) {
      toast.error(msg(err));
    } finally {
      setSaving(false);
    }
  };

  const next = () => router.push(continueUrl && continueUrl.startsWith(window.location.origin) ? continueUrl.slice(window.location.origin.length) || '/dashboard' : '/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 py-12 px-4">
      <Card className="p-8 max-w-md w-full text-center">
        {state === 'loading' && <Spinner fullScreen={false} />}
        {state === 'verified' && (
          <>
            <CheckCircle className="w-12 h-12 text-primary-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Adresse confirmée</h1>
            <p className="text-neutral-600 mb-6">Merci ! Votre adresse email est validée, vous avez accès à toutes les fonctionnalités.</p>
            {auth.currentUser ? <Button onClick={next}>Continuer</Button> : <Link href="/login"><Button>Se connecter</Button></Link>}
          </>
        )}
        {state === 'reset' && (
          <form onSubmit={submitPassword} className="space-y-4 text-left">
            <h1 className="text-2xl font-bold text-neutral-900 text-center">Nouveau mot de passe</h1>
            <p className="text-sm text-neutral-600 text-center">Pour le compte <strong>{email}</strong></p>
            <Input label="Nouveau mot de passe (6 caractères minimum)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            <Input label="Confirmez le mot de passe" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            <Button type="submit" className="w-full" isLoading={saving}>Enregistrer</Button>
          </form>
        )}
        {state === 'done' && (
          <>
            <CheckCircle className="w-12 h-12 text-primary-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Mot de passe modifié</h1>
            <p className="text-neutral-600 mb-6">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
            <Link href="/login"><Button>Se connecter</Button></Link>
          </>
        )}
        {state === 'error' && (
          <>
            <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Lien invalide</h1>
            <p className="text-neutral-600 mb-6">{error}</p>
            <Link href="/login"><Button variant="outline">Retour à la connexion</Button></Link>
          </>
        )}
      </Card>
    </div>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ActionContent />
    </Suspense>
  );
}
