'use client';

import { useState } from 'react';
import { useUpdateProfile } from '@/hooks/useProfile';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { CalendarOff } from 'lucide-react';
import { formatDate } from '@/lib/utils';

/**
 * Disponibilité du créateur : « indisponible jusqu'au … » visible par les marques et prise en compte dans le matching.
 */
export default function AvailabilityCard({ profile }: { profile: any }) {
  const update = useUpdateProfile();
  const current = profile.profile?.availability || {};
  const active = current.unavailableUntil && new Date(current.unavailableUntil) > new Date();
  const [until, setUntil] = useState(current.unavailableUntil ? String(current.unavailableUntil).slice(0, 10) : '');
  const [note, setNote] = useState(current.note || '');
  const save = (clear = false) => update.mutate({ profile: { availability: { unavailableUntil: clear ? null : (until ? new Date(until).toISOString() : null), note: clear ? '' : note } } });
  return (
    <Card className={`p-6 ${active ? 'border-orange-300 bg-orange-50/40' : ''}`}>
      <h2 className="text-xl font-semibold text-neutral-900 flex items-center gap-2 mb-1"><CalendarOff className="w-5 h-5 text-primary-500" /> Disponibilité</h2>
      <p className="text-sm text-neutral-600 mb-3">
        {active
          ? <>Vous êtes indiqué <strong>indisponible jusqu&apos;au {formatDate(current.unavailableUntil)}</strong>. Les marques le voient sur vos devis et votre profil, et vos devis sont moins mis en avant jusqu&apos;à cette date.</>
          : <>Vacances, tournage, surcharge : indiquez une date de retour. Les marques le verront sur vos devis, et vous éviterez une sélection que vous ne pourriez pas honorer (et la garantie de remplacement qui va avec).</>}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Input label="Indisponible jusqu'au" type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
        <Input label="Message (optionnel, visible par les marques)" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="De retour le 15, disponible pour des missions dès mon retour" />
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={() => save(false)} isLoading={update.isPending} disabled={!until}>Enregistrer</Button>
        {active && <Button size="sm" variant="ghost" onClick={() => { setUntil(''); setNote(''); save(true); }} isLoading={update.isPending}>Je suis de nouveau disponible</Button>}
      </div>
    </Card>
  );
}
