import type { Metadata } from 'next';
import LegalLayout from '@/components/legal/LegalLayout';
import { COMPANY } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Comment NeedCreator collecte, utilise et protège vos données personnelles (RGPD).',
  alternates: { canonical: '/legal/confidentialite' },
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <p>
        Cette politique décrit les traitements de données personnelles réalisés par {COMPANY.legalName} (« nous »),
        responsable du traitement, dans le cadre de la plateforme {COMPANY.brand}, conformément au Règlement général sur la
        protection des données (RGPD) et à la loi Informatique et Libertés.
      </p>

      <h2>1. Données collectées</h2>
      <ul>
        <li><strong>Compte</strong> : adresse email, mot de passe (géré par Firebase Authentication, jamais stocké en clair chez nous), rôle (marque ou créateur).</li>
        <li><strong>Profil créateur</strong> : nom ou pseudo, biographie, niches, tarifs, vidéos de portfolio, réseaux sociaux et audiences déclarées, réalisations, adresse postale (pour l&apos;envoi de produits), badges et statistiques d&apos;activité.</li>
        <li><strong>Profil marque</strong> : raison sociale, SIRET ou numéro de TVA, site web, secteur, nom de la personne de contact.</li>
        <li><strong>Activité</strong> : campagnes, devis, livraisons, messages échangés, avis, signalements, historique de paiement (montants, statuts), adresses IP et journaux techniques.</li>
        <li><strong>Paiement</strong> : les données bancaires sont collectées et traitées directement par Stripe. Nous ne recevons qu&apos;un identifiant de client et de moyen de paiement.</li>
      </ul>

      <h2>2. Finalités et bases légales</h2>
      <table>
        <thead><tr><th>Finalité</th><th>Base légale</th></tr></thead>
        <tbody>
          <tr><td>Création et gestion du compte, mise en relation, exécution des missions et des paiements</td><td>Exécution du contrat (CGU)</td></tr>
          <tr><td>Vérification des entreprises (contrôle du SIRET auprès du registre public), prévention de la fraude, modération et sécurité</td><td>Intérêt légitime</td></tr>
          <tr><td>Emails de service (candidature, livraison, validation, rappels)</td><td>Exécution du contrat</td></tr>
          <tr><td>Facturation et obligations comptables</td><td>Obligation légale</td></tr>
          <tr><td>Génération de briefs assistée par intelligence artificielle</td><td>Exécution du contrat (le texte saisi est transmis au fournisseur d&apos;IA, sans données de compte)</td></tr>
          <tr><td>Communications commerciales de notre part</td><td>Consentement, retirable à tout moment</td></tr>
        </tbody>
      </table>

      <h2>3. Destinataires et sous-traitants</h2>
      <p>Vos données sont accessibles à notre équipe, aux autres utilisateurs dans la mesure nécessaire à la mission (profil public du créateur, informations de campagne de la marque), et aux prestataires suivants :</p>
      <ul>
        <li><strong>Stripe</strong> (paiements, comptes de créateurs) : États-Unis et Union européenne, clauses contractuelles types.</li>
        <li><strong>Google Firebase</strong> (authentification) : clauses contractuelles types.</li>
        <li><strong>MongoDB Atlas</strong> (base de données, hébergée dans l&apos;Union européenne).</li>
        <li><strong>Cloudflare</strong> (stockage des vidéos, protection du site, vérification anti-robot Turnstile).</li>
        <li><strong>Fournisseur d&apos;email transactionnel</strong> et, le cas échéant, <strong>fournisseur d&apos;intelligence artificielle</strong> pour la rédaction assistée des briefs.</li>
        <li><strong>Shopify</strong>, uniquement si la marque connecte sa boutique.</li>
      </ul>

      <h2>4. Durées de conservation</h2>
      <ul>
        <li>Données de compte et de profil : pendant la durée d&apos;utilisation du service, puis suppression ou anonymisation à la fermeture du compte.</li>
        <li>Données de missions et de paiement : dix ans à des fins comptables, sous forme anonymisée après la fermeture du compte.</li>
        <li>Messages : trois ans après le dernier échange.</li>
        <li>Journaux techniques : douze mois.</li>
      </ul>

      <h2>5. Vos droits</h2>
      <p>
        Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de limitation, d&apos;opposition et de portabilité de vos
        données. Depuis votre profil, vous pouvez à tout moment <strong>télécharger l&apos;ensemble de vos données</strong> et
        <strong> supprimer votre compte</strong>. Pour toute autre demande, écrivez à{' '}
        <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>. Nous répondons sous un mois. Vous pouvez
        également introduire une réclamation auprès de la CNIL (www.cnil.fr).
      </p>

      <h2>6. Cookies et traceurs</h2>
      <p>
        Le site n&apos;utilise que des traceurs strictement nécessaires à son fonctionnement : maintien de la session de
        connexion (Firebase), sécurité (Cloudflare Turnstile) et préférences d&apos;affichage. Aucun cookie publicitaire ni de
        mesure d&apos;audience tierce n&apos;est déposé. Ces traceurs sont exemptés de consentement.
      </p>

      <h2>7. Sécurité</h2>
      <p>
        Les échanges sont chiffrés (HTTPS). Les vidéos sont servies par des liens signés à durée limitée. L&apos;accès aux
        données est restreint aux personnes habilitées. Les coordonnées directes sont masquées dans la messagerie avant
        la sélection d&apos;un créateur.
      </p>

      <h2>8. Contact</h2>
      <p>
        {COMPANY.legalName}, {COMPANY.address}. Questions relatives aux données personnelles :{' '}
        <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
      </p>
    </LegalLayout>
  );
}
