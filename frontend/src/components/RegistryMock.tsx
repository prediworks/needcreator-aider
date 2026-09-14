import { Clock, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

/** Maquette statique du registre « Contenus & droits » : montre en deux secondes ce que suit NeedCreator */
export default function RegistryMock({ compact = false }: { compact?: boolean }) {
  const rows = [
    { title: 'Unboxing sérum vitamine C', who: 'Léa M. · mission NeedCreator', kind: 'Vidéo', end: 'jusqu\'au 12/03/2027', supports: 'Réseaux, publicité', status: 'active' },
    { title: 'Spot printemps, agence Soleil', who: 'Agence Soleil · contenu extérieur', kind: 'Vidéo', end: 'expire dans 12 jours', supports: 'Publicité, site', status: 'expiring' },
    { title: 'Packshots gamme été', who: 'Marc P. · photographe direct', kind: 'Photo', end: 'expiré le 02/09/2026', supports: 'Fiche produit', status: 'expired' },
  ];
  const badge: Record<string, { cls: string; icon: any; label: string }> = {
    active: { cls: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Actif' },
    expiring: { cls: 'bg-orange-100 text-orange-800', icon: Clock, label: 'Expire sous 30 j' },
    expired: { cls: 'bg-red-100 text-red-800', icon: AlertTriangle, label: 'Expiré' },
  };
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden text-left" aria-label="Exemple de registre Contenus et droits">
      <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between text-xs text-neutral-500">
        <span>Contenus &amp; droits · 3 contenus suivis</span>
        <span className="text-orange-700 font-medium">1 expire bientôt · 1 expiré</span>
      </div>
      <ul className="divide-y divide-neutral-100">
        {rows.map((r) => { const b = badge[r.status]; const Icon = b.icon; return (
          <li key={r.title} className={`px-4 ${compact ? 'py-2.5' : 'py-3'} flex items-start justify-between gap-3`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-neutral-900 text-sm">{r.title}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${b.cls}`}><Icon className="w-3 h-3" /> {b.label}</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-neutral-100 text-neutral-700">{r.kind}</span>
              </div>
              <div className="text-xs text-neutral-600 mt-0.5">{r.who} · droits {r.end} · {r.supports}</div>
            </div>
            {r.status !== 'active' && <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-white bg-primary-500 rounded-md px-2 py-1"><RefreshCw className="w-3 h-3" /> Renouveler</span>}
          </li>
        ); })}
      </ul>
    </div>
  );
}
