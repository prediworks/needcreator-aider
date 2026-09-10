import { config } from '../config/index.js';

/**
 * Les liens générés par Firebase pointent vers <projet>.firebaseapp.com/__/auth/action?…
 * Certains filtres anti-spam (OVH notamment) suppriment les emails contenant ce domaine.
 * On fait passer le lien par notre propre page /auth/action, qui applique le code avec le SDK Firebase.
 */
export function rewriteActionLink(link) {
  try {
    const url = new URL(link);
    if (!url.pathname.endsWith('/__/auth/action')) return link;
    const ours = new URL('/auth/action', config.cors.origin);
    ours.search = url.search;
    return ours.toString();
  } catch {
    return link;
  }
}
