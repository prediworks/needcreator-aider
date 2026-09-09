import type { Metadata } from 'next';
import LegalLayout from '@/components/legal/LegalLayout';
import { COMPANY, SITE_URL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Mentions légales du site NeedCreator : éditeur, hébergeur, contact.',
  alternates: { canonical: '/legal/mentions-legales' },
};

export default function LegalNoticePage() {
  return (
    <LegalLayout title="Mentions légales">
      <h2>Éditeur du site</h2>
      <p>
        Le site {SITE_URL.replace(/^https?:\/\//, '')} est édité par {COMPANY.legalName}, {COMPANY.legalForm} au capital de {COMPANY.capital},
        immatriculée au RCS de {COMPANY.rcs} sous le numéro {COMPANY.siren}, numéro de TVA intracommunautaire {COMPANY.vat},
        dont le siège social est situé {COMPANY.address}.
      </p>
      <p>Directeur de la publication : {COMPANY.publicationDirector}.</p>
      <p>Contact : <a href={`mailto:${COMPANY.contactEmail}`}>{COMPANY.contactEmail}</a></p>

      <h2>Hébergement</h2>
      <p>
        Application et données : {COMPANY.host.name}, {COMPANY.host.address}, {COMPANY.host.site}.<br />
        Base de données : MongoDB Atlas (MongoDB Inc.), hébergée dans l&apos;Union européenne.<br />
        Fichiers vidéo : Cloudflare R2 (Cloudflare Inc.).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La structure du site, sa marque, son logo et ses textes sont protégés par le droit de la propriété intellectuelle.
        Les vidéos publiées par les créateurs restent leur propriété ou celle des marques selon les droits cédés.
        Toute reproduction sans autorisation est interdite.
      </p>

      <h2>Données personnelles</h2>
      <p>Voir la <a href="/legal/confidentialite">politique de confidentialité</a>.</p>

      <h2>Médiation</h2>
      <p>
        Conformément au Code de la consommation, tout consommateur peut recourir gratuitement à un médiateur de la
        consommation en vue de la résolution amiable d&apos;un litige. Les coordonnées du médiateur sont communiquées sur demande à {COMPANY.contactEmail}.
      </p>
    </LegalLayout>
  );
}
