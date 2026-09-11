'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { FileSignature, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  micro: 'Micro-entrepreneur (auto-entrepreneur)',
  company: 'Société (SAS, SARL, EURL…)',
  individual: 'Particulier (activité occasionnelle)',
};

/**
 * Informations administratives : elles figurent sur le contrat de mission de chaque collaboration.
 * Créateur : identité, statut, SIRET, adresse. Marque : signataire.
 */
export default function LegalInfoCard({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const isBrand = profile.role === 'brand';
  const li = profile.legalInfo || {};
  const complete = !!profile.hasLegalInfo;
  const [editing, setEditing] = useState(!complete);
  const [form, setForm] = useState<any>({
    firstName: li.firstName || '', lastName: li.lastName || '', status: li.status || 'micro', companyName: li.companyName || '', siret: li.siret || '',
    address: { line1: '', line2: '', postalCode: '', city: '', country: 'France', ...(li.address || {}) },
    individualAcknowledged: !!li.individualAcknowledged,
    vatRegistered: !!li.vatRegistered, vatNumber: li.vatNumber || '', billingMandate: !!li.billingMandateAcceptedAt,
    signatoryName: li.signatoryName || '', signatoryTitle: li.signatoryTitle || '',
  });
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });
  const setAddr = (k: string, v: string) => setForm({ ...form, address: { ...form.address, [k]: v } });

  const save = useMutation({
    mutationFn: async () => {
      const body = isBrand
        ? { signatoryName: form.signatoryName, signatoryTitle: form.signatoryTitle }
        : { firstName: form.firstName, lastName: form.lastName, status: form.status, companyName: form.companyName, siret: form.status === 'individual' ? '' : form.siret, address: form.address, individualAcknowledged: form.individualAcknowledged, vatRegistered: form.status !== 'individual' && form.vatRegistered, vatNumber: form.vatRegistered ? form.vatNumber : '', billingMandate: form.billingMandate };
      return (await api.put('/auth/legal-info', body)).data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refreshUser();
      setEditing(false);
      toast.success(data.registry ? `Informations enregistrées (${data.registry.legalName} vérifiée au registre)` : 'Informations enregistrées');
    },
    onError: (e: any) => toast.error(getErrorMessage(e, 'Enregistrement impossible'), { duration: 8000 }),
  });

  // Ce qui manque pour enregistrer (affiché sous le bouton, pour ne jamais laisser un bouton grisé sans explication)
  const missing: string[] = isBrand
    ? (form.signatoryName.trim().length >= 2 ? [] : ['le nom du signataire'])
    : [
        !form.firstName && 'le prénom', !form.lastName && 'le nom',
        form.status !== 'individual' && form.siret.replace(/\s/g, '').length !== 14 && `un SIRET de 14 chiffres (${form.siret.replace(/\s/g, '').length} saisis)`,
        form.status === 'individual' && !form.individualAcknowledged && 'la déclaration « activité occasionnelle »',
        form.vatRegistered && form.vatNumber.trim().length < 4 && 'le numéro de TVA intracommunautaire',
        !form.address.line1 && "l'adresse", !form.address.postalCode && 'le code postal', !form.address.city && 'la ville',
        !form.billingMandate && 'la case « Mandat de facturation » (en bas du formulaire)',
      ].filter(Boolean) as string[];
  const canSave = missing.length === 0;

  return (
    <Card className={`p-6 ${!complete ? 'border-orange-300 bg-orange-50/40' : ''}`}>
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary-500" /> Informations administratives</h2>
        {!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Modifier</Button>}
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        {isBrand
          ? 'Le nom du signataire figure sur le contrat de mission généré à chaque devis accepté. Obligatoire pour accepter un devis.'
          : 'Ces informations figurent sur le contrat de mission et de cession de droits de chaque collaboration. Obligatoires pour envoyer un devis. Elles ne sont visibles que des marques avec lesquelles vous collaborez.'}
      </p>

      {!editing ? (
        <div className="text-sm text-neutral-700 space-y-1">
          {complete ? (
            <div className="flex items-center gap-2 text-green-700 mb-2"><CheckCircle className="w-4 h-4" /> Complètes</div>
          ) : (
            <div className="flex items-center gap-2 text-orange-700 mb-2"><AlertTriangle className="w-4 h-4" /> À compléter</div>
          )}
          {isBrand ? (
            <div>Signataire : <strong>{li.signatoryName}</strong>{li.signatoryTitle ? `, ${li.signatoryTitle}` : ''}</div>
          ) : (
            <>
              <div><strong>{li.firstName} {li.lastName}</strong> · {STATUS_LABELS[li.status] || '—'}</div>
              {li.legalName && <div>{li.legalName}{li.registryChecked ? ' (vérifiée au registre)' : ''}</div>}
              {li.siret && <div>SIRET {li.siret}</div>}
              <div>{li.vatRegistered ? `Assujetti à la TVA${li.vatNumber ? ` (${li.vatNumber})` : ''} : vos devis sont HT, la marque paie la TVA en plus` : 'Non assujetti à la TVA (franchise en base) : vos devis sont facturés sans TVA'}</div>
              {li.billingMandateAcceptedAt && <div className="text-xs text-neutral-500">Mandat de facturation accepté le {new Date(li.billingMandateAcceptedAt).toLocaleDateString('fr-FR')} : NeedCreator émet vos factures en votre nom.</div>}
              {li.address?.line1 && <div>{li.address.line1}{li.address.line2 ? `, ${li.address.line2}` : ''}, {li.address.postalCode} {li.address.city}, {li.address.country}</div>}
            </>
          )}
        </div>
      ) : isBrand ? (
        <div className="space-y-3">
          <Input label="Nom et prénom du signataire" value={form.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} placeholder="Marie Dupont" />
          <Input label="Fonction (optionnel)" value={form.signatoryTitle} onChange={(e) => set('signatoryTitle', e.target.value)} placeholder="Directrice marketing" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} isLoading={save.isPending} disabled={!canSave}><Save className="w-4 h-4 mr-1" /> Enregistrer les informations administratives</Button>
            {complete && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>}
          </div>
          {!canSave && <p className="text-xs text-orange-700">Il manque : {missing.join(', ')}.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Prénom" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            <Input label="Nom" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Statut</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          {form.status === 'company' && <Input label="Raison sociale" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />}
          {form.status !== 'individual' ? (
            <Input label="SIRET (14 chiffres, vérifié au registre national)" value={form.siret} onChange={(e) => set('siret', e.target.value)} placeholder="123 456 789 00012" />
          ) : (
            <label className="flex items-start gap-2 text-sm text-neutral-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <input type="checkbox" checked={form.individualAcknowledged} onChange={(e) => set('individualAcknowledged', e.target.checked)} className="mt-0.5" />
              <span>Je déclare exercer cette activité à titre occasionnel et déclarer moi-même les revenus perçus. Une activité régulière nécessite un statut (micro-entreprise).</span>
            </label>
          )}
          {form.status !== 'individual' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">TVA</label>
              <select value={form.vatRegistered ? 'yes' : 'no'} onChange={(e) => set('vatRegistered', e.target.value === 'yes')} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="no">Non assujetti (franchise en base, cas général des micro-entrepreneurs) : devis sans TVA</option>
                <option value="yes">Assujetti à la TVA : devis HT, la marque paie la TVA en plus</option>
              </select>
              {form.vatRegistered && <Input label="Numéro de TVA intracommunautaire" value={form.vatNumber} onChange={(e) => set('vatNumber', e.target.value)} placeholder="FR12345678901" />}
            </div>
          )}
          <Input label="Adresse" value={form.address.line1} onChange={(e) => setAddr('line1', e.target.value)} placeholder="12 rue des Lilas" />
          <Input label="Complément (optionnel)" value={form.address.line2 || ''} onChange={(e) => setAddr('line2', e.target.value)} />
          <div className="grid sm:grid-cols-3 gap-3">
            <Input label="Code postal" value={form.address.postalCode} onChange={(e) => setAddr('postalCode', e.target.value)} />
            <Input label="Ville" value={form.address.city} onChange={(e) => setAddr('city', e.target.value)} />
            <Input label="Pays" value={form.address.country} onChange={(e) => setAddr('country', e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
            <input type="checkbox" checked={form.billingMandate} onChange={(e) => set('billingMandate', e.target.checked)} className="mt-0.5" disabled={!!li.billingMandateAcceptedAt} />
            <span><strong>Mandat de facturation.</strong> J&apos;autorise NeedCreator (PREDIWORKS SAS) à établir et émettre en mon nom et pour mon compte les factures correspondant à mes missions sur la plateforme, avec une numérotation qui m&apos;est propre. Je reste responsable de leur déclaration. Obligatoire pour envoyer un devis.</span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} isLoading={save.isPending} disabled={!canSave}><Save className="w-4 h-4 mr-1" /> Enregistrer les informations administratives</Button>
            {complete && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>}
          </div>
          {!canSave && <p className="text-xs text-orange-700">Il manque : {missing.join(', ')}.</p>}
        </div>
      )}
    </Card>
  );
}
