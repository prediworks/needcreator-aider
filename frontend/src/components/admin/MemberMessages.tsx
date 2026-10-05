'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { Send, Mail, Bold, List, User, Link2 } from 'lucide-react';

/** Annonces aux inscrits (email depuis needcreator.com + cloche) ; la séquence d'accueil se règle dans Réglages → « Messages aux inscrits » */
export default function MemberMessages() {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<'creators' | 'brands'>('creators');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const { data } = useQuery({ queryKey: ['member-messages'], queryFn: async () => (await api.get('/admin/member-messages')).data });
  // Message préparé ailleurs (opportunité relevée dans un groupe Facebook) : pré-rempli une fois, à relire avant l'envoi
  useEffect(() => { try { const raw = sessionStorage.getItem('memberMessageDraft'); if (!raw) return; sessionStorage.removeItem('memberMessageDraft'); const d = JSON.parse(raw); if (d.audience === 'creators' || d.audience === 'brands') setAudience(d.audience); if (d.subject) setSubject(String(d.subject)); if (d.body) setBody(String(d.body)); } catch { /* rien à pré-remplir */ } }, []);
  const preview = useMutation({ mutationFn: async () => (await api.post('/admin/member-messages?preview=1', { audience, subject, body })).data, onSuccess: (d) => toast.success(d.message, { duration: 8000 }), onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const send = useMutation({ mutationFn: async () => (await api.post('/admin/member-messages', { audience, subject, body })).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); setSubject(''); setBody(''); queryClient.invalidateQueries({ queryKey: ['member-messages'] }); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const weekly = useMutation({ mutationFn: async () => (await api.post('/admin/weekly-report')).data, onSuccess: (d) => toast.success(d.message, { duration: 8000 }), onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  // Barre d'outils : insère les codes de mise en forme à l'endroit du curseur ; aperçu rendu par le serveur avec les règles de l'email
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  useEffect(() => {
    if (!body.trim()) { setPreviewHtml(''); return; }
    const t = setTimeout(() => { api.post('/admin/member-messages/render', { body }).then((r) => setPreviewHtml(r.data.html || '')).catch(() => setPreviewHtml('')); }, 400);
    return () => clearTimeout(t);
  }, [body]);
  const insert = (before: string, after = '', placeholder = '') => {
    const el = areaRef.current; if (!el) { setBody(body + before + placeholder + after); return; }
    const start = el.selectionStart ?? body.length; const end = el.selectionEnd ?? start;
    const selected = body.slice(start, end) || placeholder;
    // Un mot inséré au milieu d'une phrase prend une espace devant lui s'il en manque une
    const gap = start > 0 && !/\s$/.test(body.slice(0, start)) && !after ? ' ' : '';
    const next = body.slice(0, start) + gap + before + selected + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); const pos = start + gap.length + before.length + selected.length; el.setSelectionRange(pos, pos); });
  };
  const insertList = () => {
    const el = areaRef.current; const start = el?.selectionStart ?? body.length; const end = el?.selectionEnd ?? start;
    const selected = body.slice(start, end);
    const lines = (selected || 'Nom de l\'outil : ce qu\'il fait').split('\n').map(l => (/^\s*-\s+/.test(l) ? l : `- ${l}`)).join('\n');
    const before = body.slice(0, start); const sep = before && !/\n\n$/.test(before) ? (/\n$/.test(before) ? '\n' : '\n\n') : '';
    setBody(before + sep + lines + body.slice(end));
  };
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
        <div className="flex gap-1 flex-wrap mb-1" data-testid="member-toolbar">
          <button type="button" onClick={() => insert('**', '**', 'texte en gras')} className="px-2 py-1 rounded border border-neutral-300 text-xs hover:bg-neutral-100 flex items-center gap-1" title="Met la sélection en gras (**texte**)"><Bold className="w-3.5 h-3.5" /> Gras</button>
          <button type="button" onClick={insertList} className="px-2 py-1 rounded border border-neutral-300 text-xs hover:bg-neutral-100 flex items-center gap-1" title="Transforme les lignes sélectionnées en liste (« - Nom : explication » met le nom en gras)"><List className="w-3.5 h-3.5" /> Liste</button>
          <button type="button" onClick={() => insert('{{prenom}}')} className="px-2 py-1 rounded border border-neutral-300 text-xs hover:bg-neutral-100 flex items-center gap-1" title="Insère le prénom de chaque inscrit"><User className="w-3.5 h-3.5" /> Prénom</button>
          <button type="button" onClick={() => insert('https://needcreator.com/')} className="px-2 py-1 rounded border border-neutral-300 text-xs hover:bg-neutral-100 flex items-center gap-1" title="Insère une adresse : toute adresse en https:// devient un lien cliquable"><Link2 className="w-3.5 h-3.5" /> Lien</button>
          <span className="text-xs text-neutral-500 self-center ml-1">Une ligne vide sépare deux paragraphes. « Bonjour Prénom, » et le bouton sont ajoutés automatiquement.</span>
        </div>
        <textarea ref={areaRef} value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder={'Un paragraphe par bloc, une ligne vide entre deux. Ne commencez pas par « Bonjour » : l\'email l\'ajoute déjà avec le prénom.\n- Une ligne qui commence par « - » devient une liste ; « Nom : explication » met le nom en gras ; **gras** accepté partout.\n{{prenom}} est remplacé par le prénom dans le texte.'} className="w-full md:w-[36rem] px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
        <p className="text-xs text-neutral-500 mt-1">Le bouton « Ouvrir mon tableau de bord » est ajouté à la fin. Les inscrits qui ont désactivé les emails ne reçoivent que la notification.</p>
        {previewHtml && (
          <div className="mt-3 w-full md:w-[36rem]" data-testid="member-preview-live">
            <div className="text-xs font-medium text-neutral-700 mb-1">Aperçu de l&apos;email, tel que le recevra Camille Durand</div>
            <div className="border border-neutral-200 rounded-lg p-4 bg-white text-[15px] leading-relaxed text-neutral-800 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary-700 [&_a]:underline">
              <p className="font-semibold text-lg mb-3">Bonjour Camille,</p>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              <span className="inline-block mt-2 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm">Ouvrir mon tableau de bord</span>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => preview.mutate()} disabled={!ready} isLoading={preview.isPending} title="Envoie l'email sur votre adresse d'administrateur, sans rien envoyer aux inscrits" data-testid="member-preview">M&apos;envoyer un aperçu</Button>
          <Button size="sm" onClick={() => { if (confirm(`Envoyer ce message à ${count} ${audience === 'creators' ? 'créateur(s)' : 'marque(s)'} ? Cette action ne peut pas être annulée.`)) send.mutate(); }} disabled={!ready || !count} isLoading={send.isPending} title="Envoie à tous les inscrits du public choisi, une seule fois par personne" data-testid="member-send"><Send className="w-4 h-4 mr-1" /> Envoyer à {count} {audience === 'creators' ? 'créateur(s)' : 'marque(s)'}</Button>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold mb-2">Séquence d&apos;accueil : envois effectués</h3>
        <p className="text-sm text-neutral-600">Créateurs · message 1 (les outils) : {data?.onboarding?.onboarding1 ?? 0} · message 2 (portfolio et Ambassadeur) : {data?.onboarding?.onboarding2 ?? 0} · message 3 (premier devis client) : {data?.onboarding?.onboarding3 ?? 0}</p>
        <p className="text-sm text-neutral-600">Marques · message 1 (campagne au produit offert) : {data?.onboarding?.brandOnboarding1 ?? 0} · message 2 (aucune campagne publiée) : {data?.onboarding?.brandOnboarding2 ?? 0}</p>
        <h3 className="font-semibold mt-5 mb-2">Bilan hebdomadaire</h3>
        <p className="text-sm text-neutral-600 mb-2">Chaque lundi, les administrateurs reçoivent les chiffres de la semaine (inscrits, prospects, mailing, réponses, messages privés, extension, campagnes, outils créateurs), comparés à la semaine précédente.</p>
        <Button size="sm" variant="outline" onClick={() => weekly.mutate()} isLoading={weekly.isPending} title="Envoie le bilan tout de suite, sans attendre lundi" data-testid="weekly-report">M&apos;envoyer le bilan maintenant</Button>
        <h3 className="font-semibold mt-5 mb-2">Annonces envoyées</h3>
        {data?.broadcasts?.length ? (
          <ul className="text-sm text-neutral-700 space-y-1">{data.broadcasts.map((b: any) => <li key={b._id}><span className="text-neutral-500">{formatDateTime(b.sentAt)}</span> · {b.audience === 'brands' ? 'marques' : 'créateurs'} · <span className="font-medium">{b.subject}</span> · {b.count} envoi(s), {b.emailed} email(s)</li>)}</ul>
        ) : <p className="text-sm text-neutral-500">Aucune annonce envoyée pour l&apos;instant.</p>}
      </Card>
    </div>
  );
}
