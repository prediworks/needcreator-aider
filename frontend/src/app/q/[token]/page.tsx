'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { VIDEO_TYPES, PLATFORMS, RIGHTS_DURATION, RIGHTS_SUPPORTS } from '@/lib/labels';
import { Shield, FileSignature, ExternalLink, CheckCircle, Star } from 'lucide-react';

/** Page publique d'un devis : le client accepte et paie via NeedCreator, ou décline */
export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['public-quote', token], queryFn: async () => (await api.get(`/external-quotes/public/${token}`)).data.quote, enabled: !!token });
  const accept = useMutation({
    mutationFn: async () => (await api.post(`/external-quotes/public/${token}/accept`)).data,
    onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); if (d.deliveryId) router.push(`/deliveries/${d.deliveryId}`); },
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 10000 }),
  });
  const decline = useMutation({ mutationFn: async (reason: string) => (await api.post(`/external-quotes/public/${token}/decline`, { reason })).data, onSuccess: (d) => { toast.success(d.message); router.refresh(); window.location.reload(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  if (isLoading || loading) return <Spinner />;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center"><Card className="p-8 text-center"><p className="text-neutral-700">Ce devis est introuvable ou n&apos;est plus disponible.</p></Card></div>;
  const q = data;
  const open = ['draft', 'sent'].includes(q.status);
  const vat = Math.round(q.quote.price * (q.quote.vatRate || 0)) / 100;
  return (
    <div className="min-h-screen bg-neutral-50 py-10">
      <div className="container mx-auto px-4 max-w-3xl space-y-6">
        <Card className="p-6 md:p-8">
          <div className="text-sm text-primary-700 font-medium mb-1">Devis {q.pdf?.number} · de {q.creator.name} pour {q.client.companyName}</div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">{q.mission.title}</h1>
          <div className="text-sm text-neutral-600 mb-4 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500" /> {q.creator.totalReviews ? `${Number(q.creator.rating).toFixed(1)} / 5 (${q.creator.totalReviews} avis)` : 'Créateur NeedCreator'} · {q.creator.completedJobs} mission(s) validée(s)</span>
            {q.creator.slug && <Link href={`/c/${q.creator.slug}`} className="text-primary-600 underline">Voir son portfolio</Link>}
          </div>
          {q.mission.description && <p className="text-neutral-700 whitespace-pre-line mb-4">{q.mission.description}</p>}
          <div className="grid sm:grid-cols-2 gap-3 text-sm mb-4">
            <div className="bg-neutral-50 rounded-lg p-3"><div className="text-neutral-500 text-xs">Livrable</div>{q.mission.deliverables} vidéo{q.mission.deliverables > 1 ? 's' : ''} · {VIDEO_TYPES[q.mission.videoType] || q.mission.videoType} · {q.mission.duration} s{q.mission.platforms?.length ? ` · ${q.mission.platforms.map((p: string) => PLATFORMS[p] || p).join(', ')}` : ''}</div>
            <div className="bg-neutral-50 rounded-lg p-3"><div className="text-neutral-500 text-xs">Délai et révisions</div>{q.quote.estimatedDeliveryDays} jour(s) après acceptation · {q.quote.revisions} révision(s) incluse(s)</div>
            <div className="bg-neutral-50 rounded-lg p-3 sm:col-span-2"><div className="text-neutral-500 text-xs">Droits cédés</div>{RIGHTS_DURATION[q.quote.rights?.duration] || '1 an'} · {(q.quote.rights?.supports || []).map((s: string) => RIGHTS_SUPPORTS[s]?.split(' (')[0] || s).join(', ')} · {q.quote.rights?.territories || 'France'}{q.quote.rights?.exclusivity ? ` · exclusivité ${q.quote.rights.exclusivityMonths || ''} mois` : ''}</div>
            {q.quote.terms && <div className="bg-neutral-50 rounded-lg p-3 sm:col-span-2"><div className="text-neutral-500 text-xs">Conditions</div>{q.quote.terms}</div>}
          </div>
          <div className="flex items-end justify-between gap-3 flex-wrap border-t border-neutral-100 pt-4">
            <div className="text-xs flex gap-3 flex-wrap">
              {q.pdf?.quoteUrl && <a href={q.pdf.quoteUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Devis PDF</a>}
              {q.pdf?.contractUrl && <a href={q.pdf.contractUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 underline inline-flex items-center gap-1"><FileSignature className="w-3 h-3" /> Projet de contrat de cession</a>}
            </div>
            <div className="text-right"><div className="text-sm text-neutral-500">{q.quote.vatRate ? `${formatCurrency(q.quote.price)} HT + TVA ${q.quote.vatRate} %` : 'TVA non applicable'}</div><div className="text-2xl font-bold text-neutral-900">{formatCurrency(q.quote.price + vat)}{q.quote.vatRate ? ' TTC' : ''}</div><div className="text-xs text-neutral-500">Valable jusqu&apos;au {formatDate(q.quote.validUntil)}</div></div>
          </div>
        </Card>

        {open ? (
          <Card className="p-6 border-primary-200 bg-primary-50/40">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2 mb-1"><Shield className="w-5 h-5 text-primary-600" /> Accepter et payer en toute sécurité via NeedCreator</h2>
            <p className="text-sm text-neutral-700 mb-4">Le montant est bloqué sur votre carte, pas débité, et versé à {q.creator.name} seulement après votre validation des vidéos. Le contrat de cession de droits est généré automatiquement, vous recevez une facture, et les révisions prévues au devis sont garanties. Sans frais ajoutés au devis.</p>
            {user?.role === 'brand' ? (
              <Button size="lg" onClick={() => accept.mutate()} isLoading={accept.isPending}><CheckCircle className="w-4 h-4 mr-2" /> Accepter et payer {formatCurrency(q.quote.price + vat)}</Button>
            ) : user ? (
              <p className="text-sm text-neutral-600">Vous êtes connecté avec un compte créateur. Connectez-vous avec le compte de l&apos;entreprise cliente pour accepter.</p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <Link href={`/register?role=brand&quote=${token}`}><Button size="lg" className="w-full sm:w-auto"><CheckCircle className="w-4 h-4 mr-2" /> Accepter : créer mon compte et payer</Button></Link>
                <Link href="/login" className="text-sm text-primary-600 underline">Déjà un compte marque ? Connectez-vous puis revenez sur cette page</Link>
              </div>
            )}
            <div className="mt-4 text-xs text-neutral-500">Vous préférez régler {q.creator.name} directement ? Dites-le lui : le devis et le contrat PDF restent valables, sans passer par NeedCreator. <button type="button" className="underline ml-2" onClick={() => { const r = prompt('Décliner ce devis ? Un mot pour le créateur (optionnel) :'); if (r !== null) decline.mutate(r); }}>Décliner le devis</button></div>
          </Card>
        ) : (
          <Card className="p-6 text-sm text-neutral-700">
            {q.status === 'accepted_needcreator' ? <>Devis accepté et réglé via NeedCreator. {user?.role === 'brand' && q.deliveryId && <Link href={`/deliveries/${q.deliveryId}`} className="text-primary-600 underline">Voir la mission</Link>}</> : q.status === 'accepted_direct' ? 'Devis accepté, réglé directement auprès du créateur.' : q.status === 'declined' ? 'Devis décliné.' : 'Ce devis a expiré : demandez-en un nouveau au créateur.'}
          </Card>
        )}
      </div>
    </div>
  );
}
