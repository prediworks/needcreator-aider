import type { NextStep, NextItem } from '@/components/NextStepCard';
import { profileHref } from '@/lib/profileAnchors';

const label = (items: any[], key: string) => items.find((i) => i.key === key)?.label;
const missing = (items: any[]) => items.filter((i) => !i.done);
const toItems = (items: any[]): NextItem[] => items.map((i) => ({ label: i.label.toLowerCase(), href: profileHref(i.key), key: i.key }));

/** Créateur : la prochaine action utile, dans l'ordre du parcours */
export function creatorNextStep(user: any): { step: NextStep | null; remaining: NextItem[]; showAmbassador: boolean } {
  const items: any[] = user.profileChecklist || [];
  const portfolio = user.profile?.portfolio?.length || 0;
  const validated = user.status === 'active' && !!user.verification?.portfolio;
  const rest = () => toItems(missing(items));
  if (portfolio < 3) return { step: { title: 'Ajoutez 3 vidéos à votre portfolio', text: `${portfolio}/3 pour l'instant. C'est ce que les marques regardent en premier, et la condition pour envoyer un devis.`, href: profileHref('portfolio'), cta: 'Ajouter mes vidéos' }, remaining: rest().filter((l) => l.key !== 'portfolio'), showAmbassador: false };
  if (!user.hasLegalInfo) return { step: { title: 'Renseignez vos informations administratives', text: 'Identité, statut, adresse : elles figurent sur le contrat de chaque mission. Obligatoires pour envoyer un devis.', href: profileHref('legal'), cta: 'Compléter' }, remaining: rest().filter((l) => l.key !== 'legal'), showAmbassador: false };
  if (user.status === 'pending') return { step: { title: 'Votre profil est en cours de validation', text: 'Notre équipe vérifie votre portfolio sous 24 h. Vous recevrez un email dès que vous pourrez envoyer des devis.' }, remaining: rest(), showAmbassador: false };
  if (validated && !['approved', 'pending'].includes(user.profile?.ambassador?.status)) {
    return { step: { title: 'Profil validé : devenez Ambassadeur', text: 'En attendant votre première mission, publiez une vidéo sur NeedCreator et soyez mis en avant auprès des marques.', href: profileHref('ambassador'), cta: 'Voir le programme' }, remaining: rest(), showAmbassador: true };
  }
  const next = missing(items)[0];
  if (next) return { step: { title: next.label, text: 'Un profil complet augmente vos chances d\'être sélectionné.', href: profileHref(next.key), cta: 'Compléter' }, remaining: rest().slice(1), showAmbassador: false };
  return { step: null, remaining: [], showAmbassador: false };
}

/** Marque : la prochaine action utile */
export function brandNextStep(user: any, campaignsCount: number): { step: NextStep | null; remaining: NextItem[] } {
  const items: any[] = user.profileChecklist || [];
  const rest = () => toItems(missing(items));
  if (!user.businessVerified) return { step: { title: 'Vérifiez votre entreprise', text: 'SIRET ou numéro de TVA : indispensable pour publier une campagne. La vérification est immédiate (contrôle manuel sous 24 h pour une entreprise hors Union européenne).', href: profileHref('verified'), cta: 'Vérifier' }, remaining: rest().filter((l) => l.key !== 'verified') };
  if (campaignsCount === 0) return { step: { title: 'Créez votre première campagne', text: 'Brief guidé, budget facultatif, rédaction assistée par l\'IA. Cinq minutes suffisent.', href: '/campaigns/new', cta: 'Créer une campagne' }, remaining: rest() };
  if (!user.hasLegalInfo) return { step: { title: 'Indiquez le signataire des contrats', text: 'Nécessaire pour accepter un devis : le nom figure sur le contrat de mission.', href: profileHref('legal'), cta: 'Compléter' }, remaining: rest().filter((l) => l.key !== 'legal') };
  const next = missing(items)[0];
  if (next) return { step: { title: label(items, next.key) || next.label, text: 'Un profil complet rassure les créateurs qui reçoivent vos campagnes.', href: profileHref(next.key), cta: 'Compléter' }, remaining: rest().slice(1) };
  return { step: null, remaining: [] };
}
