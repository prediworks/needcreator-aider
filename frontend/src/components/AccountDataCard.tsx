'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * RGPD : export des données et suppression du compte
 */
export default function AccountDataCard() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await api.get('/auth/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'needcreator-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Export impossible'));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (confirm !== 'SUPPRIMER') return;
    setDeleting(true);
    try {
      await api.delete('/auth/account');
      toast.success('Votre compte a été supprimé.');
      await signOut(auth).catch(() => {});
      logout();
      router.replace('/');
    } catch (e) {
      toast.error(getErrorMessage(e, 'Suppression impossible'), { duration: 10000 });
      setDeleting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold text-neutral-900 mb-1">Mes données</h2>
      <p className="text-sm text-neutral-600 mb-4">
        Conformément au RGPD, vous pouvez télécharger l&apos;ensemble de vos données ou supprimer votre compte.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={exportData} isLoading={exporting}>
          <Download className="w-4 h-4 mr-2" /> Télécharger mes données
        </Button>
        {!showDelete && (
          <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setShowDelete(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer mon compte
          </Button>
        )}
      </div>
      {showDelete && (
        <div className="mt-4 border border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
          <p className="text-sm text-red-800">
            Cette action est définitive. Vos données personnelles seront supprimées ou anonymisées. Les missions en cours
            doivent être terminées avant la suppression. Tapez <strong>SUPPRIMER</strong> pour confirmer.
          </p>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="SUPPRIMER" />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setShowDelete(false); setConfirm(''); }}>Annuler</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={confirm !== 'SUPPRIMER'} isLoading={deleting} onClick={deleteAccount}>
              Supprimer définitivement
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
