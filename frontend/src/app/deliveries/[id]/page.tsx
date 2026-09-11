'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useRequireAuth } from '@/hooks/useAuth';
import {
  useDelivery,
  useUploadDeliverables,
  useSubmitDelivery,
  useApproveDelivery,
  useRequestRevision,
  useAddLinks,
  useRemoveItem,
  useSetLinkVisibility,
} from '@/hooks/useDeliveries';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import ReviewForm, { Stars } from '@/components/ReviewForm';
import PaymentCard from '@/components/PaymentCard';
import ShippingCard from '@/components/ShippingCard';
import DisputeCard from '@/components/DisputeCard';
import PerformanceCard from '@/components/PerformanceCard';
import ReadyPackCard from '@/components/ReadyPackCard';
import ContractCard from '@/components/ContractCard';
import ComplianceCard from '@/components/ComplianceCard';
import ReplacementCard from '@/components/ReplacementCard';
import ShopifyProductPicker from '@/components/ShopifyProductPicker';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  FileVideo,
  Download,
  Star,
  Link2,
  Trash2,
  Globe,
  Lock,
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { DELIVERY_STATUS, PAYMENT_STATUS, VIDEO_TYPES, PLATFORMS, DELIVERY_TYPES } from '@/lib/labels';
import Link from 'next/link';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { plural } from '@/lib/publicConfig';

