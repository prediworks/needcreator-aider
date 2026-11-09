import api from '@/lib/api';

/**
 * Télécharge le PDF d'un scan ou de son audit (fabriqué à la volée par le serveur). Renvoie un message d'erreur lisible, ou '' si c'est bon.
 * `ref` (équipe) : fiche prospect, le lien du PDF garde la référence pour suivre le clic de la marque.
 */
export async function downloadScanPdf(slug: string, { audit = false, ref = '' }: { audit?: boolean; ref?: string } = {}): Promise<string> {
  const q = [audit ? 'vue=audit' : '', ref ? `ref=${ref}` : ''].filter(Boolean).join('&');
  try {
    const r = await api.get(`/ad-scans/${slug}/pdf${q ? `?${q}` : ''}`, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data as Blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${audit ? 'audit' : 'publicites'}-${slug}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return '';
  } catch (e: any) {
    try { const t = await e?.response?.data?.text?.(); const m = JSON.parse(t || '{}').error; if (m) return m; } catch { /* réponse non JSON */ }
    return 'PDF indisponible pour le moment';
  }
}
