'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useRequireAuth } from '@/hooks/useAuth';
import {
  useDelivery,
  useUploadDeliverables,
  useSubmitDelivery,
  useApproveDelivery,
  useRequestRevision
} from '@/hooks/useDeliveries';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import VideoPlayer from '@/components/ui/VideoPlayer';
import ReviewForm, { Stars } from '@/components/ReviewForm';
import PaymentCard from '@/components/PaymentCard';
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  FileVideo,
  Download,
  Star,
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import { DELIVERY_STATUS, PAYMENT_STATUS, VIDEO_TYPES } from '@/lib/labels';
import Link from 'next/link';

export default function DeliveryDetailPage() {
  const params = useParams();
  const { user, ready } = useRequireAuth();
  const deliveryId = params.id as string;

  const { data: delivery, isLoading } = useDelivery(deliveryId, ready);
  const uploadMutation = useUploadDeliverables();
  const submitMutation = useSubmitDelivery();
  const approveMutation = useApproveDelivery();
  const revisionMutation = useRequestRevision();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  if (!ready || isLoading) return <Spinner />;

  if (!delivery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Livraison introuvable</h2>
          <p className="text-neutral-600 mb-4">Cette livraison n&apos;existe pas ou vous n&apos;y avez pas accès</p>
          <Link href="/deliveries">
            <Button>Retour aux livraisons</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isCreator = user?.role === 'creator';
  const isBrand = user?.role === 'brand';
  const isDone = ['approved', 'auto_approved'].includes(delivery.status);
  const canUpload = isCreator && (delivery.status === 'pending' || delivery.status === 'revision_requested');
  const canSubmit = isCreator && delivery.files?.length > 0 && (delivery.status === 'pending' || delivery.status === 'revision_requested');
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
    await uploadMutation.mutateAsync({ deliveryId, files: selectedFiles });
    setSelectedFiles([]);
  };

  const handleSubmit = async () => {
    if (!confirm('Soumettre la livraison à la marque ? Elle aura 7 jours pour valider ou demander une révision.')) return;
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
            Retour aux livraisons
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
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Fichiers livrés ({delivery.files?.length || 0})
              </h2>

              {delivery.files?.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {delivery.files.map((file: any, index: number) => (
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
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-1"
                          >
                            <Download className="w-4 h-4" />
                            Télécharger
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-neutral-500">
                  {isCreator ? 'Ajoutez vos vidéos ci-dessous' : 'Le créateur n\'a pas encore envoyé de fichier'}
                </div>
              )}

              {/* Upload Section (Creator only) */}
              {canUpload && (
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  <h3 className="font-medium text-neutral-900 mb-3">
                    {delivery.status === 'revision_requested' ? 'Envoyer la nouvelle version' : 'Envoyer mes vidéos'}
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
                          Envoyer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

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
                <div className="flex justify-between">
                  <span className="text-neutral-600">Prix de la mission</span>
                  <span className="font-semibold">{formatCurrency(delivery.payment?.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-600">Commission plateforme (10%)</span>
                  <span>{formatCurrency(delivery.payment?.platformFee)}</span>
                </div>
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
                    <Link href="/profile" className="text-sm text-primary-600 hover:underline block mt-2">
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
                        Soumettre la livraison
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
                          Demander une révision ({2 - (delivery.revisionCount || 0)} restante(s))
                        </Button>
                      )}
                      {!canRequestRevision && (
                        <p className="text-xs text-neutral-500 text-center">Nombre maximum de révisions atteint</p>
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
