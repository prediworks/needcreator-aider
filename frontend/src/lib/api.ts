import axios from 'axios';
import { auth } from './firebase';

// Validate API URL
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) {
  console.error('❌ NEXT_PUBLIC_API_URL is not defined in .env.local');
  console.error('Please create frontend/.env.local with:');
  console.error('NEXT_PUBLIC_API_URL=http://localhost:3002/api');
}

const api = axios.create({
  baseURL: apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 min (uploads vidéo)
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      console.error('❌ Impossible de joindre le backend :', apiUrl);
      console.error('Vérifiez que le backend tourne : cd backend && npm run dev');
    }

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      // Session expirée : retour à la connexion (sauf sur les pages publiques)
      if (!['/login', '/register', '/'].includes(path) && auth.currentUser === null) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Message d'erreur lisible à partir d'une erreur axios (validation Joi incluse)
 */
export function getErrorMessage(error: any, fallback = 'Une erreur est survenue'): string {
  if (!error) return fallback;
  if (error.code === 'ERR_NETWORK') return 'Impossible de joindre le serveur. Le backend est-il démarré ?';
  const data = error.response?.data;
  if (data?.details?.length) {
    const fields: Record<string, string> = {
      title: 'Titre', description: 'Description', budget: 'Budget', niches: 'Niches',
      applicationDeadline: 'Date limite', duration: 'Durée', deliverables: 'Nombre de vidéos',
      price: 'Prix', estimatedDeliveryDays: 'Délai', feedback: 'Feedback', email: 'Email',
      name: 'Nom', minPrice: 'Prix minimum', website: 'Site web', companyName: 'Entreprise',
      rating: 'Note', comment: 'Commentaire', proposal: 'Proposition', bio: 'Bio',
    };
    return data.details
      .map((d: any) => {
        const label = fields[d.field] || d.field;
        const msg = String(d.message || '')
          .replace(/^"[^"]+" /, '')
          .replace('length must be at least', 'doit contenir au moins')
          .replace('length must be less than or equal to', 'doit contenir au plus')
          .replace('characters long', 'caractères')
          .replace('must be greater than "now"', 'doit être dans le futur')
          .replace('must be greater than or equal to', 'doit être supérieur ou égal à')
          .replace('must be less than or equal to', 'doit être inférieur ou égal à')
          .replace('is not allowed to be empty', 'est obligatoire')
          .replace('is required', 'est obligatoire')
          .replace('must be a valid email', 'doit être un email valide')
          .replace('must be a valid uri', 'doit être une URL valide (https://...)')
          .replace('must contain at least', 'doit contenir au moins')
          .replace('items', 'élément(s)');
        return `${label} : ${msg}`;
      })
      .join(' · ');
  }
  return data?.error || data?.message || error.message || fallback;
}

export default api;
