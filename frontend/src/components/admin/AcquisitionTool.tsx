'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import MissingHint from '@/components/ui/MissingHint';
import SocialEmbed, { embedProvider } from '@/components/SocialEmbed';
import { formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import { Radar, Copy, ExternalLink, RefreshCw, Trash2, Download, UserPlus, Upload, Play, Send, Mail, BarChart3, MessageSquare } from 'lucide-react';

const INTENT: Record<string, { label: string; cls: string }> = { interested: { label: 'Intéressé', cls: 'bg-green-100 text-green-800' }, question: { label: 'Question', cls: 'bg-blue-100 text-blue-800' }, not_now: { label: 'Pas maintenant', cls: 'bg-yellow-100 text-yellow-800' }, refusal: { label: 'Refus', cls: 'bg-red-50 text-red-700' }, unsubscribe: { label: 'Ne plus écrire', cls: 'bg-red-100 text-red-800' }, out_of_office: { label: 'Absence', cls: 'bg-neutral-100 text-neutral-600' }, other: { label: 'Autre', cls: 'bg-neutral-100 text-neutral-600' } };

function Funnel({ title, f }: { title: string; f: any }) {
  const steps: [string, number][] = [['Trouvés', f.found], ['Avec email', f.withEmail], ['Qualifiés', f.qualified], ['Contactés', f.contacted], ['Ont répondu', f.replied], ['Intéressés', f.interested], ['Inscrits', f.registered]];
  const max = Math.max(1, f.found);
  return (
    <div>
      <div className="text-sm font-medium text-neutral-800 mb-1">{title}</div>
      <div className="space-y-1">{steps.map(([l, n]) => <div key={l} className="flex items-center gap-2 text-xs"><span className="w-24 text-neutral-600">{l}</span><div className="flex-1 h-3 bg-neutral-100 rounded overflow-hidden"><div className="h-full bg-primary-500" style={{ width: `${Math.round((n / max) * 100)}%` }} /></div><span className="w-14 text-right font-medium">{n}{l === 'Inscrits' && f.contacted ? <span className="text-neutral-400 font-normal"> ({Math.round((n / f.contacted) * 100)} %)</span> : ''}</span></div>)}</div>
    </div>
  );
}

function ReplyBox({ lead, onSent }: { lead: any; onSent: () => void }) {
  const [text, setText] = useState(lead.mailing?.replySuggestion || '');
  const [open, setOpen] = useState(false);
  const send = useMutation({ mutationFn: async () => (await api.post(`/admin/acquisition/leads/${lead._id}/reply`, { text })).data, onSuccess: (d) => { toast.success(d.message); setOpen(false); onSent(); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const reclass = useMutation({ mutationFn: async () => (await api.post(`/admin/acquisition/leads/${lead._id}/reclassify`)).data, onSuccess: (d) => { toast.success(d.message); onSent(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const m = lead.mailing || {};
  const intent = INTENT[m.replyIntent] || null;
  return (
    <div className="mt-2 border-l-2 border-purple-200 pl-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap"><MessageSquare className="w-3.5 h-3.5 text-purple-600" /><span className="font-medium text-neutral-800">Réponse{m.replyAt ? ` du ${formatDateTime(m.replyAt)}` : ''}</span>{intent && <span className={`px-2 py-0.5 rounded-full ${intent.cls}`}>{intent.label}</span>}{m.replySummary && <span className="text-neutral-600">{m.replySummary}</span>}{!intent && <button type="button" onClick={() => reclass.mutate()} className="text-primary-600 underline">Classer avec l&apos;IA</button>}</div>
      <div className="text-neutral-700 bg-purple-50 rounded px-2 py-1 mt-1 whitespace-pre-wrap">{(m.replyText || '').slice(0, 600)}</div>
      {m.replySentAt ? <div className="text-green-700 mt-1">Réponse envoyée le {formatDateTime(m.replySentAt)} : « {(m.replySentText || '').slice(0, 160)} »</div> : (
        <div className="mt-1">
          {!open ? <div className="flex gap-2 items-center flex-wrap">{m.replySuggestion && <span className="text-neutral-600">Proposition : « {m.replySuggestion.slice(0, 140)}… »</span>}<Button size="sm" variant="outline" onClick={() => setOpen(true)} title="Ouvrir la réponse proposée par l'IA pour la relire, la modifier et l'envoyer depuis l'outil de mailing, dans le fil de la conversation"><Send className="w-3.5 h-3.5 mr-1" /> {m.replySuggestion ? 'Relire et envoyer' : 'Répondre'}</Button></div> : (
            <div><textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full border border-neutral-300 rounded-lg px-2 py-1 text-xs" /><div className="flex gap-2 mt-1"><Button size="sm" onClick={() => send.mutate()} isLoading={send.isPending} disabled={!text.trim()} title="Envoie ce texte au prospect depuis l'expéditeur de l'outil de mailing, en réponse à son message"><Send className="w-3.5 h-3.5 mr-1" /> Envoyer depuis l&apos;outil de mailing</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Annuler</Button></div></div>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: 'À qualifier', cls: 'bg-neutral-100 text-neutral-700' },
  qualified: { label: 'Qualifié', cls: 'bg-blue-100 text-blue-800' },
  to_contact: { label: 'À contacter', cls: 'bg-indigo-100 text-indigo-800' },
  contacted: { label: 'Contacté', cls: 'bg-orange-100 text-orange-800' },
  replied: { label: 'A répondu', cls: 'bg-purple-100 text-purple-800' },
  registered: { label: 'Inscrit', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Hors cible', cls: 'bg-red-50 text-red-700' },
  excluded: { label: 'Déjà connu', cls: 'bg-neutral-100 text-neutral-500' },
};
const SOURCE: Record<string, string> = { youtube: 'YouTube', instagram: 'Instagram', meta: 'Pub Meta', manual: 'Manuel' };
const SOCIALS: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', facebook: 'Facebook' };

/** Liens vers les profils réseaux du prospect (trouvés dans la bio, le lien de bio ou le site) */
function SocialLinks({ socials }: { socials?: Record<string, string> }) {
  const entries = Object.entries(SOCIALS).filter(([k]) => socials?.[k]);
  if (!entries.length) return null;
  return <span className="inline-flex gap-1 flex-wrap ml-1" data-testid="lead-socials">{entries.map(([k, label]) => <a key={k} href={socials![k]} target="_blank" rel="noopener noreferrer" className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 hover:bg-primary-100 hover:text-primary-700 text-[11px]">{label}</a>)}</span>;
}

/** Import groupé : une ligne par prospect, colonnes libres (nom ; lien ; email ; bio ; site), dédoublonné, qualifié à la suite */
function ImportForm({ kind, onDone }: { kind: 'creator' | 'brand'; onDone: () => void }) {
  const [text, setText] = useState('');
  const [niche, setNiche] = useState('');
  const [origin, setOrigin] = useState('');
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const preview = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/leads/import?preview=1', { kind, text, niche, origin })).data.rows as any[], onError: (e: any) => toast.error(getErrorMessage(e)) });
  const run = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/leads/import', { kind, text, niche, origin })).data, onSuccess: (d) => { toast.success(d.message); onDone(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const missing = [!lines && 'au moins une ligne', lines > 500 && 'au plus 500 lignes'].filter(Boolean) as string[];
  return (
    <Card className="p-4 mb-4" data-testid="import-form">
      <p className="text-sm text-neutral-700 mb-2">Une ligne par {kind === 'creator' ? 'créateur' : 'marque'}, champs séparés par « ; », tabulation ou « | » : <span className="font-mono text-xs">nom ; lien du profil ; email ; bio ; site</span>. L&apos;ordre importe peu : l&apos;email et les liens sont reconnus où qu&apos;ils soient. Doublons ignorés, comptes déjà inscrits marqués, qualification IA à la suite. Format attendu des listes produites par l&apos;assistant Chrome (voir <span className="font-mono text-xs">docs/AGENT-CHROME.md</span>).</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={kind === 'creator' ? 'Marie UGC ; https://www.instagram.com/marie.ugc/ ; marie@gmail.com ; Créatrice UGC beauté Lyon, TikTok : @marie_ugc\nhttps://www.tiktok.com/@paul.ugc | Paul, vidéos food, contact paul.pro@outlook.fr' : 'Boutique Soleil ; https://boutique-soleil.fr ; contact@boutique-soleil.fr ; bougies artisanales, publicités vidéo actives'} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono" data-testid="import-text" />
      <div className="grid sm:grid-cols-3 gap-3 my-3">
        <Input label={kind === 'creator' ? 'Niche par défaut (facultatif)' : 'Secteur par défaut (facultatif)'} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={kind === 'creator' ? 'beauty, food, fitness…' : 'cosmétique, mode…'} />
        <Input label="Origine (facultatif)" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="tiktok #ugcfrance, salon, bibliothèque Meta…" />
        <div className="text-xs text-neutral-500 self-end pb-2">{lines} ligne(s)</div>
      </div>
      {preview.data && <ul className="text-xs text-neutral-700 mb-3 space-y-0.5 max-h-40 overflow-auto" data-testid="import-preview">{preview.data.map((r, i) => <li key={i} className={r.error ? 'text-red-600' : ''}>{r.error ? `Ignorée : ${r.error}` : `${r.name}${r.email ? ` · ${r.email}` : ' · pas d\'email'}${r.url ? ` · ${r.url}` : ''}${r.website && r.website !== r.url ? ` · site : ${r.website}` : ''}${Object.keys(r.socials || {}).length ? ` · réseaux : ${Object.keys(r.socials).join(', ')}` : ''}`}</li>)}</ul>}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => preview.mutate()} isLoading={preview.isPending} disabled={missing.length > 0} title="Montre comment chaque ligne sera lue (nom, email, lien, réseaux) sans rien enregistrer">Vérifier la lecture</Button>
        <Button size="sm" onClick={() => run.mutate()} isLoading={run.isPending} disabled={missing.length > 0} data-testid="import-submit" title="Enregistre les lignes valides comme prospects, ignore les doublons, puis lance la qualification IA en arrière-plan">Importer et qualifier</Button>
        <Button size="sm" variant="outline" onClick={onDone}>Annuler</Button>
        <MissingHint items={missing} />
      </div>
    </Card>
  );
}

function ManualForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<any>({ kind: 'creator', name: '', handle: '', url: '', website: '', email: '', description: '', niche: '', socials: { instagram: '', tiktok: '' } });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const missing = [!f.name.trim() && 'un nom'].filter(Boolean) as string[];
  const add = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/leads', f)).data, onSuccess: (d) => { toast.success(d.message); onDone(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  return (
    <Card className="p-4 mb-4">
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div><label className="block text-sm font-medium text-neutral-700 mb-1">Type</label><select value={f.kind} onChange={(e) => set('kind', e.target.value)} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"><option value="creator">Créateur</option><option value="brand">Marque</option></select></div>
        <Input label="Nom" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Input label={f.kind === 'creator' ? 'Pseudo' : 'Secteur'} value={f.kind === 'creator' ? f.handle : f.niche} onChange={(e) => set(f.kind === 'creator' ? 'handle' : 'niche', e.target.value)} />
        <Input label="Profil ou page (URL)" value={f.url} onChange={(e) => set('url', e.target.value)} />
        <Input label="Site" value={f.website} onChange={(e) => set('website', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Instagram (URL)" placeholder="https://www.instagram.com/pseudo/" value={f.socials.instagram} onChange={(e) => set('socials', { ...f.socials, instagram: e.target.value })} />
        <Input label="TikTok (URL)" placeholder="https://www.tiktok.com/@pseudo" value={f.socials.tiktok} onChange={(e) => set('socials', { ...f.socials, tiktok: e.target.value })} />
        <div className="sm:col-span-3"><textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Bio, description, ce que vend la marque… (sert à la qualification IA)" className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" /></div>
      </div>
      <div className="flex items-center gap-2 flex-wrap"><Button size="sm" onClick={() => add.mutate()} isLoading={add.isPending} disabled={missing.length > 0} title="Crée le prospect et le qualifie aussitôt avec l'IA (score, message, paragraphe email)">Ajouter et qualifier</Button><Button size="sm" variant="outline" onClick={onDone}>Annuler</Button><MissingHint items={missing} /></div>
    </Card>
  );
}

export default function AcquisitionTool() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'creator' | 'brand'>('creator');
  const [status, setStatus] = useState('qualified');
  const [hasEmail, setHasEmail] = useState('');
  // File affichée (créateurs ou marques, statut, filtre email) conservée au rafraîchissement de la page
  useEffect(() => {
    try { const v = JSON.parse(sessionStorage.getItem('nc-acq-view') || 'null'); if (v) { if (v.kind === 'creator' || v.kind === 'brand') setKind(v.kind); if (typeof v.status === 'string') setStatus(v.status); if (typeof v.hasEmail === 'string') setHasEmail(v.hasEmail); } } catch { /* stockage indisponible */ }
  }, []);
  useEffect(() => { try { sessionStorage.setItem('nc-acq-view', JSON.stringify({ kind, status, hasEmail })); } catch { /* stockage indisponible */ } }, [kind, status, hasEmail]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { data: ml } = useQuery({ queryKey: ['acquisition-mailing'], queryFn: async () => (await api.get('/admin/acquisition/mailing')).data, staleTime: 30000 });
  const pushNow = useMutation({ mutationFn: async (body: any) => (await api.post('/admin/acquisition/mailing/push', body)).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); setSelected([]); refresh(); queryClient.invalidateQueries({ queryKey: ['acquisition-mailing'] }); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const syncNow = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/mailing/sync')).data, onSuccess: (d) => { toast.success(d.message, { duration: 10000 }); refresh(); queryClient.invalidateQueries({ queryKey: ['acquisition-mailing'] }); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const [showDash, setShowDash] = useState(false);
  const { data: dash } = useQuery({ queryKey: ['acquisition-dashboard'], queryFn: async () => (await api.get('/admin/acquisition/dashboard')).data, enabled: showDash, staleTime: 60000 });
  const { data: ov } = useQuery({ queryKey: ['acquisition-overview'], queryFn: async () => (await api.get('/admin/acquisition')).data, refetchInterval: (query) => (query.state.data?.progress?.running ? 4000 : false) });
  const { data, isLoading } = useQuery({ queryKey: ['acquisition-leads', kind, status, hasEmail, q], queryFn: async () => (await api.get('/admin/acquisition/leads', { params: { kind, status: status || undefined, hasEmail: hasEmail || undefined, q: q || undefined, limit: 200 } })).data });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['acquisition-leads'] }); queryClient.invalidateQueries({ queryKey: ['acquisition-overview'] }); };
  const patch = useMutation({ mutationFn: async ({ id, ...body }: any) => (await api.patch(`/admin/acquisition/leads/${id}`, body)).data, onSuccess: () => refresh(), onError: (e: any) => toast.error(getErrorMessage(e)) });
  const bulk = useMutation({ mutationFn: async (body: any) => (await api.patch('/admin/acquisition/leads/bulk', body)).data, onSuccess: (d) => { toast.success(d.message); setSelected([]); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const copyIgLinks = async () => {
    try {
      const d = (await api.get('/admin/acquisition/leads?kind=creator&source=instagram&noHandle=1&limit=60')).data;
      const links = (d.leads || []).map((l: any) => l.url).filter(Boolean);
      if (!links.length) { toast.info('Aucune publication Instagram sans auteur : rien à compléter.'); return; }
      await navigator.clipboard.writeText(links.join('\n'));
      toast.success(`${links.length} lien(s) copié(s)${d.total > links.length ? ` sur ${d.total} : recommencez après l'import pour les suivants` : ''}. Collez-les dans la consigne Instagram de l'assistant Chrome.`, { duration: 8000 });
    } catch (e: any) { toast.error(getErrorMessage(e)); }
  };
  const enrichEmails = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/leads/enrich-emails', { kind })).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const enrichSocials = useMutation({ mutationFn: async () => (await api.post('/admin/acquisition/leads/enrich-socials')).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const requalify = useMutation({ mutationFn: async (id: string) => (await api.post(`/admin/acquisition/leads/${id}/requalify`)).data, onSuccess: (d) => { toast.success(d.message); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const remove = useMutation({ mutationFn: async (id: string) => (await api.delete(`/admin/acquisition/leads/${id}`)).data, onSuccess: () => refresh(), onError: (e: any) => toast.error(getErrorMessage(e)) });
  const run = useMutation({ mutationFn: async (kinds: string[]) => (await api.post('/admin/acquisition/run', { kinds })).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e), { duration: 8000 }) });
  const importDir = useMutation({ mutationFn: async (ids?: string[]) => (await api.post('/admin/acquisition/import-directory', ids ? { ids } : {})).data, onSuccess: (d) => { toast.success(d.message, { duration: 8000 }); setSelected([]); refresh(); }, onError: (e: any) => toast.error(getErrorMessage(e)) });
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Message copié'); } catch { toast.error('Copie impossible'); } };
  const exportCsv = async (markContacted: boolean) => {
    try {
      const r = await api.get('/admin/acquisition/export.csv', { params: { kind, status: status || 'qualified', markContacted: markContacted ? '1' : '0' }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `prospects-${kind}.csv`; a.click(); URL.revokeObjectURL(url);
      if (markContacted) refresh();
    } catch (e: any) { toast.error(getErrorMessage(e)); }
  };
  const s = ov?.settings; const counts = ov?.counts?.[kind] || {};
  const total = (st: string) => counts[st]?.n || 0;
  const daysLeft = ov?.meta?.expiresAt ? Math.ceil((new Date(ov.meta.expiresAt).getTime() - Date.now()) / 86400000) : null;
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Radar className="w-5 h-5 text-primary-500" /> Prospection</h2>
            <p className="text-sm text-neutral-600 mt-1">Chaque nuit, les agents cherchent des créateurs (YouTube, hashtags Instagram) et des marques (bibliothèque publicitaire Meta), trouvent leur email et les qualifient avec l&apos;IA. Vous exportez les qualifiés vers votre outil de mailing, ou copiez le message pour les contacter à la main sur les réseaux. Réglages dans l&apos;onglet Réglages, groupe « Prospection ».</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => run.mutate(['creator'])} isLoading={run.isPending} disabled={!!ov?.progress?.running || (!s?.youtube && !s?.instagram)} title="Lance maintenant une recherche de créateurs : chaînes YouTube par mots-clés et publications Instagram par hashtags, email trouvé dans la bio ou le lien de bio, puis qualification IA. Même chose que la recherche nocturne."><Play className="w-4 h-4 mr-1" /> Chercher des créateurs</Button>
            <Button size="sm" variant="outline" onClick={() => run.mutate(['brand'])} isLoading={run.isPending} disabled={!!ov?.progress?.running || !s?.meta} title="Lance maintenant une recherche de marques dans la bibliothèque publicitaire Meta (annonceurs actifs en France pour vos mots-clés), site et email trouvés automatiquement. Nécessite l'identité Meta vérifiée."><Play className="w-4 h-4 mr-1" /> Chercher des marques</Button>
          </div>
        </div>
        {s && (
          <div className="text-xs text-neutral-600 flex gap-3 flex-wrap">
            <span className={s.enabled ? 'text-green-700' : 'text-orange-700'}>Recherche nocturne : {s.enabled ? 'activée' : 'désactivée'}</span>
            <span className={s.youtube ? 'text-green-700' : 'text-red-700'}>YouTube : {s.youtube ? 'clé présente' : 'clé absente'}</span>
            <span className={ov?.meta?.valid ? 'text-green-700' : 'text-orange-700'}>Meta : {!ov?.meta?.configured ? 'jeton absent' : ov.meta.valid === false ? 'jeton invalide' : daysLeft !== null ? `jeton valide, expire dans ${daysLeft} j${daysLeft <= 10 ? ' : à renouveler dans les réglages' : ''}` : 'jeton présent'}</span>
            <span className={s.instagram ? 'text-green-700' : 'text-orange-700'}>Instagram : {s.instagram ? `compte relié, ${s.hashtags} hashtags${s.oembed === false ? ', auteur non fourni (oEmbed à faire approuver)' : ''}` : 'aucun compte professionnel relié à une page Facebook du jeton (sinon, renseignez « ID de la page Facebook » dans les réglages)'}</span>
            <span className={s.ai ? 'text-green-700' : 'text-red-700'}>IA : {s.ai ? 'configurée' : 'non configurée (pas de qualification)'}</span>
            <span>{s.creatorKeywords} lignes de mots-clés créateurs · {s.brandKeywords} marques · {s.dailyLimit} nouveaux par nuit max</span>
          </div>
        )}
        {ov?.progress?.running && <div className="mt-3 text-sm px-3 py-2 rounded-lg bg-primary-50 text-primary-800">Recherche en cours ({ov.progress.step === 'sourcing' ? 'sources' : 'qualification IA'}) : {ov.progress.found} trouvés, {ov.progress.created} nouveaux, {ov.progress.qualified} qualifiés…</div>}
        {ov?.runs?.length ? (
          <details className="mt-3 text-xs text-neutral-600"><summary className="cursor-pointer">Dernières exécutions ({ov.runs.length})</summary>
            <ul className="mt-2 space-y-1">{ov.runs.map((r: any) => !r.finishedAt ? <li key={r.runId} className={Date.now() - new Date(r.startedAt).getTime() < 3600000 ? 'text-primary-700' : 'text-orange-700'}><span className="font-mono">{r.runId}</span> · {formatDateTime(r.startedAt)} · {r.trigger} · {Date.now() - new Date(r.startedAt).getTime() < 3600000 ? 'en cours : les résultats s\'affichent à la fin de la recherche (quelques minutes), rechargez la page' : 'interrompue avant la fin (redémarrage du serveur pendant la recherche) : relancez-la'}</li> : <li key={r.runId}><span className="font-mono">{r.runId}</span> · {formatDateTime(r.startedAt)} · {r.trigger} · YouTube {r.sources?.youtube?.searched || 0} recherches, {r.sources?.youtube?.new || 0} nouveaux ({r.sources?.youtube?.withEmail || 0} avec email) · Instagram {r.sources?.instagram?.searched || 0} hashtags, {r.sources?.instagram?.new || 0} nouveaux ({r.sources?.instagram?.withEmail || 0} avec email) · Meta {r.sources?.meta?.searched || 0} recherches, {r.sources?.meta?.new || 0} nouveaux ({r.sources?.meta?.withEmail || 0} avec email) · {r.qualified} qualifiés{r.issues?.length ? ` · ${r.issues.length} erreur(s) : ${r.issues[0]}` : ''}</li>)}</ul>
          </details>
        ) : null}
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary-500" /> Tableau de bord</h3>
          <Button size="sm" variant="outline" onClick={() => setShowDash(!showDash)} title="Entonnoirs créateurs et marques (trouvés → email → qualifiés → contactés → répondu → intéressés → inscrits), conversion par niche, mots-clés et sources les plus productifs">{showDash ? 'Masquer' : 'Afficher'}</Button>
        </div>
        {showDash && dash && (
          <div className="mt-4 space-y-5">
            <div className="grid md:grid-cols-2 gap-6">
              <Funnel title="Créateurs, 30 derniers jours" f={dash.last30.creator} />
              <Funnel title="Marques, 30 derniers jours" f={dash.last30.brand} />
              <Funnel title="Créateurs, depuis le début" f={dash.total.creator} />
              <Funnel title="Marques, depuis le début" f={dash.total.brand} />
            </div>
            {dash.byNiche?.length ? (
              <div>
                <div className="text-sm font-medium text-neutral-800 mb-1">Ce qui convertit, par niche ou secteur (contactés → répondu → inscrits)</div>
                <table className="w-full text-xs"><thead><tr className="text-left text-neutral-500 border-b"><th className="py-1 pr-2">Type</th><th className="py-1 pr-2">Niche</th><th className="py-1 pr-2 text-right">Contactés</th><th className="py-1 pr-2 text-right">Répondu</th><th className="py-1 pr-2 text-right">Inscrits</th><th className="py-1 text-right">Taux</th></tr></thead>
                  <tbody>{dash.byNiche.map((r: any) => <tr key={`${r.kind}-${r.niche}`} className="border-b border-neutral-100"><td className="py-1 pr-2">{r.kind === 'creator' ? 'Créateur' : 'Marque'}</td><td className="py-1 pr-2">{r.niche}</td><td className="py-1 pr-2 text-right">{r.contacted}</td><td className="py-1 pr-2 text-right">{r.replied}</td><td className="py-1 pr-2 text-right">{r.registered}</td><td className="py-1 text-right">{r.contacted ? Math.round((r.registered / r.contacted) * 100) : 0} %</td></tr>)}</tbody></table>
              </div>
            ) : <p className="text-xs text-neutral-500">Le tableau par niche se remplit dès que des prospects sont contactés.</p>}
            {dash.byKeyword?.length ? (
              <div>
                <div className="text-sm font-medium text-neutral-800 mb-1">Mots-clés les plus productifs (trouvés → avec email → score ≥ 60 → inscrits)</div>
                <div className="flex flex-wrap gap-2">{dash.byKeyword.map((k: any) => <span key={`${k.kind}-${k.keyword}`} className="px-2 py-1 rounded-lg bg-neutral-100 text-xs">« {k.keyword} » : {k.found} · {k.withEmail} · {k.qualified} · {k.registered}</span>)}</div>
              </div>
            ) : null}
            <p className="text-xs text-neutral-500">Sources : {dash.bySource?.map((s: any) => `${SOURCE[s.source] || s.source} ${s.found} (${s.withEmail} avec email, ${s.registered} inscrits)`).join(' · ') || 'aucune'} · {dash.runsLast30} exécution(s) sur 30 jours.</p>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <div>
            <h3 className="font-semibold text-neutral-900 flex items-center gap-2"><Mail className="w-5 h-5 text-primary-500" /> Envoi automatique par l&apos;outil de mailing</h3>
            <p className="text-sm text-neutral-600 mt-1">Les prospects qualifiés avec email sont poussés dans deux listes de l&apos;outil ; vos séquences rattachées à ces listes envoient les emails et les relances. Réponses, désabonnements et rebonds reviennent ici chaque nuit ; un prospect qui s&apos;inscrit est retiré de la séquence.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => syncNow.mutate()} isLoading={syncNow.isPending} disabled={!ml?.settings?.configured} title="Récupère depuis l'outil de mailing les réponses, rebonds et désabonnements, met à jour les statuts et retire des séquences les prospects inscrits. Fait aussi chaque nuit."><RefreshCw className="w-4 h-4 mr-1" /> Synchroniser</Button>
            <Button size="sm" onClick={() => { if (confirm(`Pousser maintenant jusqu'à ${ml?.settings?.dailyLimit || 50} prospects éligibles (à contacter, ou qualifiés avec score ≥ ${ml?.settings?.minScore ?? 60}) vers l'outil de mailing ?`)) pushNow.mutate({}); }} isLoading={pushNow.isPending} disabled={!ml?.settings?.configured} title="Envoie tout de suite vers l'outil de mailing les prospects « À contacter » et les « Qualifiés » avec email au-dessus du score minimum, dans la limite quotidienne. Vos séquences rattachées aux listes font le reste."><Send className="w-4 h-4 mr-1" /> Pousser les éligibles</Button>
          </div>
        </div>
        {ml && (
          <div className="text-xs text-neutral-600 flex gap-3 flex-wrap">
            <span className={ml.settings.configured ? 'text-green-700' : 'text-red-700'}>Outil : {ml.settings.provider || 'aucun'}{ml.settings.configured ? (ml.account ? ` (compte ${ml.account.account || ml.account.user})` : '') : ' : MAILING_PROVIDER / MAILING_API_KEY absents'}{ml.error ? ` · erreur : ${ml.error}` : ''}</span>
            <span className={ml.settings.autoSend ? 'text-green-700' : 'text-orange-700'}>Envoi automatique : {ml.settings.autoSend ? 'activé' : 'désactivé'} · {ml.settings.dailyLimit} par nuit · score ≥ {ml.settings.minScore}</span>
            <span className={ml.settings.autoReply ? 'text-green-700' : 'text-neutral-600'}>Réponse automatique aux intéressés : {ml.settings.autoReply ? 'activée' : 'désactivée (à relire dans la liste)'}</span>
            <span>Éligibles : {ml.eligible} · poussés aujourd&apos;hui : {ml.pushedToday} · au total : {ml.pushedTotal} · réponses : {ml.replied}</span>
            {ml.lists?.map((l: any) => <span key={l.kind}>{l.name} : {l.id ? `${l.contacts} contact(s)` : 'sera créée au premier envoi'}</span>)}
          </div>
        )}
        <div className="border-t border-neutral-100 my-4" />
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {(['creator', 'brand'] as const).map((k) => <button key={k} type="button" onClick={() => { setKind(k); setSelected([]); }} className={`px-3 py-1.5 rounded-lg text-sm ${kind === k ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{k === 'creator' ? 'Créateurs' : 'Marques'} ({Object.values(ov?.counts?.[k] || {}).reduce((a: number, c: any) => a + c.n, 0)})</button>)}
          <span className="text-neutral-300">|</span>
          {['qualified', 'to_contact', 'contacted', 'replied', 'registered', 'new', 'rejected', 'excluded'].map((st) => <button key={st} type="button" onClick={() => { setStatus(status === st ? '' : st); setSelected([]); }} className={`px-2.5 py-1 rounded-full text-xs ${status === st ? 'bg-neutral-900 text-white' : STATUS[st].cls}`}>{STATUS[st].label} {total(st)}</button>)}
          <select value={hasEmail} onChange={(e) => setHasEmail(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1 text-xs"><option value="">Email : tous</option><option value="1">Avec email</option><option value="0">Sans email</option></select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" className="border border-neutral-300 rounded-lg px-2 py-1 text-xs w-40" />
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-4 text-xs">
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} title="Saisir un prospect à la main (nom, profil, email, bio) : il est qualifié aussitôt par l'IA"><UserPlus className="w-4 h-4 mr-1" /> Ajouter à la main</Button>
          <Button size="sm" variant="outline" onClick={() => setImporting(!importing)} data-testid="import-toggle" title="Coller une liste (une ligne par prospect) venant de l'assistant Chrome, d'un salon ou d'un fichier : dédoublonnée, réseaux relevés, qualifiée par l'IA"><Upload className="w-4 h-4 mr-1" /> Import groupé (liste collée)</Button>
          {kind === 'creator' && <Button size="sm" variant="outline" onClick={copyIgLinks} title="Copie les liens des publications Instagram trouvées par hashtag dont l'auteur n'est pas encore connu (60 au plus). À coller dans la consigne « Créateurs Instagram » de l'assistant Chrome (docs/AGENT-CHROME.md) ; le résultat se recolle dans « Import groupé », qui complète ces fiches au lieu d'en créer de nouvelles." data-testid="copy-ig-links"><Copy className="w-4 h-4 mr-1" /> Copier les liens Instagram sans auteur</Button>}
          <Button size="sm" variant="outline" onClick={() => enrichEmails.mutate()} isLoading={enrichEmails.isPending} title="Pour les prospects de cet onglet qui ont un site web mais pas d'email : visite la page d'accueil, la page contact et les mentions légales, et relève l'adresse. Tourne en arrière-plan, sans appel à l'IA ; 5 à 15 secondes par site. Fait automatiquement à chaque import groupé." data-testid="enrich-emails"><Mail className="w-4 h-4 mr-1" /> Chercher les emails (sites web)</Button>
          <Button size="sm" variant="outline" onClick={() => enrichSocials.mutate()} isLoading={enrichSocials.isPending} title="Cherche Instagram et TikTok pour tous les prospects qui ne les ont pas encore : dans leur bio, puis dans la rubrique « Liens » de leur chaîne YouTube. Tourne en arrière-plan, sans appel à l'IA ; rechargez la page dans quelques minutes." data-testid="enrich-socials"><RefreshCw className="w-4 h-4 mr-1" /> Compléter les réseaux (tous)</Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv(false)} title="Télécharge un CSV des prospects de la file affichée qui ont un email (prénom, pseudo, niche, réseaux, paragraphe et message personnalisés, lien d'inscription) pour votre outil de mailing"><Download className="w-4 h-4 mr-1" /> Export CSV (avec email)</Button>
          <Button size="sm" variant="outline" onClick={() => { if (confirm('Exporter et marquer ces prospects « contactés » ?')) exportCsv(true); }} title="Même export, puis passe ces prospects en « Contacté » (canal email) pour ne pas les exporter deux fois"><Download className="w-4 h-4 mr-1" /> Export + marquer contactés</Button>
          {kind === 'creator' && <Button size="sm" variant="outline" onClick={() => { if (confirm(selected.length ? `Ajouter ${selected.length} créateur(s) à l'annuaire des créateurs référencés ?` : 'Ajouter tous les créateurs qualifiés à l\'annuaire des créateurs référencés ?')) importDir.mutate(selected.length ? selected : undefined); }} isLoading={importDir.isPending} title="Ajoute les créateurs sélectionnés (ou tous les qualifiés) à l'annuaire public des créateurs référencés, avec leur séquence email habituelle">Vers l&apos;annuaire {selected.length ? `(${selected.length})` : '(tous les qualifiés)'}</Button>}
          {selected.length > 0 && <>
            <span className="text-neutral-500">{selected.length} sélectionné(s) :</span>
            <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids: selected, status: 'to_contact' })} title="Valide ces prospects pour l'envoi : ils seront poussés vers l'outil de mailing quel que soit leur score">À contacter</Button>
            <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids: selected, status: 'contacted', contactedVia: 'email' })} title="Marque ces prospects comme contactés (par exemple après un message envoyé à la main sur les réseaux)">Contactés</Button>
            {ml?.settings?.configured && <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Pousser ${selected.length} prospect(s) vers l'outil de mailing, quel que soit le score ?`)) pushNow.mutate({ ids: selected }); }} title="Pousse la sélection vers l'outil de mailing tout de suite, quel que soit le score"><Send className="w-3.5 h-3.5 mr-1" /> Vers le mailing</Button>}
            <Button size="sm" variant="ghost" onClick={() => bulk.mutate({ ids: selected, status: 'rejected' })} title="Écarte ces prospects : ils ne seront ni exportés ni poussés vers le mailing">Hors cible</Button>
          </>}
        </div>
        {adding && <ManualForm onDone={() => { setAdding(false); refresh(); }} />}
        {importing && <ImportForm kind={kind} onDone={() => { setImporting(false); refresh(); }} />}
        {isLoading ? <p className="text-sm text-neutral-500">Chargement…</p> : !data?.leads?.length ? (
          <p className="text-sm text-neutral-500">Aucun prospect dans cette catégorie. {status === 'qualified' && total('new') > 0 ? `${total('new')} en attente de qualification (IA).` : ''} Lancez une recherche ou activez la recherche nocturne dans les réglages.</p>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-neutral-500 flex items-center gap-2"><input type="checkbox" checked={selected.length === data.leads.length} onChange={(e) => setSelected(e.target.checked ? data.leads.map((l: any) => l._id) : [])} /> Tout sélectionner ({data.total} au total)</label>
            {data.leads.map((l: any) => {
              const st = STATUS[l.status] || STATUS.new;
              return (
                <div key={l._id} className="border border-neutral-200 rounded-lg p-3 text-sm" data-testid="lead">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1" checked={selected.includes(l._id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l._id] : selected.filter(x => x !== l._id))} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-neutral-900">{l.name}</span>
                        {l.handle && <span className="text-neutral-500">{l.handle}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs ${st.cls}`}>{st.label}</span>
                        {l.score != null && <span className={`px-2 py-0.5 rounded-full text-xs ${l.score >= 70 ? 'bg-green-100 text-green-800' : l.score >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-neutral-100 text-neutral-600'}`}>score {l.score}</span>}
                        <span className="text-xs text-neutral-500">{SOURCE[l.source] || l.source} · {l.niche || '?'}{l.stats?.subscribers ? ` · ${l.stats.subscribers.toLocaleString('fr-FR')} abonnés` : ''}{l.stats?.ads ? ` · ${l.stats.ads} annonce(s)` : ''}{l.source === 'instagram' && l.stats?.likes != null ? ` · ${l.stats.likes} j'aime` : ''}{l.keyword ? ` · « ${l.keyword} »` : ''}</span><SocialLinks socials={l.socials} />
                      </div>
                      <div className="text-xs text-neutral-600 mt-1">{l.email ? <span className="text-green-700">{l.email} <span className="text-neutral-400">({l.emailSource})</span></span> : <span className="text-orange-700">pas d&apos;email : contact sur le réseau</span>}{l.aiSummary ? ` · ${l.aiSummary}` : ''}{l.signals?.length ? ` · ${l.signals.join(' · ')}` : ''}{l.error ? <span className="text-red-600"> · {l.error}</span> : ''}{l.mailing?.pushedAt ? <span className="text-primary-700"> · envoyé via {l.mailing.provider} le {formatDateTime(l.mailing.pushedAt)}</span> : ''}</div>
                      {l.message && <div className="text-xs text-neutral-700 mt-1 bg-neutral-50 rounded px-2 py-1">{l.message}</div>}
                      {embedProvider(l.url) && <div className="mt-2 max-w-xl"><SocialEmbed url={l.url} compact onAuthor={(a) => { if (l.source === 'instagram' && !l.handle && a.name) patch.mutate({ id: l._id, handle: a.name, socials: { instagram: `https://www.instagram.com/${String(a.name).replace(/^@/, '')}/` } }); }} /></div>}
                      {l.notes && <div className="text-xs text-neutral-500 mt-1">Note : {l.notes}</div>}
                      {l.mailing?.replyText && <ReplyBox lead={l} onSent={refresh} />}
                      {l.draftCampaignId && <div className="text-xs text-green-700 mt-1">Inscrit : première campagne préparée en brouillon</div>}
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end shrink-0">
                      {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-neutral-500 hover:text-primary-600" title="Ouvrir le profil"><ExternalLink className="w-4 h-4" /></a>}
                      {l.message && <button type="button" onClick={() => copy(l.message)} className="p-1.5 text-neutral-500 hover:text-primary-600" title="Copier le message"><Copy className="w-4 h-4" /></button>}
                      <button type="button" onClick={() => requalify.mutate(l._id)} className="p-1.5 text-neutral-500 hover:text-primary-600" title="Relance la qualification IA : score, signaux, message, paragraphe email, et complète les réseaux depuis la bio ou la chaîne YouTube"><RefreshCw className="w-4 h-4" /></button>
                      <select value={l.status} onChange={(e) => patch.mutate({ id: l._id, status: e.target.value, contactedVia: 'manuel' })} className="border border-neutral-300 rounded px-1 py-1 text-xs" aria-label="Statut" title="Changer le statut du prospect à la main">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                      <button type="button" onClick={() => { const n = prompt('Note', l.notes || ''); if (n !== null) patch.mutate({ id: l._id, notes: n }); }} className="px-1.5 text-xs text-neutral-500 hover:text-primary-600" title="Ajouter une note interne sur ce prospect">Note</button>
                      <button type="button" onClick={() => { const ig = prompt('Instagram (URL du profil, vide pour effacer)', l.socials?.instagram || ''); if (ig === null) return; const tt = prompt('TikTok (URL du profil, vide pour effacer)', l.socials?.tiktok || ''); if (tt === null) return; patch.mutate({ id: l._id, socials: { instagram: ig, tiktok: tt } }); }} className="px-1.5 text-xs text-neutral-500 hover:text-primary-600" title="Saisir ou corriger les liens Instagram et TikTok du prospect">Réseaux</button>
                      {!l.email && <button type="button" onClick={() => { const e = prompt('Email trouvé à la main'); if (e) patch.mutate({ id: l._id, email: e }); }} className="px-1.5 text-xs text-neutral-500 hover:text-primary-600" title="Renseigner un email trouvé à la main : le prospect devient éligible au mailing">Email</button>}
                      <button type="button" onClick={() => { if (confirm('Supprimer ce prospect ?')) remove.mutate(l._id); }} className="p-1.5 text-neutral-400 hover:text-red-600" title="Supprimer définitivement ce prospect"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
