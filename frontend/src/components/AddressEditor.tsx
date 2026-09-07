'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useUpdateProfile } from '@/hooks/useProfile';
import { MapPin, Save } from 'lucide-react';

/**
 * Adresse postale du créateur pour recevoir les produits (visible par la marque après sélection)
 */
export default function AddressEditor({ address = {} }: { address?: any }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const update = useUpdateProfile();
  const has = !!(address?.line1 && address?.city);

  const start = () => { setForm({ country: 'France', ...address }); setEditing(true); };
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const save = async () => {
    await update.mutateAsync({ profile: { address: form } });
    setEditing(false);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-primary-500" /> Adresse de réception des produits</h2>
        {!editing && <Button size="sm" variant="outline" onClick={start}>{has ? 'Modifier' : 'Renseigner'}</Button>}
      </div>
      <p className="text-sm text-neutral-500 mb-4">Transmise uniquement aux marques qui vous ont sélectionné, pour l&apos;envoi des produits à tester.</p>
      {!editing ? (
        has ? (
          <address className="not-italic text-sm text-neutral-700">{address.name}<br />{address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />{address.postalCode} {address.city}, {address.country}{address.phone ? <><br />📞 {address.phone}</> : null}</address>
        ) : <p className="text-sm text-orange-700">Aucune adresse : les marques ne pourront pas vous envoyer de produit.</p>
      ) : (
        <div className="space-y-3">
          <Input label="Nom complet" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
          <Input label="Adresse" value={form.line1 || ''} onChange={(e) => set('line1', e.target.value)} placeholder="12 rue des Lilas" />
          <Input label="Complément (optionnel)" value={form.line2 || ''} onChange={(e) => set('line2', e.target.value)} placeholder="Bât. B, 3e étage" />
          <div className="grid sm:grid-cols-3 gap-3">
            <Input label="Code postal" value={form.postalCode || ''} onChange={(e) => set('postalCode', e.target.value)} />
            <Input label="Ville" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
            <Input label="Pays" value={form.country || ''} onChange={(e) => set('country', e.target.value)} />
          </div>
          <Input label="Téléphone (pour le transporteur)" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} isLoading={update.isPending} disabled={!form.line1 || !form.city || !form.postalCode}><Save className="w-4 h-4 mr-1" /> Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
