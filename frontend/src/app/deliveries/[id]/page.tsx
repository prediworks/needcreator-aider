'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  useDelivery, 
  useUploadDeliverables, 
  useSubmitDelivery,
  useApproveDelivery,
  useRequestRevision 
} from '@/hooks/useDeliveries';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { 
  ArrowLeft, 
  Upload, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Clock,
  FileVideo,
  Download
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils';
import Link from 'next/link';

export default function DeliveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const deliveryId = params.id as string;
  
  const { data: delivery, isLoading } = useDelivery(deliveryId);
  const uploadMutation = useUploadDeliverables();
  const submitMutation = useSubmitDelivery();
  const approveMutation = useApproveDelivery();
  const revisionMutation = useRequestRevision();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Livraison introuvable</h2>
          <p className="text-neutral-600 mb-4">Cette livraison n'existe pas ou vous n'y avez pas accès</p>
          <Link href="/deliveries">
            <Button>Retour aux livraisons</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isCreator = user?.role === 'creator';
  const isBrand = user?.role === 'brand';
  const canUpload = isCreator && (delivery.status === 'pending' || delivery.status === 'revision_requested');
  const canSubmit = isCreator && delivery.files?.length > 0 && delivery.status !== 'submitted' && delivery.status !== 'approved';
  const canApprove = isBrand && delivery.status === 'submitted';
  const canRequestRevision = isBrand && delivery.status === 'submitted' && delivery.canRequestRevision;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    await uploadMutation.mutateAsync({
      deliveryId,
      files: selectedFiles,
    });
    
    setSelectedFiles([]);
  };

  const handleSubmit = async () => {
    await submitMutation.mutateAsync({
      deliveryId,
      notes,
    });
  };

  const handleApprove = async () => {
    if (confirm('Êtes-vous sûr de vouloir approuver cette livraison ? Le paiement sera effectué au créateur.')) {
      await approveMutation.mutateAsync(deliveryId);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionFeedback.trim()) return;
    
    await revisionMutation.mutateAsync({
      deliveryId,
      feedback: revisionFeedback,
    });
    
    setRevisionFeedback('');
    setShowRevisionForm(false);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      pending: { label: 'En attente', className: 'bg-yellow-100 text-yellow-700' },
      submitted: { label: 'Soumis', className: 'bg-blue-100 text-blue-700' },
      approved: { label: 'Approuvé', className: 'bg-green-100 text-green-700' },
      auto_approved: { label: 'Auto-approuvé', className: 'bg-green-100 text-green-700' },
      revision_requested: { label: 'Révision demandée', className: 'bg-orange-100 text-orange-700' },
    };
    
    const badge = badges[status] || { label: status, className: 'bg-neutral-100 text-neutral-700' };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Back Button */}
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
                    {delivery.campaignId?.title}
                  </h1>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(delivery.status)}
                    <span className="text-sm text-neutral-500">
                      {delivery.submittedAt 
                        ? `Soumis ${formatRelativeTime(delivery.submittedAt)}`
                        : `Créé ${formatRelativeTime(delivery.createdAt)}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Auto-approval warning */}
              {delivery.status === 'submitted' && delivery.daysUntilAutoApproval !== null && (
                <div className={`rounded-lg p-4 ${
                  delivery.daysUntilAutoApproval <= 2 
                    ? 'bg-red-50 border border-red-200' 
                    : 'bg-yellow-50 border border-yellow-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <Clock className={`w-5 h-5 ${
                      delivery.daysUntilAutoApproval <= 2 ? 'text-red-600' : 'text-yellow-600'
                    }`} />
                    <div>
                      <p className={`font-medium ${
                        delivery.daysUntilAutoApproval <= 2 ? 'text-red-900' : 'text-yellow-900'
                      }`}>
                        Auto-approbation dans {delivery.daysUntilAutoApproval} jour(s)
                      </p>
                      <p className={`text-sm ${
                        delivery.daysUntilAutoApproval <= 2 ? 'text-red-700' : 'text-yellow-700'
                      }`}>
                        {isBrand 
                          ? 'Validez ou demandez des révisions avant cette date'
                          : 'La livraison sera automatiquement approuvée si aucune action n\'est prise'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Participants */}
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-sm text-neutral-600 mb-1">Créateur</p>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-600 font-semibold text-sm">
                        {delivery.creatorId?.profile?.name?.[0]}
                      </span>
                    </div>
                    <span className="font-medium">{delivery.creatorId?.profile?.name}</span>
                  </div>
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

            {/* Files */}
            <Card className="p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Fichiers livrés ({delivery.files?.length || 0})
              </h2>

              {delivery.files?.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {delivery.files.map((file: any, index: number) => (
                    <div key={index} className="border border-neutral-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <FileVideo className="w-10 h-10 text-primary-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-900 truncate">
                            {file.filename || `Fichier ${index + 1}`}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {file.type} • {formatRelativeTime(file.uploadedAt)}
                          </p>
                          <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 mt-2"
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
                  Aucun fichier uploadé
                </div>
              )}

              {/* Upload Section (Creator only) */}
              {canUpload && (
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  <h3 className="font-medium text-neutral-900 mb-3">
                    {delivery.status === 'revision_requested' ? 'Uploader la révision' : 'Uploader les fichiers'}
                  </h3>
                  <div className="space-y-3">
                    <input
                      type="file"
                      multiple
                      accept="video/*"
                      onChange={handleFileSelect}
                      className="block w-full text-sm text-neutral-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary-50 file:text-primary-700
                        hover:file:bg-primary-100"
                    />
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
                          Uploader
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
                  Historique des révisions ({delivery.revisions.length})
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
                      <p className="text-neutral-700">{revision.feedback}</p>
                      {revision.resolvedAt && (
                        <p className="text-sm text-green-600 mt-2">
                          ✓ Résolu le {formatDate(revision.resolvedAt)}
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
                    <p className="text-sm font-medium text-neutral-700 mb-1">Note du créateur:</p>
                    <p className="text-neutral-600">{delivery.notes.creator}</p>
                  </div>
                )}
                {delivery.notes.brand && (
                  <div>
                    <p className="text-sm font-medium text-neutral-700 mb-1">Note de la marque:</p>
                    <p className="text-neutral-600">{delivery.notes.brand}</p>
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
                  <span className="text-neutral-600">Montant total</span>
                  <span className="font-semibold">{formatCurrency(delivery.payment?.amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-600">Frais plateforme</span>
                  <span>{formatCurrency(delivery.payment?.platformFee)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-neutral-200 pt-3">
                  <span className="text-neutral-600">Montant créateur</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(delivery.payment?.creatorAmount)}
                  </span>
                </div>
                <div className="pt-3 border-t border-neutral-200">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      delivery.payment?.status === 'released' ? 'bg-green-500' :
                      delivery.payment?.status === 'held' ? 'bg-yellow-500' :
                      'bg-neutral-300'
                    }`}></div>
                    <span className="text-sm text-neutral-600">
                      {delivery.payment?.status === 'released' ? 'Paiement effectué' :
                       delivery.payment?.status === 'held' ? 'Paiement en attente' :
                       'En attente'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Actions</h3>
              <div className="space-y-3">
                {/* Creator Actions */}
                {isCreator && canSubmit && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Note (optionnel)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ajoutez une note pour la marque..."
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

                {/* Brand Actions */}
                {isBrand && canApprove && (
                  <>
                    <Button 
                      className="w-full"
                      onClick={handleApprove}
                      isLoading={approveMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approuver
                    </Button>
                    
                    {canRequestRevision && !showRevisionForm && (
                      <Button 
                        variant="outline"
                        className="w-full"
                        onClick={() => setShowRevisionForm(true)}
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Demander une révision
                      </Button>
                    )}

                    {showRevisionForm && (
                      <div className="space-y-3 pt-3 border-t border-neutral-200">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">
                            Feedback pour la révision
                          </label>
                          <textarea
                            value={revisionFeedback}
                            onChange={(e) => setRevisionFeedback(e.target.value)}
                            placeholder="Expliquez ce qui doit être modifié..."
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
                            disabled={!revisionFeedback.trim()}
                          >
                            Envoyer
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setShowRevisionForm(false);
                              setRevisionFeedback('');
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Status info */}
                {delivery.status === 'approved' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Livraison approuvée</span>
                    </div>
                    {delivery.payment?.releasedAt && (
                      <p className="text-sm text-green-600 mt-2">
                        Paiement effectué le {formatDate(delivery.payment.releasedAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Campaign Link */}
            <Card className="p-6">
              <h3 className="font-semibold text-neutral-900 mb-3">Campagne</h3>
              <Link href={`/campaigns/${delivery.campaignId?._id}`}>
                <Button variant="outline" className="w-full">
                  Voir la campagne
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
