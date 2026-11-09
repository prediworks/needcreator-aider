import api from '@/lib/api';

/**
 * Référence gardée pour la session, chaque action y est rattachée : fiche prospect (lien de l'email marques, ?ref=) ou devis de créateur
 * (outils offerts avec le devis, ?devis=, gardé sous la forme « devis:<id> »). Sert à l'entonnoir des marques venues de l'email (admin).
 */
export const REF_KEY = 'nc_scan_ref';
export type RefAction = 'visit' | 'scan' | 'audit' | 'brief' | 'locked' | 'register' | 'email';
export function readRef(): string { try { return sessionStorage.getItem(REF_KEY) || ''; } catch { return ''; } }
export function trackRef(action: RefAction, slug = '', isAdmin = false, ref = '') {
  const stored = ref || readRef();
  if (!stored || isAdmin) return; // l'équipe qui teste un lien d'email ne compte pas comme une visite de la marque
  const quote = stored.startsWith('devis:');
  api.post('/ad-scans/ref', { ref: quote ? stored.slice(6) : stored, action, slug, source: quote ? 'quote' : 'lead' }).catch(() => null);
}
