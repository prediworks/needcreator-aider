import type { Metadata } from 'next';
import LegalLayout from '@/components/legal/LegalLayout';
import { COMPANY, TERMS_FIGURES } from '@/lib/legal';
import { fetchPublicConfig } from '@/lib/publicConfig';

export const metadata: Metadata = {
  title: 'Conditions générales d\'utilisation',
  description: 'Conditions générales d\'utilisation de la plateforme NeedCreator : règles applicables aux marques et aux créateurs de contenu UGC.',
  alternates: { canonical: '/legal/cgu' },
};

export default async function TermsPage() {
  const cfg = await fetchPublicConfig();
  const F = { ...TERMS_FIGURES, maxRevisions: cfg.maxRevisions, autoApprovalDays: cfg.autoApprovalDays, minCreatorVideos: cfg.minCreatorVideos };
  return (
    <LegalLayout title="Conditions générales d'utilisation">
      <h2>1. Objet</h2>
      <p>
        {COMPANY.brand} (ci-après « la Plateforme »), éditée par {COMPANY.legalName}, met en relation des entreprises
        (« Marques ») et des créateurs de contenu indépendants (« Créateurs ») pour la production de vidéos dites UGC
        (contenu généré par les utilisateurs). Les présentes conditions générales d&apos;utilisation (« CGU ») régissent l&apos;accès
        et l&apos;utilisation de la Plateforme. Toute inscription vaut acceptation pleine et entière des CGU.
      </p>

      <h2>2. Inscription et compte</h2>
      <ul>
        <li>L&apos;inscription est réservée aux personnes majeures. Les Créateurs agissent en qualité de professionnels indépendants (micro-entreprise ou société) et sont responsables de leurs obligations fiscales et sociales.</li>
        <li>Les Marques doivent fournir des informations d&apos;identification exactes (SIRET ou numéro de TVA, site web). La Plateforme peut vérifier ces informations auprès des registres publics et refuser ou suspendre un compte non vérifiable.</li>
        <li>Le profil d&apos;un Créateur est validé par l&apos;équipe de la Plateforme après dépôt d&apos;au moins {F.minCreatorVideos} vidéos de portfolio.</li>
        <li>Chaque utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte.</li>
      </ul>

      <h2>3. Fonctionnement d&apos;une mission</h2>
      <ol>
        <li>La Marque publie une campagne décrivant le contenu attendu (brief), le nombre de vidéos et, le cas échéant, un budget.</li>
        <li>Les Créateurs intéressés transmettent un devis (prix, délai, droits d&apos;utilisation proposés).</li>
        <li>La Marque sélectionne un ou plusieurs devis. Le montant correspondant est alors autorisé sur son moyen de paiement (empreinte bancaire), sans être débité. Un contrat de mission et de cession de droits, reprenant le devis accepté et les informations administratives des deux parties, est généré au format PDF et mis à leur disposition.</li>
        <li>Le Créateur livre les vidéos via la Plateforme. La Marque dispose de {F.autoApprovalDays} jours pour valider ou demander des modifications, dans la limite du nombre de révisions prévu au devis, qui ne peut excéder {F.maxRevisions}. Sans réponse dans ce délai, la livraison est réputée acceptée. Lorsqu&apos;une modification est demandée, le Créateur livre une nouvelle version dans le délai indiqué par la Plateforme ; à défaut, et après relance, la mission peut être refusée définitivement : le montant réservé est alors restitué à la Marque et le Créateur n&apos;est pas rémunéré.</li>
        <li>À la validation, le paiement est débité. La Marque ne paie que le montant du devis, hors taxes, majoré de la TVA lorsque le Créateur y est assujetti (ce régime est indiqué sur chaque devis). Le Créateur reçoit ce montant, déduction faite de la commission de la Plateforme.</li>
      </ol>

      <h2>4. Prix, commission et paiement</h2>
      <ul>
        <li>Les prix sont fixés librement par les Créateurs dans leurs devis et exprimés en euros hors taxes.</li>
        <li>Aucun frais n&apos;est ajouté au prix du devis pour la Marque. La Plateforme perçoit du Créateur une commission d&apos;intermédiation de {F.commissionPercent} % du prix hors taxes de chaque mission rémunérée, soumise à la TVA au taux en vigueur, retenue par compensation sur la somme versée au Créateur. Pour un Créateur assujetti à la TVA, la commission s&apos;ajoute hors taxes (10 € HT, 12 € TTC pour un devis de 100 € HT) ; pour un Créateur en franchise en base, la commission de 10 % s&apos;entend toutes taxes comprises (10 € TTC pour un devis de 100 €). Aucune commission n&apos;est retenue sur les campagnes gifting.</li>
        <li><strong>Mandat de facturation.</strong> Le Créateur donne mandat à la Plateforme (PREDIWORKS SAS) d&apos;établir et d&apos;émettre en son nom et pour son compte les factures correspondant à ses missions, selon une numérotation chronologique qui lui est propre. Ce mandat est accepté dans son profil, préalablement à tout devis. Le Créateur reste responsable de ses obligations déclaratives et fiscales et peut contester une facture dans les 15 jours de son émission. La Plateforme émet en son nom propre les factures de commission au Créateur et les factures de services à la Marque.</li>
        <li>L&apos;offre Pro est un abonnement mensuel de {F.proPriceEur} € HT, sans engagement, donnant accès à des fonctionnalités supplémentaires (rédaction de brief par l&apos;IA illimitée, campagnes multi-créateurs, gifting, absence de limites), avec une période d&apos;essai de {F.proTrialDays} jours offerte à l&apos;inscription. Il est résiliable à tout moment depuis l&apos;espace de gestion de l&apos;abonnement et prend fin à l&apos;échéance en cours.</li>
        <li>Les campagnes « gifting » (produit offert sans rémunération) donnent lieu à des frais de service de {F.giftingFeePerVideo} € HT par vidéo livrée, facturés à la Marque.</li>
        <li>Les paiements sont opérés par Stripe. Les Créateurs reçoivent leurs paiements sur un compte Stripe Connect qu&apos;ils ouvrent depuis leur profil. La Plateforme ne conserve aucune donnée bancaire.</li>
        <li>Certaines options (pack vidéo prête à diffuser) sont facturées au prix indiqué au moment de la commande.</li>
      </ul>

      <h2>5. Propriété intellectuelle et droits d&apos;utilisation</h2>
      <ul>
        <li>Le Créateur garantit être l&apos;auteur des contenus livrés et disposer de toutes les autorisations nécessaires (personnes filmées, musiques, lieux).</li>
        <li>À la validation de la livraison et au paiement complet, le Créateur cède à la Marque les droits d&apos;utilisation décrits dans le devis accepté (supports, territoires, durée). À défaut de précision, la cession couvre une utilisation sur les réseaux sociaux et le site web de la Marque, dans le monde entier, pour une durée de douze mois.</li>
        <li>Le Créateur conserve le droit de présenter les contenus dans son portfolio, sauf demande contraire de la Marque formulée via la Plateforme.</li>
        <li>À l&apos;approche de la fin des droits, les deux parties sont prévenues. La Marque peut demander une prolongation ; le Créateur en fixe librement le prix et la durée. La prolongation acceptée et payée fait l&apos;objet d&apos;un avenant, soumis à la même commission qu&apos;une mission.</li>
        <li>Les éléments de la Plateforme (marque, logo, interface, textes) restent la propriété exclusive de {COMPANY.legalName}.</li>
      </ul>

      <h2>6. Engagements des utilisateurs</h2>
      <ul>
        <li>Ne pas contourner la Plateforme : toute mission initiée sur la Plateforme doit y être contractée et payée. Les coordonnées directes sont masquées avant la sélection.</li>
        <li>Ne pas publier de contenus illicites, trompeurs, contrefaisants ou portant atteinte aux droits de tiers.</li>
        <li>Respecter les règles applicables à la publicité et aux partenariats commerciaux, notamment la mention du caractère publicitaire des contenus lors de leur diffusion.</li>
        <li>Adopter un comportement respectueux dans la messagerie. Tout abus peut être signalé et entraîner une suspension.</li>
      </ul>

      <h2>7. Modération, suspension et litiges</h2>
      <ul>
        <li>La Plateforme peut suspendre ou fermer un compte en cas de manquement aux CGU, de fraude ou de signalement fondé, après en avoir informé l&apos;utilisateur sauf urgence.</li>
        <li>En cas de désaccord sur une livraison, les parties recherchent d&apos;abord une solution via la messagerie. À défaut, l&apos;équipe de la Plateforme peut être saisie à {COMPANY.contactEmail} et proposer une solution (nouvelle révision, remboursement partiel ou total).</li>
        <li>Les avis publiés après une mission doivent être sincères et porter sur la collaboration.</li>
      </ul>

      <h2>8. Responsabilité</h2>
      <p>
        La Plateforme est un intermédiaire technique. Elle n&apos;est pas partie au contrat de prestation conclu entre la Marque
        et le Créateur et ne garantit ni le résultat commercial des contenus, ni leur conformité à des exigences non
        exprimées dans le brief. La Plateforme s&apos;efforce d&apos;assurer un service disponible et sécurisé, sans garantie
        d&apos;absence d&apos;interruption. Sa responsabilité est limitée aux montants de commission perçus sur la mission concernée.
      </p>

      <h2>9. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la <a href="/legal/confidentialite">politique de confidentialité</a>,
        qui fait partie intégrante des présentes.
      </p>

      <h2>10. Durée, résiliation et suppression de compte</h2>
      <p>
        Les CGU s&apos;appliquent pendant toute la durée d&apos;utilisation de la Plateforme. Chaque utilisateur peut supprimer son compte
        depuis son profil, sous réserve d&apos;avoir terminé ses missions en cours. Les données de facturation sont conservées
        de façon anonymisée pendant la durée légale.
      </p>

      <h2>11. Modification des CGU</h2>
      <p>
        La Plateforme peut modifier les CGU. Les utilisateurs sont informés de la nouvelle version lors de leur
        connexion et doivent l&apos;accepter pour continuer à utiliser le service.
      </p>

      <h2>12. Droit applicable</h2>
      <p>
        Les CGU sont soumises au droit français. En cas de litige, et après tentative de résolution amiable, les
        tribunaux compétents sont ceux du ressort du siège de {COMPANY.legalName}. Conformément aux articles L.616-1 et R.616-1
        du Code de la consommation, un consommateur peut recourir gratuitement à un médiateur de la consommation.
      </p>

      <p>Contact : <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a></p>
    </LegalLayout>
  );
}
