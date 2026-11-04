'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';

/** Photo de profil (créateur) ou logo (marque) : aperçu, envoi et retrait */
export default function AvatarPicker({ avatar, initial, isBrand }: { avatar?: string | null; initial: string; isBrand: boolean }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['profile'] });
  const send = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Image JPG, PNG ou WebP uniquement'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image trop lourde : 5 Mo au plus'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('avatar', file);
      await api.post('/auth/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await refresh();
      toast.success(isBrand ? 'Logo mis à jour' : 'Photo mise à jour');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.delete('/auth/avatar'); await refresh(); } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} title={isBrand ? 'Changer le logo' : 'Changer la photo'}
        className={`w-20 h-20 ${isBrand ? 'rounded-lg' : 'rounded-full'} bg-primary-100 flex items-center justify-center overflow-hidden ring-offset-2 hover:ring-2 hover:ring-primary-400 transition ${busy ? 'opacity-50' : ''}`}>
        {avatar
          ? <img src={avatar} alt="" className="w-full h-full object-cover" />
          : <span className="text-3xl font-bold text-primary-600">{initial}</span>}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ''; }} data-testid="avatar-input" />
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className="text-xs text-primary-700 hover:underline">
        {busy ? 'Envoi…' : avatar ? (isBrand ? 'Changer le logo' : 'Changer la photo') : (isBrand ? 'Ajouter un logo' : 'Ajouter une photo')}
      </button>
      {avatar && !busy && <button type="button" onClick={remove} className="text-xs text-neutral-500 hover:underline">Retirer</button>}
    </div>
  );
}
