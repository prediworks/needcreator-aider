'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

const SKIP_LABELS: Record<string, string> = { '': 'Toujours', quote: 'Inutile si a déjà envoyé un devis', showcase: 'Inutile si a déjà déposé une vidéo spontanée', prospect: 'Inutile si se sert déjà du suivi de prospection', content: 'Inutile si a déjà un registre des droits', scan: 'Inutile si a déjà scanné une marque', campaign: 'Inutile si a déjà créé une campagne' };
type Topic = { _id?: string; audience: 'creators' | 'brands'; title: string; subject: string; subjectRepeat: string; body: string; href: string; cta: string; order: number; active: boolean; skipIf: string; sent?: number; lastSentAt?: string | null };
const EMPTY: Topic = { audience: 'creators', title: '', subject: '', subjectRepeat: '', body: '', href: '/dashboard', cta: 'Ouvrir mon tableau de bord', order: 0, active: false, skipIf: '' };

/**
 * Thématiques hebdomadaires : la bibliothèque de conseils envoyés un par semaine à chaque inscrit, dans l'ordre, en boucle.
 * Une nouvelle fonctionnalité = une thématique ajoutée désactivée, relue puis activée. Jour, heure et délais : Réglages → Messages aux inscrits.
 */
export default function MemberTopics() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['member-topics'], queryFn: async () => (await api.get('/admin/member-topics')).data });
  const [editing, setEditing] = useState<Topic | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['member-topics'] });
  const save = useMutation({
    mutationFn: async (t: Topic) => (t._id ? (await api.put(`/admin/member-topics/${t._id}`, t)).data : (await api.post('/admin/member-topics', t)).data),
    onSuccess: (d) => { toast.success(d.message); setEditing(null); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)),
  });
  const toggle = useMutation({ mutationFn: async ({ id, active }: { id: string; active: boolean }) => (await api.put(`/admin/member-topics/${id}`, { active })).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/admin/member-topics/${id}`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const preview = useMutation({ mutationFn: async (t: Topic) => (await api.post(`/admin/member-topics/${t._id || 'draft'}/preview`, t)).data, onSuccess: (d) => toast.success(d.message, { duration: 8000 }), onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const runNow = useMutation({ mutationFn: async () => (await api.post('/admin/member-topics/run')).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const topics: Topic[] = data?.topics || [];
  const list = (audience: 'creators' | 'brands') => topics.filter(t => t.audience === audience);
  const e = editing;
  return (
    <Card className="p-6" data-testid="member-topics">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Thématiques hebdomadaires</h3>
          <p className="text-sm text-neutral-600">Un conseil par semaine et par inscrit, dans l&apos;ordre, jamais deux fois le même avant le délai de reprise ; quand tout est reçu, on recommence au début avec un objet de rappel. Un nouvel inscrit commence après sa séquence d&apos;accueil. Jour, heure et délais : Réglages → Messages aux inscrits. Chaque email porte un lien « Ne plus recevoir les conseils ».</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing({ ...EMPTY })}>Ajouter une thématique</Button>
          <Button size="sm" variant="outline" onClick={() => { if (confirm('Envoyer maintenant le prochain conseil à chaque inscrit qui n\'en a pas reçu depuis 6 jours ?')) runNow.mutate(); }} isLoading={runNow.isPending} title="Sans attendre le créneau hebdomadaire ; un inscrit déjà servi cette semaine ne reçoit rien" data-testid="member-topics-run">Envoyer maintenant</Button>
        </div>
      </div>
      {isLoading ? <p className="text-sm text-neutral-500 mt-3">Chargement…</p> : (['creators', 'brands'] as const).map(aud => (
        <div key={aud} className="mt-4">
          <div className="text-sm font-medium text-neutral-800 mb-1">{aud === 'creators' ? 'Créateurs' : 'Marques'} <span className="text-neutral-500 font-normal">· {data?.audiences?.[aud] ?? 0} inscrit(s)</span></div>
          {!list(aud).length ? <p className="text-sm text-neutral-500">Aucune thématique.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-neutral-500 border-b"><th className="py-1 pr-2 w-10">#</th><th className="pr-2">Thématique</th><th className="pr-2">Objet</th><th className="pr-2">Condition</th><th className="pr-2">Envois</th><th className="pr-2">État</th><th></th></tr></thead>
              <tbody>
                {list(aud).map(t => (
                  <tr key={t._id} className="border-b border-neutral-100 align-top" data-testid="member-topic-row">
                    <td className="py-1.5 pr-2 text-neutral-500">{t.order}</td>
                    <td className="pr-2 font-medium text-neutral-900">{t.title}</td>
                    <td className="pr-2 text-neutral-700">{t.subject}</td>
                    <td className="pr-2 text-xs text-neutral-500">{SKIP_LABELS[t.skipIf] || 'Toujours'}</td>
                    <td className="pr-2 whitespace-nowrap">{t.sent || 0}{t.lastSentAt ? <div className="text-xs text-neutral-500">dernier : {formatDate(t.lastSentAt)}</div> : null}</td>
                    <td className="pr-2"><span className={`px-2 py-0.5 rounded-full text-xs ${t.active ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>{t.active ? 'Active' : 'Désactivée'}</span></td>
                    <td className="whitespace-nowrap text-xs">
                      <button type="button" className="underline mr-2" onClick={() => setEditing({ ...t })}>Modifier</button>
                      <button type="button" className="underline mr-2" onClick={() => toggle.mutate({ id: t._id!, active: !t.active })}>{t.active ? 'Désactiver' : 'Activer'}</button>
                      <button type="button" className="underline mr-2" onClick={() => preview.mutate(t)} title="Envoie l'email sur votre adresse d'administrateur">Aperçu</button>
                      <button type="button" className="underline text-red-700" onClick={() => { if (confirm(`Supprimer « ${t.title} » ?`)) remove.mutate(t._id!); }}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {e && (
        <div className="mt-5 border-t border-neutral-200 pt-4" data-testid="member-topic-form">
          <h4 className="font-medium mb-2">{e._id ? 'Modifier la thématique' : 'Nouvelle thématique'}</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm">Public<select value={e.audience} onChange={(ev) => setEditing({ ...e, audience: ev.target.value as any })} className="block w-full border border-neutral-300 rounded-lg px-3 py-2 mt-1"><option value="creators">Créateurs</option><option value="brands">Marques</option></select></label>
            <Input label="Titre interne" value={e.title} onChange={(ev: any) => setEditing({ ...e, title: ev.target.value })} placeholder="Envoyer vos devis" />
            <Input label="Objet de l'email" value={e.subject} onChange={(ev: any) => setEditing({ ...e, subject: ev.target.value })} placeholder="Envoyez vos devis depuis NeedCreator" />
            <Input label="Objet au second tour (sinon « Rappel : … »)" value={e.subjectRepeat} onChange={(ev: any) => setEditing({ ...e, subjectRepeat: ev.target.value })} />
            <Input label="Lien du bouton (chemin du site)" value={e.href} onChange={(ev: any) => setEditing({ ...e, href: ev.target.value })} placeholder="/quotes" />
            <Input label="Texte du bouton" value={e.cta} onChange={(ev: any) => setEditing({ ...e, cta: ev.target.value })} />
            <Input label="Ordre" type="number" value={String(e.order)} onChange={(ev: any) => setEditing({ ...e, order: Number(ev.target.value) || 0 })} />
            <label className="text-sm">Condition<select value={e.skipIf} onChange={(ev) => setEditing({ ...e, skipIf: ev.target.value })} className="block w-full border border-neutral-300 rounded-lg px-3 py-2 mt-1">{Object.entries(SKIP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className="block text-sm font-medium text-neutral-700 mt-3 mb-1">Texte</label>
          <textarea value={e.body} onChange={(ev) => setEditing({ ...e, body: ev.target.value })} rows={9} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm" placeholder={'Un paragraphe par bloc, une ligne vide entre deux. {{prenom}}, **gras**, lignes « - » pour une liste. Ne commencez pas par « Bonjour » : il est ajouté.'} />
          <label className="inline-flex items-center gap-2 text-sm mt-2"><input type="checkbox" checked={e.active} onChange={(ev) => setEditing({ ...e, active: ev.target.checked })} /> Active (envoyée dans la rotation)</label>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button size="sm" onClick={() => save.mutate(e)} isLoading={save.isPending}>Enregistrer</Button>
            <Button size="sm" variant="outline" onClick={() => preview.mutate(e)} isLoading={preview.isPending} title="Envoie cet email sur votre adresse d'administrateur">M&apos;envoyer un aperçu</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
