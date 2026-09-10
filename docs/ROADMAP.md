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
| **Filigrane sur les aperçus** de portfolio | Empêche les marques d'utiliser une vidéo sans payer | M (ffmpeg déjà en place) |
| **Litiges** : refus définitif après 2 révisions avec remboursement partiel (50 %), arbitrage admin | Prévu dans la spec ; aujourd'hui la marque doit approuver ou laisser l'auto-approbation | M |
| ~~**Vérification des marques**~~ | Livré le 8 septembre 2026 (SIRET / TVA, site, email pro, contrôle admin) | — |
| **Notifications dans l'application** (cloche, centre de notifications) en plus des emails | Réactivité, moins d'emails | M |
| **Notifications push** (navigateur / mobile) | Prévu en phase 2 | M |
| **Multi-langues** (anglais, espagnol) | Prévu en phase 3 ; les libellés sont déjà centralisés dans `frontend/src/lib/labels.ts` | M |
| **API publique** pour agences et intégrateurs | Prévu en phase 3 | L |
| **Application mobile** (ou PWA installable en première étape) | Les créateurs tournent au téléphone | PWA : S, app : L |
| **Monitoring** (Sentry) et sauvegardes automatiques de la base | Indispensable avant la mise en ligne | S |
| **Google login** | Fonctionne uniquement sur un nom de domaine autorisé dans Firebase, pas sur une adresse IP | S (vous, nom de domaine) |
| ~~**SEO** : métadonnées, sitemap, robots, données structurées, image de partage, favicon~~ | Livré le 9 septembre 2026. Reste : déclarer le site dans Google Search Console | S (vous) |
| ~~**Anti-robot Turnstile** à l'inscription~~ | Livré le 8 septembre 2026 | — |
| ~~**Envoi direct des vidéos vers R2**~~ (barre de progression, plus de limite du proxy Cloudflare) | Livré le 10 septembre 2026 (`npm run r2:cors`) | — |
| ~~**Mot de passe oublié** et **confirmation de l'email**~~ | Livré le 9 septembre 2026, emails envoyés par le SMTP NeedCreator depuis le 10 septembre (délivrabilité identique aux autres emails) ; publication et devis bloqués sans confirmation, `REQUIRE_EMAIL_VERIFICATION` | — |

## 3. Nouvelles suggestions

### Pour les marques

| Idée | Ce que ça apporte | Effort |
|---|---|---|
| **Modèles de campagne** (dupliquer une campagne passée, bibliothèque de briefs par secteur) | Relancer une campagne en 1 minute | S |
| **Comparateur de candidats** côte à côte (portfolio, prix, note, délai) | Prévu dans la spec, aide au choix quand il y a 10 devis | S |
| **Contre-proposition de devis** structurée (la marque propose un prix, le créateur accepte en un clic) | Aujourd'hui la négociation passe par la messagerie | S |
| ~~**Contrat PDF de cession de droits** généré à l'acceptation du devis~~ | Livré le 10 septembre 2026 : contrat de mission et cession de droits (PDF) généré à l'acceptation du devis, envoyé aux deux parties, informations administratives obligatoires (identité, statut, SIRET vérifié, adresse ; signataire côté marque). Signature électronique certifiée (Yousign) possible plus tard | — |
| **Facturation** : facture PDF marque (commission) et relevé créateur conforme | Demandé par les services comptables ; à cadrer avec un expert-comptable (auto-facturation) | M |
| **Tableau de bord ROI** : coût par vidéo, coût pour 1 000 vues, meilleurs créateurs, comparaison entre campagnes | Justifie le budget UGC | M |
| ~~**Droits d'utilisation avec rappel d'expiration**~~ | Livré le 10 septembre 2026 : date de fin calculée à la validation, rappel email 30 jours avant aux deux parties, prolongation proposée par le créateur et payée par la marque (avenant PDF, virement au créateur) | — |
| **Campagnes privées** (visibles uniquement par les créateurs invités) | Lancements confidentiels | S |
| **Équipe marque** (plusieurs utilisateurs sur un même compte, rôles) | Agences et PME avec plusieurs personnes | M |
| **Intégrations e-commerce supplémentaires** : WooCommerce, PrestaShop (très présent en France) | Même mécanique que Shopify | M chacune |

### Pour les créateurs

| Idée | Ce que ça apporte | Effort |
|---|---|---|
| **Disponibilités et charge** (« indisponible jusqu'au… », nombre de missions en cours affiché) | Évite les sélections qui traînent | S |
| **Kit média automatique** (page publique partageable avec stats, portfolio, tarifs, QR code) | Le créateur fait sa promotion et ramène des marques | S |
| **Retrait à la demande / calendrier de virements** et rappel des seuils micro-entreprise | Transparence financière | S |
| **Académie** : courts guides (éclairage, accroche, formats), quiz donnant un badge « Formé » | Qualité des vidéos, différenciation face à Influee | M (contenu à produire) |
| **Objectifs et progression** (barre vers le niveau suivant, missions recommandées) | Engagement | S |
| **Réponse aux avis** visible publiquement (le champ existe déjà en base) | Droit de réponse | S |

### Pour la plateforme

| Idée | Ce que ça apporte | Effort |
|---|---|---|
| **Matching enrichi** : similarité entre le brief et les vidéos du portfolio (transcription + IA), style, rythme | Le score actuel n'utilise pas le contenu des vidéos | M |
| **Détection de fraude** : vidéo de portfolio déjà vue ailleurs, comptes multiples, liens de livraison invalides | Protège les marques | M |
| **Relances automatiques** : créateur sélectionné sans upload à J+5, devis sans réponse à J+3, produit non reçu | Réduit les missions qui s'enlisent | S |
| **Statistiques admin** : GMV, commission par mois, délai moyen de livraison, taux de réponse (indicateurs de la spec, section 9) | Pilotage | S |
| **Tests automatiques dans l'intégration continue** (GitHub Actions lance `test:e2e` à chaque push) | Évite les régressions | S |
| **Emails HTML soignés** (modèle avec logo, boutons, résumé) au lieu des emails texte actuels | Image de marque | S |
| **Page d'accueil avec preuves sociales réelles** (créateurs mis en avant, campagnes récentes anonymisées) | Conversion | S |

## 3 bis. Monétisation et anti-abus (décidé et livré le 8 septembre 2026)

| Sujet | Décision | Réglage |
|---|---|---|
| Vérification des marques | SIRET ou TVA (format + registre national des entreprises), site web, email pro. Email grand public → vérification manuelle admin. Non vérifiée : brouillons seulement, pas de publication | Admin → Réglages, `BUSINESS_REGISTRY_CHECK` |
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
