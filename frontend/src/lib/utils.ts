import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string) {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'À l\'instant';
  if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `Il y a ${Math.floor(diffInSeconds / 86400)}j`;
  
  return formatDate(date);
}

/** Adresse lisible : domaine + chemin, sans « www », ni paramètres de suivi (utm, igsh…), tronquée au milieu si elle reste longue */
export function shortUrl(url: string, max = 46): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    const text = `${u.hostname.replace(/^www\./, '')}${path}`;
    if (text.length <= max) return text;
    const head = Math.ceil((max - 1) * 0.6), tail = Math.floor((max - 1) * 0.4);
    return `${text.slice(0, head)}…${text.slice(-tail)}`;
  } catch { return url.length > max ? `${url.slice(0, max - 1)}…` : url; }
}
