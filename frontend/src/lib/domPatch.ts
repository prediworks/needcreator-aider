/**
 * Traduction automatique du navigateur (Google Traduction, Edge…) : elle enveloppe les textes dans des balises <font>,
 * et React plante ensuite en retirant ou insérant un nœud qui n'est plus à sa place (« removeChild » / « insertBefore »
 * … is not a child of this node), ce qui affiche la page d'erreur. On ignore ces opérations impossibles au lieu de planter.
 * Contournement connu (facebook/react#11538). Installé une seule fois, avant l'affichage de l'application.
 */
export function installDomPatch() {
  if (typeof window === 'undefined' || typeof Node !== 'function' || (window as any).__ncDomPatch) return;
  (window as any).__ncDomPatch = true;
  const proto = Node.prototype as any;
  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child);
  };
  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, newNode: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return newNode;
    return insertBefore.call(this, newNode, ref);
  };
}
