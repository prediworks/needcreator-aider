/** Sous un bouton grisé : dit ce qui manque, pour ne jamais laisser l'utilisateur deviner */
export default function MissingHint({ items, className = '' }: { items: (string | false | null | undefined)[]; className?: string }) {
  const list = items.filter(Boolean) as string[];
  if (!list.length) return null;
  return <p className={`text-xs text-orange-700 mt-2 ${className}`}>Il manque : {list.join(', ')}.</p>;
}