export default function DeliveryDetailPage() {
  const params = useParams();
  const { user, ready } = useRequireAuth();
  const deliveryId = params.id as string;

  const { data: delivery, isLoading } = useDelivery(deliveryId, ready);
  const uploadMutation = useUploadDeliverables();
  const submitMutation = useSubmitDelivery();
  const approveMutation = useApproveDelivery();
  const revisionMutation = useRequestRevision();
  const addLinksMutation = useAddLinks();
  const removeItemMutation = useRemoveItem();
  const visibilityMutation = useSetLinkVisibility();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const shopifyPublish = useMutation({
    mutationFn: async (productId: string) => (await api.post(`/integrations/shopify/deliveries/${deliveryId}/publish`, { productId })).data,
    onSuccess: (d) => toast.success(d.message),
    onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }),
  });
  const [notes, setNotes] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const cfg = usePublicConfig();

  if (!ready || isLoading) return <Spinner />;

  if (!delivery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{user?.role === 'creator' ? 'Mission introuvable' : 'Livraison introuvable'}</h2>
          <p className="text-neutral-600 mb-4">{user?.role === 'creator' ? 'Cette mission' : 'Cette livraison'} n&apos;existe pas ou vous n&apos;y avez pas accès</p>
          <Link href="/deliveries">
            <Button>{user?.role === 'creator' ? 'Retour aux missions' : 'Retour aux livraisons'}</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isCreator = user?.role === 'creator';
  const isBrand = user?.role === 'brand';
  const isDone = ['approved', 'auto_approved'].includes(delivery.status);
  const canUpload = isCreator && (delivery.status === 'pending' || delivery.status === 'revision_requested');
  const expected = delivery.campaignId?.brief?.deliverables || 1;
  const currentFiles: any[] = (delivery.files || []).filter((f: any) => !f.superseded);
  const currentLinks: any[] = (delivery.links || []).filter((l: any) => !l.superseded);
  const previousItems: any[] = [...(delivery.files || []), ...(delivery.links || [])].filter((i: any) => i.superseded);
  const itemCount = currentFiles.length + currentLinks.length;
  const allowedTypes: string[] = delivery.campaignId?.brief?.deliveryTypes || ['file', 'link'];
  const canSubmit = isCreator && itemCount > 0 && itemCount <= expected && (delivery.status === 'pending' || delivery.status === 'revision_requested');
  const canApprove = isBrand && delivery.status === 'submitted';
  const canRequestRevision = isBrand && delivery.status === 'submitted' && delivery.canRequestRevision;
  const campaign = delivery.campaignId || {};
  const paymentPending = !!delivery.payment?.stripePaymentIntentId && ['pending', 'failed'].includes(delivery.payment?.status);
  const otherPartyName = isBrand ? delivery.creatorId?.profile?.name : delivery.brandId?.profile?.companyName;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploadProgress(0);
    try {
      await uploadMutation.mutateAsync({ deliveryId, files: selectedFiles, onProgress: setUploadProgress });
    } finally {
      setUploadProgress(null);
    }
    setSelectedFiles([]);
  };

  const handleAddLinks = async () => {
    const urls = linkInput.split(/\n|,|\s+/).map(u => u.trim()).filter(u => /^https?:\/\//.test(u));
    if (urls.length === 0) return;
    await addLinksMutation.mutateAsync({ deliveryId, links: urls.map(url => ({ url, public: true })) });
    setLinkInput('');
  };

  const isLinkPublic = (l: any) => l.visibility?.creator !== false && l.visibility?.brand !== false;
  const myConsent = (l: any) => (isBrand ? l.visibility?.brand !== false : l.visibility?.creator !== false);

  const handleSubmit = async () => {
    if (!confirm(`Soumettre mes vidéos à la marque ? Elle aura ${plural(cfg.autoApprovalDays, 'jour')} pour valider ou demander une révision.`)) return;
    await submitMutation.mutateAsync({ deliveryId, notes });
  };

  const handleApprove = async () => {
    if (confirm(`Approuver cette livraison ?\n\nLe paiement de ${formatCurrency(delivery.payment?.creatorAmount)} sera versé au créateur. Cette action est définitive.`)) {
      await approveMutation.mutateAsync(deliveryId);
    }
  };

  const handleRequestRevision = async () => {
    if (revisionFeedback.trim().length < 20) return;
    await revisionMutation.mutateAsync({ deliveryId, feedback: revisionFeedback });
    setRevisionFeedback('');
    setShowRevisionForm(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <Link href="/deliveries">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {isCreator ? 'Retour aux missions' : 'Retour aux livraisons'}
          </Button>
        </Link>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <Card className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900 mb-2">
                    {campaign.title}
                  </h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge map={DELIVERY_STATUS} value={delivery.status} />
                    <span className="text-sm text-neutral-500">
                      {delivery.submittedAt
                        ? `Soumise ${formatRelativeTime(delivery.submittedAt)}`
                        : `Créée ${formatRelativeTime(delivery.createdAt)}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Étapes */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs mb-4">
                {[
                  ['Fichiers', !['pending'].includes(delivery.status) || delivery.files?.length > 0],
                  ['Soumission', ['submitted', 'revision_requested', 'approved', 'auto_approved'].includes(delivery.status)],
                  ['Validation', isDone],
                  ['Paiement', delivery.payment?.status === 'released'],
                ].map(([labelText, done], i) => (
                  <div key={i} className={`rounded-lg py-2 ${done ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}>
                    {done ? '✓ ' : ''}{labelText as string}
                  </div>
                ))}
              </div>

              {/* Auto-approval warning */}
              {delivery.status === 'submitted' && delivery.daysUntilAutoApproval !== null && (
                <div className={`rounded-lg p-4 ${
                  delivery.daysUntilAutoApproval <= 2
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-yellow-50 border border-yellow-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <Clock className={`w-5 h-5 ${delivery.daysUntilAutoApproval <= 2 ? 'text-red-600' : 'text-yellow-600'}`} />
                    <div>
                      <p className={`font-medium ${delivery.daysUntilAutoApproval <= 2 ? 'text-red-900' : 'text-yellow-900'}`}>
                        Approbation automatique dans {delivery.daysUntilAutoApproval} jour(s)
                      </p>
                      <p className={`text-sm ${delivery.daysUntilAutoApproval <= 2 ? 'text-red-700' : 'text-yellow-700'}`}>
                        {isBrand
                          ? 'Validez ou demandez une révision avant cette date, sinon le paiement sera libéré automatiquement.'
                          : 'La livraison sera automatiquement approuvée si la marque ne répond pas.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Participants */}
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Créateur</p>
                  <Link href={`/profile/${delivery.creatorId?._id}`} className="flex items-center gap-2 hover:text-primary-600">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-semibold text-sm">
                        {delivery.creatorId?.profile?.name?.[0]}
                      </span>
                    </div>
                    <span className="font-medium">{delivery.creatorId?.profile?.name}</span>
                  </Link>
                </div>
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Marque</p>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold text-sm">
                        {delivery.brandId?.profile?.companyName?.[0]}
                      </span>
                    </div>
                    <span className="font-medium">{delivery.brandId?.profile?.companyName}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Paiement à confirmer (marque) */}
            {isBrand && paymentPending && <PaymentCard deliveryId={deliveryId} />}

            {isCreator && paymentPending && (
              <Card className="p-4 bg-yellow-50 border-yellow-200">
                <p className="text-sm text-yellow-800">
                  ⏳ La marque n&apos;a pas encore confirmé le paiement. Vous pouvez préparer votre contenu, mais attendez la confirmation avant de démarrer une production coûteuse.
                </p>
              </Card>
            )}

            {/* Litige : refus définitif (révisions épuisées), réponse du créateur, décision */}
            {(isBrand || isCreator) && <DisputeCard delivery={delivery} role={isBrand ? 'brand' : 'creator'} />}

            {/* Retard et garantie de remplacement (marque) */}
            {isBrand && <ReplacementCard delivery={delivery} />}

            {/* Envoi du produit */}
            {(delivery.shipping?.required || delivery.shipping?.status !== 'none' || isBrand) && !isDone && (
              <ShippingCard delivery={delivery} role={isBrand ? 'brand' : 'creator'} />
            )}

            {/* Brief (rappel) */}
            {campaign.brief && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-neutral-900">Brief</h2>
                  <Link href={`/campaigns/${campaign._id}`} className="text-sm text-primary-600 hover:underline">Voir la campagne</Link>
                </div>
                <div className="text-sm text-neutral-700 space-y-2">
                  <div>
                    <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs mr-2">{VIDEO_TYPES[campaign.brief.videoType] || campaign.brief.videoType}</span>
                    {campaign.brief.deliverables} vidéo(s) de {campaign.brief.duration}s
                  </div>
                  {campaign.brief.requirements?.length > 0 && (
                    <ul className="list-disc list-inside">
                      {campaign.brief.requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                </div>
              </Card>
            )}

            {/* Files */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Vidéos livrées
                </h2>
                <span className={`text-sm font-medium px-2 py-1 rounded-full ${itemCount === expected ? 'bg-green-100 text-green-800' : itemCount > expected ? 'bg-red-100 text-red-800' : 'bg-neutral-100 text-neutral-700'}`}>
                  {itemCount} / {expected} attendue(s)
                </span>
              </div>
              <p className="text-xs text-neutral-500 mb-4">Livraison acceptée : {allowedTypes.map((t: string) => DELIVERY_TYPES[t]).join(' ou ')}.</p>

              {currentLinks.length > 0 && (
                <div className="space-y-2 mb-4">
                  {currentLinks.map((l: any) => (
                    <div key={l._id} className="border border-neutral-200 rounded-lg p-3 flex items-start gap-3">
                      <Link2 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary-700 hover:underline break-all">
                          {l.title || l.url}
                        </a>
                        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 bg-neutral-100 rounded">{PLATFORMS[l.platform] || l.platform}</span>
                          <span>{formatRelativeTime(l.addedAt)}</span>
                          <span className={`flex items-center gap-1 ${isLinkPublic(l) ? 'text-green-700' : 'text-neutral-600'}`}>
                            {isLinkPublic(l) ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {isLinkPublic(l) ? 'Public (visible sur le profil du créateur)' : 'Privé'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(isBrand || isCreator) && (
                          <label className="flex items-center gap-1 text-xs text-neutral-600 whitespace-nowrap" title="Le lien n'est public que si la marque et le créateur l'acceptent">
                            <input
                              type="checkbox"
                              checked={myConsent(l)}
                              onChange={(e) => visibilityMutation.mutate({ deliveryId, linkId: l._id, isPublic: e.target.checked })}
                            />
                            J&apos;accepte qu&apos;il soit public
                          </label>
                        )}
                        {canUpload && (
                          <button onClick={() => removeItemMutation.mutate({ deliveryId, itemId: l._id })} className="text-red-500 hover:text-red-700 p-1" title="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentFiles.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {currentFiles.map((file: any, index: number) => (
                    <div key={index} className="border border-neutral-200 rounded-lg overflow-hidden">
                      {file.type === 'video' ? (
                        <VideoPlayer src={file.url} title={file.filename} className="rounded-none" />
                      ) : file.type === 'image' ? (
                        <img src={file.url} alt={file.filename} className="w-full max-h-80 object-contain bg-black" />
                      ) : null}
                      <div className="p-3 flex items-start gap-3">
                        <FileVideo className="w-6 h-6 text-primary-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-900 truncate text-sm">
                            {file.filename || `Fichier ${index + 1}`}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {formatRelativeTime(file.uploadedAt)}{file.size ? ` · ${(file.size / 1024 / 1024).toFixed(1)} Mo` : ''}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                            >
                              <Download className="w-4 h-4" />
                              Télécharger
                            </a>
                            {canUpload && file._id && (
                              <button onClick={() => removeItemMutation.mutate({ deliveryId, itemId: file._id })} className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                                <Trash2 className="w-4 h-4" /> Supprimer
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : currentLinks.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  {isCreator
                    ? (delivery.status === 'revision_requested' ? 'Envoyez la nouvelle version de vos vidéos (fichier ou lien)' : 'Ajoutez vos vidéos ci-dessous (fichier ou lien)')
                    : 'Le créateur n\'a pas encore envoyé de vidéo'}
                </div>
              ) : null}

              {previousItems.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-neutral-600">Versions précédentes ({previousItems.length})</summary>
                  <ul className="mt-2 space-y-1 text-neutral-600">
                    {previousItems.map((i: any) => (
                      <li key={i._id}>
                        <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">{i.filename || i.title || i.url}</a>
                        <span className="text-xs text-neutral-400"> · {formatRelativeTime(i.uploadedAt || i.addedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Upload Section (Creator only) */}
              {canUpload && allowedTypes.includes('link') && itemCount < expected && (
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  <h3 className="font-medium text-neutral-900 mb-1 flex items-center gap-2"><Link2 className="w-4 h-4" /> Ajouter un lien</h3>
                  <p className="text-xs text-neutral-500 mb-2">Une URL par ligne : publication TikTok / Instagram / YouTube, ou lien Drive / WeTransfer. Un lien = une vidéo.</p>
                  <textarea
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder={'https://www.tiktok.com/@moi/video/123\nhttps://drive.google.com/...'}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    rows={2}
                  />
                  <Button size="sm" className="mt-2" onClick={handleAddLinks} isLoading={addLinksMutation.isPending} disabled={!/https?:\/\//.test(linkInput)}>
                    Ajouter le(s) lien(s)
                  </Button>
                </div>
              )}

              {canUpload && itemCount >= expected && (
                <div className="mt-6 pt-6 border-t border-neutral-200 text-sm text-green-700">
                  ✓ Vous avez atteint le nombre de vidéos attendu. Vous pouvez soumettre vos vidéos.
                </div>
              )}

              {canUpload && allowedTypes.includes('file') && itemCount < expected && (
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  <h3 className="font-medium text-neutral-900 mb-3">
                    {delivery.status === 'revision_requested' ? 'Envoyer la nouvelle version (fichier)' : 'Envoyer un fichier vidéo'}
                  </h3>
                  <div className="space-y-3">
                    <input
                      type="file"
                      multiple
                      accept="video/*,image/*"
                      onChange={handleFileSelect}
                      className="block w-full text-sm text-neutral-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary-50 file:text-primary-700
                        hover:file:bg-primary-100"
                    />
                    <p className="text-xs text-neutral-500">Formats vidéo (MP4, MOV...) jusqu&apos;à 500 Mo par fichier.</p>
                    {selectedFiles.length > 0 && (
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-neutral-600">
                          {selectedFiles.length} fichier(s) sélectionné(s)
                        </p>
                        <Button
                          size="sm"
                          onClick={handleUpload}
                          isLoading={uploadMutation.isPending}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {uploadMutation.isPending && uploadProgress !== null ? (uploadProgress < 100 ? `Envoi ${uploadProgress} %` : 'Enregistrement…') : 'Envoyer'}
                        </Button>
                      </div>
                    )}
                    {uploadProgress !== null && (
                      <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden" aria-label="Progression de l'envoi">
                        <div className="h-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Conformité au brief (après soumission) */}
            {(isBrand || isCreator) && <ComplianceCard delivery={delivery} role={isBrand ? 'brand' : 'creator'} />}

            {/* Revisions History */}
            {delivery.revisions?.length > 0 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                  Révisions ({delivery.revisions.length}/2)
                </h2>
                <div className="space-y-4">
                  {delivery.revisions.map((revision: any, index: number) => (
                    <div key={index} className="border-l-4 border-orange-500 pl-4 py-2">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        <span className="font-medium text-neutral-900">
                          Révision #{index + 1}
                        </span>
                        <span className="text-sm text-neutral-500">
                          {formatRelativeTime(revision.requestedAt)}
                        </span>
                      </div>
                      <p className="text-neutral-700 whitespace-pre-line">{revision.feedback}</p>
                      {revision.resolvedAt && (
                        <p className="text-sm text-green-600 mt-2">
                          ✓ Nouvelle version envoyée le {formatDate(revision.resolvedAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Notes */}
            {(delivery.notes?.creator || delivery.notes?.brand) && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">Notes</h2>
                {delivery.notes.creator && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-neutral-700 mb-1">Note du créateur</p>
                    <p className="text-neutral-600 whitespace-pre-line">{delivery.notes.creator}</p>
                  </div>
                )}
                {delivery.notes.brand && (
                  <div>
                    <p className="text-sm font-medium text-neutral-700 mb-1">Note de la marque</p>
                    <p className="text-neutral-600 whitespace-pre-line">{delivery.notes.brand}</p>
                  </div>
                )}
              </Card>
            )}

            {/* Contrat de mission et droits (les deux parties) */}
            {(isBrand || isCreator) && <ContractCard delivery={delivery} role={isBrand ? 'brand' : 'creator'} />}

            {/* Pack prêt à diffuser (marque, après validation) */}
            {isDone && isBrand && <ReadyPackCard delivery={delivery} />}

            {/* Publication Shopify (marque, après validation) */}
            {isDone && isBrand && (
              <ShopifyProductPicker buttonLabel="Publier les vidéos sur cette fiche" onPick={(p) => shopifyPublish.mutate(String(p.id))} />
            )}

            {/* Performances (après validation) */}
            {isDone && <PerformanceCard delivery={delivery} />}

            {/* Avis */}
            {isDone && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" /> Avis
                </h2>
                {delivery.myReview ? (
                  <div className="mb-4 bg-neutral-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-neutral-700 mb-1">Votre avis sur {otherPartyName}</p>
                    <Stars value={delivery.myReview.rating} size="w-5 h-5" />
                    {delivery.myReview.comment && <p className="text-neutral-700 mt-2">{delivery.myReview.comment}</p>}
                  </div>
                ) : (
                  <ReviewForm campaignId={campaign._id} revieweeName={otherPartyName || ''} />
                )}
                {delivery.receivedReview && (
                  <div className="mt-4 bg-green-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-neutral-700 mb-1">Avis reçu de {otherPartyName}</p>
                    <Stars value={delivery.receivedReview.rating} size="w-5 h-5" />
                    {delivery.receivedReview.comment && <p className="text-neutral-700 mt-2">{delivery.receivedReview.comment}</p>}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Payment Info */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Paiement</h3>
              <div className="space-y-3">
                {campaign.type === 'gifting' && <div className="text-xs text-pink-800 bg-pink-50 rounded p-2 mb-2">🎁 Gifting : produit offert ({campaign.gifting?.productName}, {formatCurrency(campaign.gifting?.productValue || 0)}). La marque paie uniquement les frais de plateforme.</div>}
                {delivery.payment?.discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Prix du devis</span>
                    <span>{formatCurrency(delivery.payment?.quotePrice)}</span>
                  </div>
                )}
                {delivery.payment?.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-700">
                    <span>Remise parrainage ({delivery.payment?.discountPercent} %)</span>
                    <span>− {formatCurrency(delivery.payment?.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-600">{campaign.type === 'gifting' ? 'Frais de plateforme' : isBrand ? 'Prix payé' : 'Prix de la mission'}</span>
                  <span className="font-semibold">{formatCurrency(delivery.payment?.amount)}</span>
                </div>
                {campaign.type !== 'gifting' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Commission NeedCreator ({delivery.payment?.platformFeePercent ?? 10} %{delivery.payment?.discountAmount > 0 ? ', remise déduite' : ''})</span>
                    <span>{formatCurrency(delivery.payment?.platformFee)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-neutral-200 pt-3">
                  <span className="text-neutral-600">Net créateur</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(delivery.payment?.creatorAmount)}
                  </span>
                </div>
                <div className="pt-3 border-t border-neutral-200">
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      delivery.payment?.status === 'released' ? 'bg-green-500' :
                      ['held', 'captured'].includes(delivery.payment?.status) ? 'bg-yellow-500' :
                      'bg-neutral-300'
                    }`}></div>
                    <span className="text-sm text-neutral-600">
                      {PAYMENT_STATUS[delivery.payment?.status] || delivery.payment?.status}
                    </span>
                  </div>
                  {isCreator && delivery.payment?.status === 'captured' && (
                    <Link href="/profile#stripe" className="text-sm text-primary-600 hover:underline block mt-2">
                      → Connecter mon compte Stripe pour recevoir le virement
                    </Link>
                  )}
                </div>
              </div>
            </Card>

            {/* Actions */}
            {(canSubmit || canApprove || isDone) && (
              <Card className="p-6">
                <h3 className="font-semibold text-neutral-900 mb-4">Actions</h3>
                <div className="space-y-3">
                  {canSubmit && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Message pour la marque (optionnel)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Ex : la vidéo 2 existe aussi en version sans musique..."
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          rows={3}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleSubmit}
                        isLoading={submitMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Soumettre mes vidéos
                      </Button>
                    </>
                  )}

                  {canApprove && (
                    <>
                      <Button
                        className="w-full"
                        onClick={handleApprove}
                        isLoading={approveMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approuver et payer
                      </Button>

                      {canRequestRevision && !showRevisionForm && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setShowRevisionForm(true)}
                        >
                          <AlertCircle className="w-4 h-4 mr-2" />
                          Demander une révision ({Math.max(0, (delivery.maxRevisions ?? 2) - (delivery.revisionCount || 0))} restante(s))
                        </Button>
                      )}
                      {!canRequestRevision && (
                        <p className="text-xs text-neutral-500 text-center">Révisions prévues au devis épuisées : approuvez, ou demandez un refus définitif ci-dessous.</p>
                      )}

                      {showRevisionForm && (
                        <div className="space-y-3 pt-3 border-t border-neutral-200">
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                              Ce qui doit être modifié (20 caractères minimum)
                            </label>
                            <textarea
                              value={revisionFeedback}
                              onChange={(e) => setRevisionFeedback(e.target.value)}
                              placeholder="Soyez précis : quelle vidéo, quel moment, quel changement attendu..."
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                              rows={4}
                              required
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              className="flex-1"
                              onClick={handleRequestRevision}
                              isLoading={revisionMutation.isPending}
                              disabled={revisionFeedback.trim().length < 20}
                            >
                              Envoyer
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => { setShowRevisionForm(false); setRevisionFeedback(''); }}
                            >
                              Annuler
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {isDone && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">
                          {delivery.status === 'auto_approved' ? 'Approuvée automatiquement' : 'Livraison approuvée'}
                        </span>
                      </div>
                      {delivery.approvedAt && (
                        <p className="text-sm text-green-600 mt-2">
                          le {formatDate(delivery.approvedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
