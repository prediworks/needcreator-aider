'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { Send, Mail } from 'lucide-react';

/** Annonces aux inscrits (email depuis needcreator.com + cloche) ; la séquence d'accueil se règle dans Réglages → « Messages aux inscrits » */
export default function MemberMessages() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<'creators' | 'brands'>('creators');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { data } = useQuery({ queryKey: ['member-messages'], queryFn: async () => (await api.get('/admin/member-messages')).data });
  const preview = useMutation({ mutationFn: async () => (await api.post('/admin/member-messages?preview=1', { audience, subject, body })).data, onSuccess: (d) => toast.success(d.message, { duration: 8000 }), onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const send = useMutation({ mutationFn: async () => (await api.post('/admin/member-messages', { audience, subject, body })).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); setSubject(''); setBody(''); queryClient.invalidateQueries({ queryKey: ['member-messages'] }); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const count = data?.audiences?.[audience] ?? 0;
  const ready = subject.trim().length >= 5 && body.trim().length >= 20;
  return (
    <div className="space-y-6">
      <Card className="p-6" data-testid="member-messages">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><Mail className="w-5 h-5 text-primary-500" /> Message aux inscrits</h2>
        <p className="text-sm text-neutral-600 mb-4">Une annonce unique à tous les inscrits d&apos;un public : email depuis needcreator.com et notification dans l&apos;application. Une seule fois par personne. La séquence d&apos;accueil automatique (J+2 les outils, J+7 portfolio et Ambassadeur, J+14 premier devis) se règle dans Réglages → « Messages aux inscrits ».</p>
        <div className="flex gap-2 mb-3">
          {(['creators', 'brands'] as const).map(a => <button key={a} type="button" onClick={() => setAudience(a)} className={`px-3 py-1.5 rounded-lg text-sm ${audience === a ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`} title={a === 'creators' ? 'Créateurs inscrits, profil validé ou en attente (hors suspendus)' : 'Marques au compte actif'}>{a === 'creators' ? 'Créateurs' : 'Marques'} ({data?.audiences?.[a] ?? '…'})</button>)}
        </div>
        <Input label="Objet" value={subject} onChange={(e: any) => setSubject(e.target.value)} placeholder="Ce que vous pouvez faire dès aujourd'hui sur NeedCreator" className="w-full md:w-[36rem]" />
        <label className="block text-sm font-medium text-neutral-700 mt-3 mb-1">Texte</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder={'Un paragraphe par bloc, une ligne vide entre deux. Ne commencez pas par « Bonjour » : l\'email l\'ajoute déjà avec le prénom.\n- Une ligne qui commence par « - » devient une liste ; « Nom : explication » met le nom en gras ; **gras** accepté partout.\n{{prenom}} est remplacé par le prénom dans le texte.'} className="w-full md:w-[36rem] px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
        <p className="text-xs text-neutral-500 mt-1">Le bouton « Ouvrir mon tableau de bord » est ajouté à la fin. Les inscrits qui ont désactivé les emails ne reçoivent que la notification.</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => preview.mutate()} disabled={!ready} isLoading={preview.isPending} title="Envoie l'email sur votre adresse d'administrateur, sans rien envoyer aux inscrits" data-testid="member-preview">M&apos;envoyer un aperçu</Button>
          <Button size="sm" onClick={() => { if (confirm(`Envoyer ce message à ${count} ${audience === 'creators' ? 'créateur(s)' : 'marque(s)'} ? Cette action ne peut pas être annulée.`)) send.mutate(); }} disabled={!ready || !count} isLoading={send.isPending} title="Envoie à tous les inscrits du public choisi, une seule fois par personne" data-testid="member-send"><Send className="w-4 h-4 mr-1" /> Envoyer à {count} {audience === 'creators' ? 'créateur(s)' : 'marque(s)'}</Button>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold mb-2">Séquence d&apos;accueil : envois effectués</h3>
        <p className="text-sm text-neutral-600">Message 1 (les outils) : {data?.onboarding?.onboarding1 ?? 0} · Message 2 (portfolio et Ambassadeur) : {data?.onboarding?.onboarding2 ?? 0} · Message 3 (premier devis client) : {data?.onboarding?.onboarding3 ?? 0}</p>
        <h3 className="font-semibold mt-5 mb-2">Annonces envoyées</h3>
        {data?.broadcasts?.length ? (
          <ul className="text-sm text-neutral-700 space-y-1">{data.broadcasts.map((b: any) => <li key={b._id}><span className="text-neutral-500">{formatDateTime(b.sentAt)}</span> · {b.audience === 'brands' ? 'marques' : 'créateurs'} · <span className="font-medium">{b.subject}</span> · {b.count} envoi(s), {b.emailed} email(s)</li>)}</ul>
        ) : <p className="text-sm text-neutral-500">Aucune annonce envoyée pour l&apos;instant.</p>}
      </Card>
    </div>
  );
}
