'use client';

/**
 * Haut de la page d'un scan ou d'un audit, à lire d'un coup d'œil.
 * Frise : une barre par publicité, d'autant plus haute qu'elle tourne depuis longtemps ; au-dessus du trait des 90 jours, elle est verte
 * (une publicité maintenue trois mois est une publicité qui rapporte). Jauge : les angles utilisés sur l'ensemble des angles relevés.
 * Ce sont des comptes, pas une note : la page ne juge pas les publicités.
 */
export function ScanTimeline({ days, compact = false, scale = 0 }: { days: number[]; compact?: boolean; scale?: number }) {
  const list = [...(days || [])].filter(d => typeof d === 'number' && d >= 0).sort((a, b) => b - a);
  if (list.length < 2) return null;
  const top = Math.max(list[0], scale, 100); // l'échelle montre toujours le trait des 90 jours ; `scale` : même échelle pour deux marques côte à côte
  const over = list.filter(d => d >= 90).length;
  return (
    <div className={compact ? '' : 'mt-5'} data-testid="ad-scan-timeline">
      {!compact && <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-sm font-medium text-neutral-900">Depuis combien de temps tourne chaque publicité</div>
        <div className="text-[11px] text-neutral-500 flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-600 inline-block" /> <span>plus de 90 jours</span></span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-neutral-300 inline-block" /> <span>plus récentes</span></span>
        </div>
      </div>}
      <div className="relative mt-2 h-24 rounded-lg bg-neutral-50 border border-neutral-100 px-2 pt-2" role="img" aria-label={`${list.length} publicités, la plus ancienne depuis ${list[0]} jours, ${over} depuis plus de 90 jours`}>
        <div className="absolute left-0 right-0 border-t border-dashed border-green-600/60" style={{ bottom: `${(90 / top) * 100}%` }}>
          <span className="absolute right-1 -top-4 text-[10px] text-green-700 bg-neutral-50 px-1">90 jours</span>
        </div>
        <div className="relative h-full flex items-end gap-[2px]">
          {list.map((d, i) => (
            <div key={i} className={`flex-1 max-w-[14px] min-w-[2px] rounded-t-sm ${d >= 90 ? 'bg-green-600' : 'bg-neutral-300'}`} style={{ height: `${Math.max(4, (d / top) * 100)}%` }} title={`${d} jour${d > 1 ? 's' : ''}`} />
          ))}
        </div>
      </div>
      <div className={`mt-1 justify-between text-[11px] text-neutral-500 ${compact ? 'hidden' : 'flex'}`}>
        <span>{`La plus ancienne : ${list[0]} j`}</span>
        <span>{`La plus récente : ${list[list.length - 1]} j`}</span>
      </div>
    </div>
  );
}

export function AngleCoverage({ used, free, own = false }: { used: number; free: number; own?: boolean }) {
  const total = used + free;
  if (!used || !free || total > 16) return null;
  return (
    <div className="mt-5" data-testid="ad-scan-coverage">
      <div className="text-sm font-medium text-neutral-900">{`Angles utilisés : ${used} sur ${total}`}</div>
      <div className="mt-2 flex gap-1.5" role="img" aria-label={`${used} angles utilisés sur ${total}`}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`h-3 flex-1 max-w-[56px] rounded-full ${i < used ? 'bg-primary-600' : 'border border-dashed border-primary-400 bg-white'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-neutral-600">{own ? `${free} angle${free > 1 ? 's' : ''} que vos publicités n'utilisent pas : c'est là qu'une vidéo créateur apporte du neuf.` : `${free} angle${free > 1 ? 's' : ''} que ces publicités n'utilisent pas : c'est là qu'une vidéo créateur sort du lot.`}</p>
    </div>
  );
}
