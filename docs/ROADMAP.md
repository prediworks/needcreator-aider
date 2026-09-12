# Feuille de route : ce qui reste à faire

État au 7 septembre 2026, après la livraison des 12 fonctionnalités du document `PROPOSITIONS-fonctionnalites.md`.
Effort indicatif : **S** = quelques jours, **M** = 1 à 2 semaines, **L** = plus.

## 1. À terminer sur ce qui existe déjà

Ces points sont commencés ou dépendent d'une action extérieure.

| Sujet | État | Reste à faire | Effort |
|---|---|---|---|
| Brief IA | Code prêt | Renseigner une clé `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` ; ajuster les prompts dans `backend/config/prompts/` après quelques essais réels | S (vous) |
| Shopify | Code prêt, non testé | Créer l'application sur partners.shopify.com, renseigner `SHOPIFY_*`, tester sur une boutique de développement | S |
| Sous-titres du pack vidéo | Code prêt | Clé OpenAI (transcription) ; vérifier le rendu sur de vraies vidéos, ajouter un choix de style (police, position) | S |
| Statistiques de performance | Saisie manuelle | Connexion aux API TikTok et Meta pour remonter vues et engagement automatiquement (dossiers d'accès à monter chez Meta et TikTok, plusieurs semaines de validation) | L |
| Stats des réseaux sociaux des créateurs | Déclaratif | Même dépendance que ci-dessus ; en attendant, un badge « vérifié » posé par l'admin après contrôle manuel | S puis L |
| Stripe Connect | Activé | Vérifier en conditions réelles un virement complet vers un créateur ayant terminé son onboarding | S (vous) |
| Vidéos R2 | Liens signés 1 h | Activer un domaine public sur le bucket pour des liens permanents (nécessaire pour Shopify et le partage) | S (vous) |
| Webhook Stripe en production | Non déclaré | Déclarer `/api/webhooks/stripe` dans le dashboard Stripe une fois l'API en ligne | S (vous) |
| Bonus de parrainage créateur | Enregistré, virement automatique si compte Stripe | Écran admin pour voir et régler manuellement les bonus en attente | S |

## 2. Prévu dans la spécification initiale, pas encore fait

| Sujet | Pourquoi c'est important | Effort |
|---|---|---|
| ~~**RGPD** : export des données et suppression de compte (anonymisation)~~ | Livré le 9 septembre 2026 (profil → Mes données) | — |
| ~~**CGU, politique de confidentialité, mentions légales** avec acceptation à l'inscription~~ | Livré le 9 septembre 2026. Reste à compléter l'identité de l'éditeur dans `frontend/src/lib/legal.ts` et à faire relire les textes par un juriste | S (vous) |
| ~~**Signalement de contenu**~~ | Livré le 8 septembre 2026 | — |
| ~~**Filigrane sur les aperçus de portfolio**~~ | Livré le 11 septembre 2026 : à chaque ajout, ffmpeg génère un aperçu avec le logo « NeedCreator · aperçu portfolio » (bas droite, 30 % de la largeur) servi aux marques et au site public ; l'original reste pour le créateur, l'admin et les livraisons ; rattrapage des anciennes vidéos par la tâche planifiée (3 par passage) ; image dans `backend/assets/watermark.png` | — |
| ~~**Litiges**~~ | Livré le 11 septembre 2026 : quand les révisions prévues au devis sont épuisées, la marque peut demander un refus définitif (motif obligatoire) ; validation automatique suspendue, le créateur répond une fois, l'admin tranche depuis l'onglet « Litiges » : paiement intégral, partage (part réglable, capture partielle Stripe et reste rendu à la marque) ou remboursement intégral avec place libérée sur la campagne ; décision motivée envoyée aux deux parties. Refus automatique après silence du créateur sur une révision (réglable) | — |
| ~~**Vérification des marques**~~ | Livré le 8 septembre 2026 (SIRET / TVA, site, email pro, contrôle admin) | — |
| ~~**Notifications dans l'application**~~ | Livré le 11 septembre 2026 : cloche dans le menu avec compteur, 20 dernières notifications, marquées lues à l'ouverture ; alimentée par tous les événements (devis, sélection, livraison, révision, validation, messages, litiges, relances, contrat, droits, remplacement) ; purge automatique après 90 jours | — |
| **Notifications push** (navigateur / mobile) | Prévu en phase 2 | M |
| **Multi-langues** (anglais, espagnol) | Prévu en phase 3 ; les libellés sont déjà centralisés dans `frontend/src/lib/labels.ts`. Préparation faite le 11 septembre 2026 : pays et langue demandés à l'inscription et modifiables dans le profil (`profile.country`, `preferences.language`), pays utilisé pour le compte Stripe Connect | M |
| **API publique** pour agences et intégrateurs | Prévu en phase 3 | L |
| **Application mobile** (ou PWA installable en première étape) | Les créateurs tournent au téléphone | PWA : S, app : L |
| ~~**Monitoring** (Sentry)~~ et sauvegardes automatiques de la base | Livré le 11 septembre 2026 : Sentry backend et frontend (actif si DSN), pages d'erreur propres, alertes admin immédiates (virement en échec, signalement) et récapitulatif quotidien des éléments à traiter ; disponibilité via Uptime Kuma (réglage côté exploitant). Reste : activer les sauvegardes Atlas | S (vous) |
| ~~**Transcription des vidéos**~~ (clé à fournir) | Livré le 11 septembre 2026 : fournisseur configurable et indépendant du brief IA (`TRANSCRIPTION_PROVIDER` = groq / openai / mistral / openai-compatible, `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_MODEL`), Groq par défaut si `GROQ_API_KEY` est présente. Débloque le contrôle « mention du produit » du score de conformité et les sous-titres du pack « vidéo prête à diffuser ». Reste : renseigner la clé sur le VPS puis `pm2 reload all` | S (vous, clé) |
| **Google login** | Fonctionne uniquement sur un nom de domaine autorisé dans Firebase, pas sur une adresse IP | S (vous, nom de domaine) |
| ~~**SEO** : métadonnées, sitemap, robots, données structurées, image de partage, favicon~~ | Livré le 9 septembre 2026. Reste : déclarer le site dans Google Search Console | S (vous) |
| ~~**Anti-robot Turnstile** à l'inscription~~ | Livré le 8 septembre 2026 | — |
| ~~**« Mes missions » côté créateur**~~ | Livré le 11 septembre 2026 : la page Livraisons devient « Missions » pour les créateurs (menu, tableau de bord, détail), avec onglets filtrants et compteurs, date limite (retard en rouge), vidéos envoyées/attendues, montant à recevoir, tri par urgence, page vide qui renvoie vers les campagnes | — |
| ~~**Défilement ciblé vers le bloc à compléter**~~ | Livré le 11 septembre 2026 : chaque élément manquant (carte « Prochaine étape », « Ensuite », « Il manque », blocages de candidature, liens Stripe/adresse/Pro) est un lien vers le bloc concerné du profil, avec défilement et surlignage ; `#portfolio` ouvre le formulaire d'ajout, `#edit` ouvre l'édition | — |
| ~~**Inscription allégée + « Prochaine étape »**~~ | Livré le 11 septembre 2026 : inscription réduite au minimum (bio, tarif, site web, secteur retirés ; site web facultatif pour la vérification), carte « Prochaine étape » unique sur les tableaux de bord, bloc Ambassadeur affiché seulement après validation du profil, email « Devenez Ambassadeur » après la première mission payée | — |
| ~~**Programme Ambassadeur : mise en avant réelle**~~ | Livré le 10 septembre 2026 : bonus de matching (`AMBASSADOR_MATCH_BONUS`), tête d'annuaire, badge dans l'email « nouveau devis », section page d'accueil ; textes du programme (vidéo publiée sur leurs réseaux, même commission) | — |
| ~~**Portfolio sur le site public**~~ | Livré le 10 septembre 2026 : accord du créateur en deux cases (site public / communication NeedCreator), page `/nos-createurs`, endpoint public sans email | — |
| ~~**Suggestion de prix fondée sur les devis acceptés**~~ | Livré le 10 septembre 2026 : à la création de campagne, fourchette = quartiles et médiane des devis acceptés par type de vidéo (grille indicative tant qu'il y a moins de 10 devis), avec la source affichée | — |
| ~~**Annuaire des créateurs référencés**~~ | Livré le 10 septembre 2026 : import admin de listes xlsx/csv (dédoublonnage par pseudo et email, périmètre France / francophonie / Europe / monde, rejouable), annuaire public `/annuaire-createurs` (données publiques, jamais l'email, retrait en un clic), onglet « Référencés » pour les marques avec invitation envoyée par la plateforme (1 par créateur / 14 jours), rattachement automatique à l'inscription | — |
| ~~**Garantie de remplacement**~~ | Livré le 10 septembre 2026 : rappel au créateur à la date prévue, puis après 48 h la marque confie la mission à l'un des autres devis en un clic (autorisation de paiement libérée, nouvelle mission, retard compté sur le créateur) | — |
| ~~**Score de conformité au brief**~~ | Livré le 10 septembre 2026 : à la soumission, vérification automatique du nombre de vidéos, durée, format, résolution, son et mention du produit (transcription si clé OpenAI) ; check-list affichée à la marque avant validation | — |
| ~~**Envoi direct des vidéos vers R2**~~ (barre de progression, plus de limite du proxy Cloudflare) | Livré le 10 septembre 2026 (`npm run r2:cors`) | — |
| ~~**Mot de passe oublié** et **confirmation de l'email**~~ | Livré le 9 septembre 2026, emails envoyés par le SMTP NeedCreator depuis le 10 septembre (délivrabilité identique aux autres emails) ; publication et devis bloqués sans confirmation, `REQUIRE_EMAIL_VERIFICATION` | — |

## 3. Nouvelles suggestions

### Pour les marques

| Idée | Ce que ça apporte | Effort |
|---|---|---|
| ~~**Modèles de campagne**~~ | Livré le 11 septembre 2026 : six modèles par secteur (`backend/config/campaignTemplates.js`, `GET /campaigns/templates`) et duplication d'une campagne passée (`/campaigns/new?from=<id>`, bouton « Dupliquer » sur la campagne), pré-remplissage complet du formulaire | — |
| ~~**Comparateur de candidats** côte à côte (portfolio, prix, note, délai)~~ Livré le 12/09/2026 : jusqu'à 4 devis en tableau, meilleure valeur surlignée, tri des candidatures | Prévu dans la spec, aide au choix quand il y a 10 devis | S |
| ~~**Contre-proposition de devis** structurée (la marque propose un prix, le créateur accepte en un clic)~~ Livré le 12/09/2026 : prix, délai, révisions, message ; le créateur accepte, refuse ou renvoie un devis ; email + notification | Aujourd'hui la négociation passe par la messagerie | S |
| ~~**Contrat PDF de cession de droits** généré à l'acceptation du devis~~ | Livré le 10 septembre 2026 : contrat de mission et cession de droits (PDF) généré à l'acceptation du devis, envoyé aux deux parties, informations administratives obligatoires (identité, statut, SIRET vérifié, adresse ; signataire côté marque). Signature électronique certifiée (Yousign) possible plus tard | — |
| ~~**TVA et facturation PDF**~~ | Livré le 11 septembre 2026 (hypothèses à confirmer par l'expert-comptable : mandat de facturation, compte de tiers). Statut TVA du créateur dans ses informations administratives (franchise par défaut, numéro de TVA vérifié sinon) ; devis HT, la marque paie TTC si le créateur est assujetti (autorisation Stripe TTC) ; commission 10 % du devis : 10 HT + TVA pour un assujetti, 10 TTC (8,33 HT + 1,67 TVA) en franchise ; gifting 5 € HT/vidéo et pack 15 € HT/vidéo facturés TTC. À chaque mission validée : facture créateur → marque émise par mandat (séquence par créateur `CR-XXXXXX-AAAA-0001`, mention 293 B en franchise), facture de commission NeedCreator (`NC-F-AAAA-000001`), facture NeedCreator → marque pour gifting et pack ; prolongation de droits et litige tranché en partage facturés de même. PDF stockés avec les contrats, page « Factures » (marque et créateur), bloc sur chaque mission. Contrat et CGU mis à jour (TVA, mandat). Complété le 11 septembre 2026 : avoirs (annulation intégrale d'une facture, numérotation `NC-A-…` / `AV-XXXXXX-…`, automatiques sur remboursement intégral d'un litige, manuels depuis Administration → Factures), relevé mensuel PDF à la volée (créateur : CA facturé, TVA, commissions, net versé ; marque : factures reçues). Factures Pro émises par Stripe | — |
| **Tableau de bord ROI** : coût par vidéo, coût pour 1 000 vues, meilleurs créateurs, comparaison entre campagnes | Justifie le budget UGC | M |
| ~~**Droits d'utilisation avec rappel d'expiration**~~ | Livré le 10 septembre 2026 : date de fin calculée à la validation, rappel email 30 jours avant aux deux parties, prolongation proposée par le créateur et payée par la marque (avenant PDF, virement au créateur) | — |
| ~~**Campagnes privées**~~ | Livré le 11 septembre 2026 : case « Campagne privée » à la création ; invisible dans le fil et inaccessible sans invitation (403), aucune notification de masse à la publication ; les invités la voient, candidatent et sont sélectionnés normalement | — |
| ~~**Équipe marque**~~ | Livré le 11 septembre 2026 : le propriétaire invite des collaborateurs par email (profil → Équipe) ; chacun crée son accès et agit au nom de l'entreprise (campagnes, missions, factures, paiement partagés) ; réservé au propriétaire : équipe, informations administratives, vérification, abonnement, suppression du compte ; retrait d'un membre en un clic | — |
| **Intégrations e-commerce supplémentaires** : WooCommerce, PrestaShop (très présent en France) | Même mécanique que Shopify | M chacune |
| **Vérification des entreprises étrangères** : VIES (TVA UE, gratuit, sans clé), Companies House (Royaume-Uni, clé gratuite immédiate), Zefix (Suisse, identifiants gratuits demandés par email à zefix@bj.admin.ch, quelques jours) | Aujourd'hui (12/09/2026) : TVA UE contrôlée sur le format seulement ; hors UE, numéro d'immatriculation local et contrôle manuel systématique. À brancher à la première marque étrangère. | S chacune |

### Pour les créateurs

| Idée | Ce que ça apporte | Effort |
|---|---|---|
| **Paiement par PayPal** (demande d'un créateur, 12/09/2026) | À ne faire que si plusieurs créateurs bloquent après le lancement : Stripe Connect se résume à saisir un IBAN, sans frais pour le créateur. Option 1 : PayPal Payouts depuis le compte NeedCreator (l'argent transite par la trésorerie de la plateforme, ~2 % de frais à notre charge, comptabilité de tiers : à valider par l'expert-comptable). Option 2 : bouton admin « payé manuellement » (une action par mission). | M (Payouts) / S (manuel) |
| ~~**Disponibilités et charge**~~ | Livré le 11 septembre 2026 : « indisponible jusqu'au » + message dans le profil, visibles sur le profil public, l'annuaire et les devis ; missions en cours affichées ; matching ÷ 2 si indisponible, −10 si ≥ 3 missions en cours | — |
| ~~**Kit média**~~ | Livré le 11 septembre 2026 : adresse courte `/c/<slug>` avec métadonnées et image de partage, QR code et texte prêt à coller depuis le profil, bouton « Me proposer une mission » pour les visiteurs non connectés | — |
| ~~**Calendrier de virements et seuils micro**~~ | Livré le 11 septembre 2026 : page Revenus → solde Stripe, virements bancaires à venir avec dates d'arrivée, périodicité ; chiffre d'affaires facturé de l'année comparé aux seuils de franchise de TVA et du régime micro (`VAT_FRANCHISE_THRESHOLD`, `MICRO_REVENUE_THRESHOLD`) | — |
| ~~**Académie**~~ | Livré le 11 septembre 2026 : 5 guides de 5 minutes (brief, lumière et cadrage, son, trois premières secondes, devis) avec quiz corrigé côté serveur ; badge « Formé » après `ACADEMY_REQUIRED` guides réussis (3) à `ACADEMY_PASS_SCORE` % (75), visible par les marques, +3 points de matching ; page `/academie` publique | — |
| ~~**Objectifs et progression**~~ | Livré le 11 septembre 2026 : carte « Votre progression » sur le tableau de bord (niveau, barre vers le suivant, ce qu'il apporte, avancement académie) et trois missions recommandées dans ses niches | — |
| ~~**Avis en double aveugle et réponse publique**~~ | Livré le 11 septembre 2026 : un avis reste caché jusqu'à l'avis de l'autre partie (email « laissez le vôtre pour découvrir le sien », notification), publication simultanée, sinon publication automatique après un délai réglable (Administration → Réglages, 14 jours) ; la note du profil ne compte que les avis publiés ; réponse publique unique depuis le profil, visible sous l'avis | — |

### Pour la plateforme

| Idée | Ce que ça apporte | Effort |
|---|---|---|
| **Déclaration DAC7** (obligation légale, échéance 31 janvier 2027 pour les revenus 2026) | NeedCreator est un opérateur de plateforme déclarant : prestations de service payées par son intermédiaire, sans seuil d'exemption. À faire : collecter le numéro fiscal et la date de naissance des créateurs particuliers, produire chaque année le fichier XML DGFiP (identité, adresse, SIREN ou numéro fiscal, compte de versement, montants par trimestre, commissions), envoyer le récapitulatif annuel à chaque créateur, s'inscrire comme opérateur auprès de la DGFiP (démarche à confirmer avec l'expert-comptable). Amende jusqu'à 50 000 € en cas d'oubli. | M (2 à 3 jours), avant fin 2026 |
| **Matching enrichi** : similarité entre le brief et les vidéos du portfolio (transcription + IA), style, rythme | Le score actuel n'utilise pas le contenu des vidéos | M |
| **Détection de fraude** : vidéo de portfolio déjà vue ailleurs, comptes multiples, liens de livraison invalides | Protège les marques | M |
| ~~**Relances automatiques**~~ | Livré le 11 septembre 2026 : devis sans réponse (marque, 3 j), mission sans vidéo (créateur, 5 j), produit expédié non confirmé (créateur, 5 j), révision sans nouvelle version (créateur, 3 j). Délais réglables dans Administration → Réglages, 0 = désactivé, une relance par élément | — |
| **Statistiques admin** : GMV, commission par mois, délai moyen de livraison, taux de réponse (indicateurs de la spec, section 9) | Pilotage | S |
| **Tests automatiques dans l'intégration continue** (GitHub Actions lance `test:e2e` à chaque push) | Évite les régressions | S |
| ~~**Garantie de remplacement : sans autre devis, et créateurs à répétition**~~ | Livré le 11 septembre 2026 : sans autre devis, la marque retire la mission en un clic et la campagne est rouverte aux candidatures (montant libéré) ; au-delà d'un nombre de missions retirées pour retard (réglage admin, 3 par défaut), le créateur ne peut plus envoyer de devis jusqu'à remise à zéro par l'admin | — |
| ~~**Révisions : le devis fait foi**~~ | Livré le 11 septembre 2026 : la plateforme applique le nombre de révisions prévu au devis du créateur, plafonné par le réglage admin (plafond vérifié à la saisie du devis) ; site et CGU reformulés (« révisions incluses, précisées dans chaque devis »), plus aucun chiffre en dur ; menu public stable dès le premier affichage et sans chevauchement du logo | — |
| ~~**Pages dédiées `/marques` et `/createurs`**~~ | Livré le 11 septembre 2026 : arguments d'inscription par public, parcours en 4 étapes, FAQ avec données structurées, chiffres lus depuis l'API ; entrées de l'accueil, menu, pied de page et sitemap redirigés | — |
| ~~**Plus de chiffres en dur**~~ | Livré le 11 septembre 2026 : `GET /api/config/public` (révisions, validation automatique, devis minimum…) alimente les pages marketing, les formulaires et les emails ; devis et contrat prennent le réglage admin des révisions par défaut ; `AUTO_APPROVAL_DAYS` et `MAX_REVISIONS` en variables d'environnement | — |
| ~~**Emails HTML soignés**~~ | Livré le 11 septembre 2026 : gabarit commun (logo, carte, bouton d'action, encart résumé, pied de page légal), version texte générée avec les liens ; `npm run check:email` envoie un aperçu | — |
| **Page d'accueil avec preuves sociales réelles** (créateurs mis en avant, campagnes récentes anonymisées) | Conversion | S |

## 3 bis. Monétisation et anti-abus (décidé et livré le 8 septembre 2026)

| Sujet | Décision | Réglage |
|---|---|---|
| Vérification des marques | SIRET ou TVA (format + registre national des entreprises), email pro ; site web facultatif. Email grand public sans site web → vérification manuelle admin ; avec un site web, vérifiée immédiatement. Non vérifiée : brouillons seulement, pas de publication | Admin → Réglages, `BUSINESS_REGISTRY_CHECK` |
| Limites progressives (tant qu'aucune campagne terminée) | 2 campagnes ouvertes, 5 invitations / jour, 20 messages / jour | `LIMIT_NEW_BRAND_*` |
| Brief IA | 3 / mois en gratuit, illimité en Pro | `AI_BRIEF_FREE_QUOTA` |
| Abonnement Pro | 79 € / mois, essai 14 jours sans carte à l'inscription, commission inchangée (décision du 9 septembre 2026 : la marque paie le prix du devis sans frais ajoutés, le créateur reçoit 90 %), débloque brief IA illimité, gifting et multi-créateurs | `PRO_PRICE_EUR`, `PRO_TRIAL_DAYS`, `PRO_FEE_PERCENT`, `STRIPE_PRO_PRICE_ID` |
| Gifting (produit offert, pas de rémunération) | Réservé au Pro, valeur produit ≥ 30 €, 2 vidéos max, 2 campagnes / mois, 5 € par vidéo livrée facturés à la marque, opt-in créateur (oui par défaut pour Nouveau, non pour Confirmé / Expert) | `GIFTING_*` |
| Messagerie | Emails et téléphones masqués avant sélection | — |
| Signalement | Campagnes, profils, messages ; file admin avec suspension | — |

## 4. Ordre conseillé

1. **Avant tout utilisateur réel** : compléter les mentions légales, monitoring, sauvegardes, domaine public R2, webhook Stripe, Google Search Console.
2. **Premières semaines d'usage** : signalement et modération, relances automatiques, contrat PDF, comparateur de candidats, modèles de campagne.
3. **Quand le volume arrive** : litiges et remboursements, facturation, tableau de bord ROI, connexion aux réseaux sociaux, PWA créateurs.
4. **Croissance** : multi-langues, WooCommerce et PrestaShop, équipe marque, API publique, application mobile.

## 4 ter. Implémenté, pas encore testé en conditions réelles (au 12/09/2026)

Le reste est couvert par les 80 étapes du test automatique et les 17 du test d'interface.

**Jamais testé**
- Litige tranché en partage : capture partielle Stripe (part créateur + remboursement du reste). Le test automatique ne couvre que l'approbation et le remboursement total.
- Publication Shopify : aucune application déclarée chez Shopify, jamais connectée à une vraie boutique.
- Premier virement réel vers un créateur (les tests utilisent des comptes Stripe de test).
- Rendu des emails HTML dans de vrais clients (Gmail, Outlook, mobile) : vu seulement dans l'aperçu local.
- Achat d'une prolongation de droits de bout en bout, avec paiement.

**Testé par l'API, pas vu à l'écran**
- Bloc « contre-proposition » côté créateur (accepter, refuser, modifier).
- Inscription d'un collaborateur d'équipe depuis le lien reçu par email.
- Kit média avec QR code ; relevé mensuel PDF.
- Relances automatiques et auto-publication des avis : délais simulés, jamais attendus réellement.

**Testé en local, à confirmer en production**
- Factures, avoirs et relevés générés sur le VPS avec la raison sociale, l'adresse et le RCS du `.env`.
- Filigrane sur les vidéos existantes (lancé le 12/09/2026).
- Transcription Groq sur une mission complète (connexion validée, pas une livraison réelle).

**À faire par vous, en mode test Stripe, environ 1 h** : une mission complète (paiement, facture, virement), puis un litige tranché en partage, puis une prolongation de droits.

## 4 bis. Réseaux sociaux NeedCreator (comptes créés le 12/09/2026)

1. **Relier au site** (code, 1 h) : icônes dans le pied de page, adresses des comptes dans les données structurées de l'accueil. En attente des adresses exactes des comptes.
2. **Remplir avant le mailing aux créateurs** (vous) : logo, bannière, bio en une phrase avec le lien du site, 5 à 10 publications. Matière existante : guides de l'académie (carrousels, vidéos courtes), modèles de campagne (exemples de briefs), FAQ des pages marques et créateurs.
3. **Un rôle par réseau** : TikTok et Instagram pour recruter des créateurs (conseils de tournage, coulisses, republication des vidéos des Ambassadeurs qui ont donné leur accord) ; LinkedIn pour convaincre les marques (prix constatés, contrat de droits, garantie de remplacement, premier cas client). Les autres comptes : réservation du nom + lien vers le site.
4. **Lien d'inscription** dans chaque publication destinée aux créateurs ; les Ambassadeurs publient avec leur propre lien de parrainage.
5. **Plus tard**, avec des missions terminées : avis de marques, vidéos livrées avec accord des deux parties, compteurs réels (voir « preuves sociales réelles »).
6. **Option code** : un lot de dix textes de publication prêts à copier, par réseau.

## 5. Questions pour l'expert-comptable

1. **Mandat de facturation** : NeedCreator émet les factures des créateurs en leur nom (mandat accepté dans les informations administratives). Formulation et mentions à valider.
2. **Numérotation** : une séquence par créateur (`CR-XXXXXX-AAAA-0001`), une séquence NeedCreator (`NC-F-AAAA-000001`), avoirs `AV-…` et `NC-A-…`. Conforme ?
3. **Compte de tiers** : le prix du devis va de la marque au créateur via Stripe Connect ; seule la commission est un produit de NeedCreator. Traitement comptable de ces flux.
4. **CGU** : clause de mandat de facturation et de TVA à relire.
5. **PayPal** (si un jour proposé) : les versements partiraient de la trésorerie de NeedCreator au lieu d'un flux direct marque → créateur. Conséquences comptables.
6. **DAC7** : confirmer que NeedCreator est opérateur de plateforme déclarant, la démarche d'inscription auprès de la DGFiP, la liste exacte des informations à collecter (numéro fiscal, date de naissance des particuliers) et le calendrier (première déclaration en janvier 2027 pour 2026).
