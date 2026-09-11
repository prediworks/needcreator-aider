import type { NextStep } from '@/components/NextStepCard';

const label = (items: any[], key: string) => items.find((i) => i.key === key)?.label;
const missing = (items: any[]) => items.filter((i) => !i.done);

/** Créateur : la prochaine action utile, dans l'ordre du parcours */
export function creatorNextStep(user: any): { step: NextStep | null; remaining: string[]; showAmbassador: boolean } {
  const items: any[] = user.profileChecklist || [];
  const portfolio = user.profile?.portfolio?.length || 0;
  const validated = user.status === 'active' && !!user.verification?.portfolio;
  const rest = () => missing(items).map((i) => i.label.toLowerCase());
  if (portfolio < 3) return { step: { title: 'Ajoutez 3 vidéos à votre portfolio', text: `${portfolio}/3 pour l'instant. C'est ce que les marques regardent en premier, et la condition pour envoyer un devis.`, href: '/profile', cta: 'Ajouter mes vidéos' }, remaining: rest().filter((l) => !l.includes('vidéos')), showAmbassador: false };
  if (!user.hasLegalInfo) return { step: { title: 'Renseignez vos informations administratives', text: 'Identité, statut, adresse : elles figurent sur le contrat de chaque mission. Obligatoires pour envoyer un devis.', href: '/profile', cta: 'Compléter' }, remaining: rest().filter((l) => !l.includes('administratives')), showAmbassador: false };
  if (user.status === 'pending') return { step: { title: 'Votre profil est en cours de validation', text: 'Notre équipe vérifie votre portfolio sous 24 h. Vous recevrez un email dès que vous pourrez envoyer des devis.' }, remaining: rest(), showAmbassador: false };
  if (validated && !['approved', 'pending'].includes(user.profile?.ambassador?.status)) {
    return { step: { title: 'Profil validé : devenez Ambassadeur', text: 'En attendant votre première mission, publiez une vidéo sur NeedCreator et soyez mis en avant auprès des marques.' }, remaining: rest(), showAmbassador: true };
  }
  const next = missing(items)[0];
  if (next) return { step: { title: next.label, text: 'Un profil complet augmente vos chances d\'être sélectionné.', href: '/profile', cta: 'Compléter' }, remaining: rest().slice(1), showAmbassador: false };
  return { step: null, remaining: [], showAmbassador: false };
}

/** Marque : la prochaine action utile */
export function brandNextStep(user: any, campaignsCount: number): { step: NextStep | null; remaining: string[] } {
  const items: any[] = user.profileChecklist || [];
  const rest = () => missing(items).map((i) => i.label.toLowerCase());
  if (!user.businessVerified) return { step: { title: 'Vérifiez votre entreprise', text: 'SIRET ou numéro de TVA : indispensable pour publier une campagne. La vérification est immédiate.', href: '/profile', cta: 'Vérifier' }, remaining: rest().filter((l) => !l.includes('vérifiée')) };
  if (campaignsCount === 0) return { step: { title: 'Créez votre première campagne', text: 'Brief guidé, budget facultatif, rédaction assistée par l\'IA. Cinq minutes suffisent.', href: '/campaigns/new', cta: 'Créer une campagne' }, remaining: rest() };
  if (!user.hasLegalInfo) return { step: { title: 'Indiquez le signataire des contrats', text: 'Nécessaire pour accepter un devis : le nom figure sur le contrat de mission.', href: '/profile', cta: 'Compléter' }, remaining: rest().filter((l) => !l.includes('signataire')) };
  const next = missing(items)[0];
  if (next) return { step: { title: label(items, next.key) || next.label, text: 'Un profil complet rassure les créateurs qui reçoivent vos campagnes.', href: '/profile', cta: 'Compléter' }, remaining: rest().slice(1) };
  return { step: null, remaining: [] };
}
