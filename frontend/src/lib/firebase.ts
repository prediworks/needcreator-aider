import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate Firebase config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase configuration is missing. Check your .env.local file.');
  console.error('Required variables:', {
    apiKey: !!firebaseConfig.apiKey,
    authDomain: !!firebaseConfig.authDomain,
    projectId: !!firebaseConfig.projectId,
    storageBucket: !!firebaseConfig.storageBucket,
    messagingSenderId: !!firebaseConfig.messagingSenderId,
    appId: !!firebaseConfig.appId,
  });
}

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
auth.languageCode = 'fr'; // emails Firebase (confirmation, mot de passe oublié) en français

/**
 * Envoie un email Firebase (confirmation, mot de passe oublié) avec un lien de retour vers le site.
 * Si le domaine courant n'est pas autorisé dans Firebase (adresse IP, localhost), on renvoie sans lien de retour :
 * Firebase affiche alors sa propre page de confirmation.
 */
export async function sendFirebaseEmail(
  send: (settings?: { url: string }) => Promise<void>,
  path = '/login'
) {
  const settings = { url: `${window.location.origin}${path}` };
  try {
    await send(settings);
  } catch (e: any) {
    if (e?.code === 'auth/unauthorized-continue-uri' || e?.code === 'auth/invalid-continue-uri') {
      await send(undefined);
    } else {
      throw e;
    }
  }
}

export { app, auth };
