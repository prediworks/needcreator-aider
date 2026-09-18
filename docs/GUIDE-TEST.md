# Guide de test (sans être développeur)

Ce guide explique comment démarrer la plateforme en local et tester chaque parcours, dans l'ordre.

## 1. Démarrer

Deux terminaux :

```bash
# Terminal 1 — backend (port 3002)
cd backend
npm run dev

# Terminal 2 — frontend (port 3000)
cd frontend
npm run dev
```

Puis ouvrez http://localhost:3000 (ou http://95.111.238.135:3000 depuis un autre poste).

## 2. Vérifier que tout est branché (30 secondes)

```bash
cd backend
npm run check:env
```

Chaque ligne doit être ✅ : MongoDB, Stripe, Firebase, email, Cloudflare R2.
Deux points peuvent rester ❌ sans bloquer les tests :

- **Stripe Connect** : à activer une fois sur https://dashboard.stripe.com/connect. Sans lui, les marques paient bien, mais l'argent n'est pas reversé aux créateurs (il reste sur votre compte Stripe, statut "encaissé, virement en attente").
- **R2 URL publique** : les vidéos sont lues via des liens temporaires signés. Ça marche, mais pour la production il faudra activer un domaine public sur le bucket R2.

## 3. Test automatique de tous les flux (1 minute)

Le backend doit tourner. Ce script crée une marque et un créateur de test, déroule tout le parcours (campagne, candidature, sélection avec paiement Stripe test, livraison, révision, approbation, avis, auto-approbation) puis supprime ses données :

```bash
cd backend
npm run test:e2e -- --clean
```

Résultat attendu : `68/68 étapes OK` (et `13/13` pour le test navigateur). Si une étape est ❌, le message dit quoi et pourquoi.

## 4. Test manuel dans le navigateur

### Comptes à créer

Vous aurez besoin de 3 comptes (3 emails différents). Astuce : Gmail accepte `votrenom+marque@gmail.com`, `votrenom+createur@gmail.com`, etc.

| Rôle | Comment |
|------|---------|
| Marque | Page d'inscription → "Marque", puis vérification d'entreprise dans le profil (SIRET réel de test : 356 000 000 00048) avant de publier |
| Créateur | Page d'inscription → "Créateur" |
| Admin | Créez un compte marque, puis dans un terminal : `cd backend && npm run make-admin -- email@du.compte`. Reconnectez-vous : le menu "Administration" apparaît. |

Utilisez une fenêtre de navigation privée pour être connecté avec plusieurs comptes en même temps.

### Parcours marque

1. Inscription (email, mot de passe, nom de l'entreprise, pays/langue, CGU) → tableau de bord : la carte « Prochaine étape » guide vers la vérification d'entreprise, puis la première campagne, puis le signataire.
2. "Nouvelle campagne" : titre (10 caractères min), description (50 min), niches, type de vidéo, budget (une suggestion marché s'affiche), date limite → "Enregistrer le brouillon" → "Publier maintenant".
3. La campagne apparaît "Ouverte aux candidatures". Les créateurs des mêmes niches reçoivent un email.

### Parcours créateur

1. Inscription (email, mot de passe, nom, pays/langue, niches, CGU : le reste se complète après) → tableau de bord : la carte « Prochaine étape » indique la seule chose à faire maintenant et son bouton mène directement au bloc concerné du profil (défilement + surlignage) (3 vidéos, puis informations administratives, puis validation, puis vidéo Ambassadeur).
2. "Mon portfolio" : ajoutez 3 vidéos (n'importe quel fichier vidéo court). Elles se lisent directement sur la page.
3. Bloc "Recevoir mes paiements" → "Connecter Stripe" (fonctionne uniquement si Stripe Connect est activé).
4. Attendez la validation admin (étape suivante).

### Parcours admin

1. Menu "Administration" → onglet "Créateurs à valider" → "Voir le portfolio" → "Valider". Le créateur reçoit un email.
2. Le bouton "Lancer les tâches planifiées" force l'auto-approbation des livraisons de plus de 7 jours (utile pour tester sans attendre).

### Retour créateur

1. "Campagnes" → ouvrez la campagne → "Candidater maintenant" (prix pré-rempli, message optionnel).
2. Onglet "Mes candidatures" pour suivre.

### Retour marque

1. Ouvrez la campagne : la candidature apparaît avec le score de matching, la note et un lien vers le portfolio.
2. "Sélectionner et payer" : vous êtes redirigé vers la livraison, où un écran Stripe demande votre carte. En mode test, utilisez le numéro **4242 4242 4242 4242**, une date future (ex. 12/34) et un CVC quelconque (123). Le montant est bloqué, pas débité : il ne sera prélevé qu'à votre validation de la livraison.

### Livraison

1. Créateur : "Missions" (onglets À livrer / Révision / En attente de validation / Terminées, date limite, montant) → envoyez une ou plusieurs vidéos → "Soumettre mes vidéos".
2. Marque : "Livraisons" → regardez les vidéos → "Approuver et payer" ou "Demander une révision" (nombre maximum réglable dans l'admin, 20 caractères min).
3. Après approbation : chacun peut noter l'autre (étoiles + critères). La note apparaît sur le profil public du créateur.

### Auto-approbation à 7 jours

Sans réponse de la marque, la livraison est validée automatiquement. Pour tester sans attendre : admin → "Lancer les tâches planifiées" après avoir modifié la date dans la base, ou lancez `npm run test:e2e` qui simule ce cas.

## 5. Tester les nouvelles fonctionnalités

| Fonctionnalité | Où | Comment tester |
|---|---|---|
| Devis (prix, droits, conditions) | Page campagne, côté créateur | « Envoyer un devis » puis « Modifier mon devis » tant que la marque n'a pas accepté. La marque voit chaque devis et clique « Accepter le devis et payer ». |
| Budget facultatif | Création de campagne | Laissez le budget vide : les créateurs voient « Devis libre ». |
| Livraison par lien | Page livraison, côté créateur | Collez une URL TikTok / Instagram / Drive (une par ligne). Le compteur « x / N attendue(s) » bloque la soumission au-delà de N. |
| Liens publics / privés | Page livraison, après validation | Chaque partie coche ou décoche « J'accepte qu'il soit public ». Le lien n'apparaît sur le profil du créateur que si les deux acceptent. |
| Badges et niveaux | Profil créateur, candidatures | Nouveau / Confirmé (3 missions, note ≥ 4,5) / Expert (10 missions, note ≥ 4,7). Seuils modifiables dans `backend/.env` (`BADGE_*`). |
| Vidéo Ambassadeur | Profil créateur → « Parlez de NeedCreator » | Collez un lien, puis Admin → « Vidéos Ambassadeur » → Valider. Le créateur voit les campagnes 24 h avant les autres (`EARLY_ACCESS_HOURS`, 0 pour désactiver). |
| Réactivité des marques | Cartes et page campagne, côté créateur | « Valide en X j », « répond en X j », calculés après les premières sélections et validations. |
| Invitation | Annuaire « Créateurs » ou fiche créateur, côté marque | « Inviter » → choisir une campagne ouverte. Le créateur invité voit la campagne même en avant-première. |
| Annuaire des créateurs | Menu « Créateurs » (marque) | Filtres niches, prix, note, niveau, réseau, abonnés ; onglet « Mes collaborateurs ». |
| Réseaux sociaux et réalisations | Profil créateur | Blocs « Mes réseaux sociaux » et « Mes réalisations » ; visibles sur la fiche publique (onglet Réalisations, 12 par page). |
| Multi-créateurs | Création de campagne → « Nombre de créateurs recherchés » | Sélectionnez plusieurs devis ; « Payer toutes les sélections en une fois » sur la page campagne. |
| Entreprise étrangère | Profil marque → « Vérification de l'entreprise » | Choisir « Autre pays de l'UE » (numéro de TVA, format contrôlé) ou « Hors Union européenne » (code pays + numéro d'immatriculation) : passe en contrôle manuel, visible dans Admin → Entreprises avec le pays et le numéro. |
| Campagnes publiques | Menu « Campagnes » du site public, `/campagnes` et `/campagnes/<id>` | Toute campagne publiée et non privée y apparaît, sans connexion (cache 5 min). Bouton « Créer mon profil et envoyer un devis » → inscription créateur puis redirection vers la campagne. Pages dans le sitemap. |
| Inviter un créateur extérieur | Page campagne publiée, côté marque, bloc « Inviter un créateur que vous connaissez » | Email d'un créateur non inscrit : il reçoit un lien d'inscription à votre nom ; à son inscription la campagne lui est ouverte (invité) et vous êtes notifié. Email d'un créateur déjà inscrit : invitation directe. 20 invitations en attente max par campagne. |
| Devis clients (créateur) | Tableau de bord ou Mes revenus → « Mes devis clients », `/quotes` | Client hors plateforme : devis + projet de contrat PDF générés (informations administratives requises), envoi par email avec lien `/q/<jeton>`. Le client accepte et paie via NeedCreator (inscription marque pré-remplie ou compte existant) : mission privée créée, montant bloqué, contrat, commission « missions extérieures » (Admin → Commission). Ou « Payé en direct » : sans commission, sans facture par mandat. Refus possible par le client. Le devis et le contrat sont joints en PDF à l'email du client. « Modifier » sur un devis brouillon ou envoyé : formulaire pré-rempli, PDF régénérés avec le même numéro et le même lien (à renvoyer au client s'il l'avait déjà reçu) ; un devis accepté ou décliné ne se modifie plus. |
| Mes droits & exclusivités (créateur) | Tableau de bord → « Mes droits & exclusivités », `/rights` | Les missions validées et les devis « payés en direct » apparaissent seuls (droits du contrat, exclusivité). « Ajouter un contenu externe » : client, dates, supports, exclusivité, lien du contrat ; tuiles cliquables (en cours, expirent sous 30 j, expirés, exclusivités actives). Rappels (tâches planifiées) : contenu externe à 30 et 7 jours, fin d'exclusivité le jour même, notification cloche + email. « Proposer un renouvellement » : mission NeedCreator → bloc Contrat de la mission ; contenu externe → devis pré-rempli dans « Mes devis clients ». Un contenu de mission ne se supprime pas et ses droits ne se modifient pas (notes seulement). |
| Revenus extérieurs (créateur micro) | Mes revenus → bloc « Seuils micro-entreprise » (statut micro-entrepreneur requis) | « Ajouter un revenu » : libellé, client, montant HT, date. Les devis « payés en direct » apparaissent seuls (non supprimables). Le chiffre d'affaires affiché et les barres de seuils (TVA, plafond micro) portent sur le total NeedCreator + hors plateforme. |
| Suivi de prospection (créateur) | Tableau de bord → « Prospection », `/prospects` | « Ajouter une marque » (nom obligatoire, contact, source, statut, prochaine relance, note). Tuiles : à relancer aujourd'hui, en cours, devis envoyés, gagnées. Relance à date → notification cloche + email lors des tâches planifiées (une fois). « Faire un devis » ouvre « Mes devis clients » pré-rempli ; le prospect passe en « Devis envoyé », puis « Gagnée » quand le devis est accepté ou payé en direct, « Perdue » s'il est décliné. |
| Calculateur de tarif UGC (public) | Pied de page, Devenir créateur, `/calculateur-tarif-ugc` | Sans connexion : type de vidéo, durée, nombre, droits, exclusivité, supports → fourchette par vidéo (basse, médiane, haute) et totale, facteurs détaillés, source (devis acceptés ou grille). Le tarif monte avec publicité payante, droits longs, exclusivité ; baisse avec le volume. |
| Page publique Créateurs | Menu « Créateurs » du site, `/nos-createurs` | Annuaire des créateurs référencés, toujours affiché. Onglet « Inscrits sur NeedCreator » seulement à partir du seuil Admin → Réglages → « Site public » (6 par défaut, 0 = toujours), compté sur les créateurs validés avec portfolio et accord. « Devenir créateur » dans le menu mène à la page marketing. |
| Utilisateurs (admin) : filtres | Admin → onglet « Utilisateurs » | Recherche (email, nom, entreprise) et six filtres combinables : rôle, statut, origine (comptes réels / amorçage), email confirmé ou non, abonnement Pro ou gratuit, Ambassadeurs ou demandes en attente. Le nombre de résultats s'affiche à côté du titre (100 affichés au plus) ; « Réinitialiser » vide les filtres. |
| Nous contacter | Page publique `/contact` (pied de page « Nous contacter », icône bouée dans l'en-tête une fois connecté, menu mobile) ; réglage Admin → Réglages → Site public → « Adresse de réception du formulaire de contact » | Formulaire : nom, email, profil (marque, créateur, autre), sujet, message (20 caractères minimum) ; pré-rempli pour un utilisateur connecté. L'email arrive à l'adresse du réglage (par défaut contact@needcreator.com, plusieurs adresses séparées par des virgules) avec le sujet préfixé « [Contact] » ; « Répondre » répond directement à l'expéditeur, qui reçoit aussi un accusé de réception. Anti-abus : Turnstile si configuré, champ piège invisible pour les robots, 5 messages par heure et par adresse IP. Chaque message est tracé 12 mois (collection `contactmessages`). |
| Aperçu intégré des publications (oEmbed) | Page d'une livraison par lien ; Admin → Prospection, fiches dont le lien est une publication | Sous chaque lien de livraison qui est une publication Instagram, TikTok ou YouTube (pas un profil ni un dossier Drive) : « Afficher la publication » charge la publication dans la page (rien n'est chargé avant le clic, le réseau pouvant déposer ses cookies ; « Toujours afficher » mémorise le choix dans le navigateur). Instagram : balisage officiel de l'oEmbed de Meta quand la fonctionnalité « oEmbed Read » est accordée, avec « Publication de @auteur » ; sinon intégration par permalien, sans auteur. TikTok : oEmbed public, auteur affiché. YouTube : lecteur sans cookie. Dans l'admin, l'aperçu d'un prospect Instagram trouvé par hashtag renseigne automatiquement son pseudo et son lien de profil dès que l'auteur est connu. « Masquer la publication » la referme et annule « Toujours afficher ». Les liens livrés sont affichés en version courte (domaine et chemin, sans paramètres de suivi), adresse complète au survol. C'est la fonctionnalité à filmer pour la revue d'application Meta. |
| Envoi du produit sur une mission sans envoi prévu | Page de livraison, côté marque | Campagne sans envoi de produit : simple ligne « Aucun envoi de produit prévu pour cette mission », sans alerte sur l'adresse du créateur. « Envoyer un produit finalement » passe l'envoi en « À expédier », prévient le créateur (notification : vérifier son adresse) et affiche alors l'adresse, le transporteur et le suivi. Côté créateur, rien n'est affiché tant qu'aucun envoi n'est prévu. |
| Brief depuis une URL produit | Page publique `/brief-depuis-url` (liens : pied de page, page Marques, accueil) | Sans compte : coller l'adresse d'une fiche produit (Shopify, WooCommerce ou toute page publique). L'outil lit JSON-LD, Open Graph et texte (jamais de réseau privé), puis l'IA produit positionnement, cible, trois angles avec accroche, format (type, durée, nombre de vidéos, réseaux, niche), budget estimé par le calculateur (droits 1 an, réseaux + publicité) et le brief complet (consignes, à faire, à éviter, hashtags). Lien partageable `?id=` valable 30 jours ; 5 briefs par heure et par IP, 300 par jour. Site qui bloque (403) ou page absente (404) : message clair. « Publier ce brief » : visiteur → inscription marque avec `brief=<id>`, campagne brouillon créée et ouverte à l'arrivée ; marque connectée → « Créer la campagne à partir de ce brief » (brouillon avec budget, consignes, produit et lien) ; une seconde reprise renvoie la même campagne. Tests : `ALLOW_LOCAL_FETCH=1` sur le serveur de test pour lire une page factice locale. |
| Prospection (agents d'acquisition) | Admin → « Prospection » ; réglages dans Admin → Réglages, groupe « Prospection » | Clés `YOUTUBE_API_KEY` et `META_ACCESS_TOKEN` dans le `.env` (le jeton Meta est aussi modifiable dans les réglages, expire tous les 60 jours : rappel affiché). « Chercher des créateurs » : recherche YouTube par mot-clé (réglage « Mots-clés créateurs », une ligne par niche), email extrait de la bio ou du lien de bio, dédoublonnage avec les comptes et l'annuaire, qualification IA (score, signaux, message réseaux ≤ 300 caractères, paragraphe email). **Instagram** (même bouton « Chercher des créateurs ») : publications récentes des hashtags du réglage « Hashtags Instagram » via l'API officielle (compte Instagram professionnel relié à une page Facebook du jeton, ou à la page dont l'ID est saisi dans le réglage « ID de la page Facebook » si Meta ne la liste pas ; 30 hashtags uniques par 7 jours) ; l'API ne donne pas l'auteur : légende lue pour l'email et la qualification, lien vers la publication, pseudo complété quand Meta a approuvé la fonctionnalité « oEmbed Read » (Tableau de bord développeur → Revue de l'application). « Chercher des marques » : bibliothèque publicitaire Meta (identité Meta confirmée requise), site trouvé dans les annonces, email sur le site ou les mentions légales. Recherche nocturne automatique si le réglage est activé (une fois par 20 h, plafond « nouveaux par nuit »). **Réseaux du prospect** : Instagram, TikTok, YouTube, LinkedIn, Facebook affichés en petits liens sous chaque fiche, trouvés dans la bio, la rubrique « Liens » de la chaîne YouTube (page publique « À propos »), le lien de bio (Linktree…) ou le site de la marque ; bouton « Réseaux » pour les saisir à la main ; « Requalifier » les complète pour les prospects anciens ; colonnes `instagram;tiktok` dans l'export CSV. Files : Créateurs / Marques, statuts (qualifié, à contacter, contacté, a répondu, inscrit, à qualifier, hors cible, déjà connu), filtre email, recherche, sélection groupée. Actions : copier le message, ouvrir le profil, requalifier, note, email à la main, supprimer, « Ajouter à la main » (qualifié aussitôt). **« Import groupé (liste collée) »** : une ligne par prospect, champs libres séparés par « ; », tabulation ou « | » (nom ; lien ; email ; bio ; site ; l'email et les liens sont reconnus où qu'ils soient, ligne d'en-tête ignorée, 500 lignes maximum) ; « Vérifier la lecture » montre ce qui sera importé ; doublons (lien, email, identifiant) ignorés, comptes inscrits marqués « Inscrit », créateurs de l'annuaire « Déjà connu », réseaux relevés, niche et origine par défaut, qualification IA en arrière-plan. **Suppression et conservation** : supprimer un prospect efface ses données et place des empreintes (SHA-256 de l'email, du profil, des réseaux) en liste d'exclusion : il n'est plus jamais recollecté ni réimportable ; purge automatique des prospects sans activité depuis 24 mois (hors inscrits) à chaque tâche nocturne ; décrit dans la politique de confidentialité, sections « 2 ter » (données publiques Meta et YouTube) et « 5 bis. Supprimer vos données » ; adresses courtes `/privacy`, `/terms`, `/data-deletion` pour la revue d'application Meta. Consignes prêtes à coller dans l'application Claude avec l'extension Chrome (bibliothèque Meta, Instagram, TikTok, LinkedIn, messages assistés) : `docs/AGENT-CHROME.md`. « Export CSV (avec email) » : colonnes email, prénom, pseudo, niche, paragraphe, message, lien d'inscription rattaché (`register?role=creator&from=<pseudo>`) pour l'outil de mailing ; « Export + marquer contactés ». « Vers l'annuaire » : ajoute les créateurs qualifiés à l'annuaire des créateurs référencés (source « prospection »). Un prospect dont l'email correspond à un compte inscrit passe en « Inscrit » à l'exécution suivante. **Envoi automatique** (bloc « Envoi automatique par l'outil de mailing », `MAILING_PROVIDER=salesblink` + `MAILING_API_KEY`) : « Pousser les éligibles » envoie dans l'outil, listes « NeedCreator · Prospection créateurs » et « … marques » (créées au premier envoi), les prospects « À contacter » et les « Qualifiés » avec score ≥ réglage (email générique exclu pour les créateurs), dans la limite quotidienne ; champs disponibles dans les modèles de l'outil : first_name, username, niche, paragraph, message, signup_link, company_name, website. Sélection + « Vers le mailing » pousse quel que soit le score. Dans l'outil, rattachez vos séquences à ces deux listes : tout contact ajouté entre dans la séquence. « Synchroniser » (et chaque nuit) : réponses → « A répondu » avec le texte, désabonnés et rebonds → « Hors cible », inscrits retirés des séquences ; pause automatique de l'envoi si le taux de rebond dépasse le réglage (email admin). Réglages : envoi automatique, contacts par nuit, score minimum, seuil de rebond. **Réponses** : chaque réponse est classée par l'IA (intéressé, question, pas maintenant, refus, ne plus écrire, absence) avec un résumé et une proposition de réponse ; bloc « Réponse » sur la fiche : « Relire et envoyer » part depuis l'expéditeur de l'outil de mailing, dans le fil ; réglage « Répondre automatiquement aux prospects intéressés » pour l'envoi sans clic (questions et refus attendent toujours un humain) ; refus et « ne plus écrire » passent en Hors cible et sont retirés des séquences. **Onboarding marque** : le lien d'inscription de la réponse (`/register?role=brand&lead=…`) pré-remplit le compte ; à l'inscription, le prospect passe en Inscrit et une campagne brouillon rédigée par l'IA d'après ce qu'on sait de la marque attend dans ses campagnes (notification). **Tableau de bord** (bouton Afficher) : entonnoirs créateurs et marques (trouvés → email → qualifiés → contactés → répondu → intéressés → inscrits) sur 30 jours et depuis le début, conversion par niche, mots-clés les plus productifs, sources. |
| Amorçage (marques et campagnes en masse) | Admin → « Amorçage » | Une ligne par marque : email ; mot de passe ; entreprise ; SIRET ; site ; secteur ; nombre de campagnes ; tarif max (plafond du budget, 0 = devis libre sans budget affiché, vide = fourchette du lot) ; commentaire facultatif : consigne interne pour la génération, jamais affichée (ex. « uniquement des applications et du service ») ; si l'IA de rédaction est configurée, chaque brief est rédigé par l'IA, commentaire ou pas : produit inventé pour l'entreprise, format alterné au sein d'un secteur (témoignage, unboxing, démo, tutoriel, avis, journée type, comparatif), sujets déjà utilisés dans le lot évités, consigne respectée s'il y en a une (10 à 20 s par campagne, création en arrière-plan avec avancement dans la liste des lots) ; sinon les modèles du secteur sont utilisés. « Vérifier » puis « Créer le lot » : comptes créés (email confirmé, entreprise vérifiée, signataire), campagnes publiées depuis les modèles avec dates étalées. Invisible côté créateur. Option « clôturer à la date limite » : à l'échéance la campagne se termine et les candidats reçoivent l'email de non-sélection (Ambassadeur en premier conseil). Suppression par lot, avec ou sans les comptes (identifiant de lot obligatoire). Restauration sélective des campagnes d'une marque depuis une sauvegarde : `npm run backup:restore-brand -- <archive> <email> [--dry-run]`. Utiliser des adresses d'un domaine que vous contrôlez. |
| Sauvegardes de la base | Admin → Réglages → « Sauvegardes » et carte « Sauvegardes de la base » | Réglages : activée ou non, fréquence en heures, conservation en jours, répertoire sur le serveur. « Sauvegarder maintenant » crée une archive `needcreator-AAAAMMJJ-HHMMSS.tar.gz` (une collection par fichier, Extended JSON). Bouton « Restaurer » sur chaque archive (confirmation en tapant RESTAURER, avec ou sans vidage des collections). En ligne de commande dans `backend/` : `npm run backup` ; restauration : `npm run backup:restore -- <archive> [--drop]`. Indépendant des sauvegardes Atlas. |
| Suspendre un compte | Administration → Utilisateurs → « Suspendre » (motif facultatif) | La personne reçoit un email avec le motif ; ses actions sont bloquées ; pour une marque, ses campagnes disparaissent du fil des créateurs, du détail et du site public (les missions déjà en cours restent accessibles au créateur sélectionné). « Activer » réactive et prévient par email. |
| Confirmer l'email (admin) | Administration → Utilisateurs → « Confirmer l'email » | Marque l'adresse comme confirmée chez Firebase et en base, pour un utilisateur qui ne reçoit jamais l'email ou un compte de test. |
| Emails de confirmation (dev) | Admin → Réglages → « Vérifications » → « Envoyer les emails de confirmation d'adresse » | Désactivé : l'inscription et « Renvoyer l'email » ne demandent plus de lien à Firebase (évite TOO_MANY_ATTEMPTS_TRY_LATER quand les tests créent des comptes en boucle). À laisser activé en production. |
| Boutons grisés expliqués | Tous les formulaires | Règle : un bouton principal grisé s'accompagne d'un texte « Il manque : … » (devis, portfolio, révision, équipe, invitation extérieure, paiement, campagne, inscription, profil, contenus). Le test d'interface le vérifie sur les pages clés. |
| Devis non retenu | Sélection d'un créateur quand tous les postes sont pourvus | Les autres candidats reçoivent une notification et un email court sans motif, avec un bloc « Augmentez vos chances » : le programme Ambassadeur en premier, puis portfolio, académie et devis selon ce qu'il leur manque. Admin → Réglages → « Relances automatiques » : « Prévenir les créateurs non retenus » et « Proposer le programme Ambassadeur ». |
| Compteurs admin | Administration, onglets | Le nombre d'éléments à traiter s'affiche sur les onglets : créateurs à valider, vidéos Ambassadeur, marques à vérifier, signalements, litiges. |
| Académie (accès) | Menu créateur « Académie » ; carte « Prochaine étape » du tableau de bord quand tout le reste est complet (étape facultative) | Cinq guides, quiz à 75 %, badge Formé après trois guides réussis. |
| Badges partageables | Profil créateur → « Mon kit média » → « Mes badges à partager » | Visible dès qu'un badge Formé ou Ambassadeur est obtenu : image carré, story 9:16 et LinkedIn (`/c/<slug>/badge/<trained|ambassador>?format=…`), texte de post à copier. 404 si le badge n'est pas attribué. |
| Widget créateur vérifié | Même carte, « Widget » | Dès que le portfolio est validé : image SVG `/c/<slug>/widget` (nom, niveau, missions, note, mise à jour automatique) et code HTML à coller dans un site ou une bio. |
| Contenus & droits | Menu « Contenus » (marque), `/contents` | Les missions validées apparaissent automatiquement (droits du contrat, prix, contrat et factures en documents). « Ajouter un contenu extérieur » : créateur, type de contrat, dates, supports, territoire, prix, liens. « Où c'est utilisé » ajoute une diffusion. « Renouveler » : prolongation depuis la mission (NeedCreator) ou email au créateur (extérieur). Import Excel/CSV (colonnes titre, créateur, email, type de contrat, début, fin, supports, territoire, prix, lien, produit), export CSV. Rappels 30 et 7 jours par les tâches planifiées. Page publique `/contenus-et-droits`. |
| Services (métiers) | Profil créateur → « Services proposés » | Vidéo UGC par défaut ; vidéo sociale, photo produit, voix off, montage, acteur, influence. Le portfolio attendu dépend du service (vidéos, images, audios) et les campagnes proposées aussi. Un créateur qui ne propose pas le service d'un lot ne peut pas candidater. |
| Portfolio multi-formats | Profil créateur → « Ajouter au portfolio » | Vidéo, image ou audio ; l'élément s'affiche selon son type. Filigrane uniquement sur les vidéos. |
| Lots de campagne (API) | `POST /campaigns` avec `lots: [{ key, service, title, deliverables }]` | Sans lots, un lot « main » vidéo UGC est créé automatiquement ; candidatures et livraisons portent `lotKey`. Contrôle de conformité automatique seulement pour les livrables vidéo. Pas encore de saisie multi-lots dans le formulaire (site inchangé). |
| Reconduire avec ce créateur | Page livraison, côté marque, après validation | Crée une campagne privée en brouillon (même brief, créateur invité, dernier devis en modèle, remise fidélité du réglage admin « Commission » déduite du prix payé, créateur payé pareil). Vérifiez, publiez : le créateur reçoit email + notification et voit son devis pré-rempli. |
| Gifting | Création de campagne → « Gifting (produit offert) », toutes les marques | Marque gratuite : frais de service (`GIFTING_FEE_PER_VIDEO`, 5 € HT par vidéo livrée, TVA en sus) bloqués à la sélection. Marque Pro : aucun frais, aucun paiement, la mission démarre à la sélection. Figé à la création de la campagne. |
| Commissions | Admin → Réglages → « Commission » : standard (10 %), marques Pro (10 %), Ambassadeurs (8 %) | Figées sur chaque campagne à sa création : un changement ne concerne que les campagnes suivantes. Le site, les tarifs et les CGU lisent la valeur en vigueur. Les variables `STRIPE_PLATFORM_FEE_PERCENT` et `PRO_FEE_PERCENT` du `.env` ne servent plus que de repli. |
| Commission réduite Ambassadeur | Admin → Réglages → « Commission » (8 % par défaut) | Un créateur Ambassadeur sélectionné sur une mission se voit appliquer cette commission si elle est plus basse que celle de la campagne ; visible sur la mission, la facture de commission et les revenus. Affichée sur le site (page créateurs, tarifs, comment ça marche, carte Ambassadeur). |
| Email de partage après mission | Boîte mail du créateur après « Approuver » par la marque | Texte de publication prêt à copier, lien de parrainage, lien du kit média. Pas envoyé sur validation automatique. |
| Contre-proposition | Page campagne, côté marque, sur un devis en attente | « Contre-proposer » : prix, délai, révisions, message. Le créateur reçoit un email et une notification, puis « Accepter » (son devis est mis à jour, version +1), « Refuser » (devis inchangé) ou « Modifier mon devis » (la contre-proposition est remplacée). Pas de contre-proposition sur le gifting. |
| Comparateur de candidats | Page campagne, côté marque, dès 2 candidatures | Cochez jusqu'à 4 candidats : tableau prix HT/TTC, par vidéo, délai, révisions, droits, note, missions, badges, disponibilité ; la meilleure valeur de chaque ligne est surlignée. Menu « Trier par » (matching, prix, délai, note). |
| Visibilité publique du créateur | Profil créateur → « Où vos vidéos peuvent apparaître » | Cochée par défaut depuis le 12/09/2026 (site public et communication). Pour les comptes créés avant : `npm run consent:default` dans `backend/` sur le serveur, une fois. Le créateur peut décocher à tout moment. |
| Messagerie | Page campagne (« Discuter ») et menu « Messages » | Ouverte après candidature ou invitation. Email de notification, au plus un toutes les 15 min par discussion. |
| Envoi de produit | Création de campagne (case à cocher) → page livraison | Le créateur renseigne son adresse dans son profil ; la marque marque « expédié » (suivi) ; le créateur « reçu ». Le délai de production démarre à la réception. |
| Mes revenus | Menu « Mes revenus » (créateur) | Missions payées, en attente, bonus, export CSV. |
| Parrainage | Profil (marque et créateur) | Copiez le lien d'invitation ; le filleul s'inscrit avec le code (`?ref=`). Montants dans `backend/.env` (`REFERRAL_*`). |
| Performances | Page livraison après validation | Renseignez vues / likes par vidéo ; cumul et coût pour 1 000 vues sur la page campagne (marque). |
| Brief IA | Création de campagne, étape 1 | Nécessite une clé dans `backend/.env` (`ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`, `AI_PROVIDER`). Prompts modifiables dans `backend/config/prompts/`. |
| Pack prêt à diffuser | Page livraison après validation (marque) | Choisissez les formats, payez (`READY_PACK_PRICE`, 0 = inclus), téléchargez les déclinaisons. Sous-titres si la transcription est configurée (`TRANSCRIPTION_*`, Groq par défaut avec `GROQ_API_KEY`). |
| Disponibilité | Profil créateur → « Disponibilité » | Date de retour + message ; visibles par les marques (annuaire, devis, profil public) ; matching pénalisé. |
| Kit média | Profil créateur → « Mon kit média » | Lien `/c/<slug>`, QR code, texte à coller ; la page publique propose « Me proposer une mission » aux visiteurs. |
| Académie | Menu pied de page → Académie, ou tableau de bord → progression | 5 guides + quiz ; badge « Formé » après 3 guides réussis (réglable `ACADEMY_REQUIRED`). |
| Virements | Mes revenus → « Calendrier des virements » | Solde Stripe, prochains virements, seuils micro-entreprise (créateur en micro). |
| Filigrane | Profil public d'un créateur vu par une marque | Les vidéos de portfolio portent le logo NeedCreator en bas à droite ; le créateur voit l'original sur son propre profil. Généré à l'ajout (quelques secondes), anciennes vidéos traitées par « Lancer les tâches planifiées ». |
| Modèles de campagne | Création de campagne, étape 1 | « Partir d'un modèle » (6 secteurs) ou « Dupliquer une campagne passée » ; bouton « Dupliquer » sur une campagne. |
| Campagne privée | Création de campagne, étape 2 | Case « Campagne privée » : invisible pour les créateurs non invités ; inviter depuis l'annuaire ou la page campagne. |
| Équipe marque | Profil marque → « Équipe » | Inviter par email ; le collaborateur s'inscrit via le lien et agit au nom de l'entreprise (menu : « Prénom · Entreprise »). Propriétaire seul : équipe, administratif, abonnement. |
| Avis | Page mission (après validation), profil → « Avis reçus » | Double aveugle : l'avis reste caché jusqu'à celui de l'autre partie, publié automatiquement après le délai (Réglages, 14 j). Réponse publique depuis le profil. |
| TVA et factures | Profil créateur → informations administratives (statut TVA, mandat de facturation) ; page mission après validation ; page « Factures » | Devis HT ; créateur assujetti = la marque paie TTC (120 € pour 100 € HT), créateur reçoit 108 € ; franchise = 100 € payés, 90 € reçus. Factures PDF émises automatiquement à la validation (créateur → marque par mandat, commission NeedCreator, services NeedCreator). Relevé mensuel : page « Factures » → mois → « Télécharger le relevé ». Avoirs : Administration → Factures → « Émettre un avoir » (motif obligatoire). `VAT_RATE` dans `backend/.env` (20 par défaut). |
| Litige | Page mission (marque), révisions du devis épuisées → « Demander un refus définitif » | Motif obligatoire ; validation automatique suspendue ; le créateur répond une fois depuis la page mission ; Administration → Litiges : paiement intégral, partage (% réglable, capture partielle Stripe) ou remboursement intégral. Décision envoyée aux deux parties. |
| Notifications | Cloche dans le menu (connecté) | Compteur non lu, 20 dernières, marquées lues à l'ouverture. Rafraîchies toutes les 30 s. |
| Retrait sans remplaçant | Page mission (marque) en retard > 48 h, sans autre devis | « Retirer la mission et rouvrir la campagne » : paiement libéré, campagne active, retard compté sur le créateur. Au-delà de N retraits (Réglages), le créateur ne peut plus candidater ; remise à zéro dans sa fiche utilisateur admin. |
| Réglages admin | Administration → Réglages | Registre SIRET (case), délais des relances automatiques (devis sans réponse, mission sans vidéo, produit non confirmé, révision sans réponse), nombre maximum de révisions, refus définitif automatique après silence sur une révision (0 = désactivé). Appliqués par les tâches planifiées : Administration → « Lancer les tâches » ou `POST /api/admin/jobs/run`. |
| Vérification d'entreprise | Profil marque → « Vérification de l'entreprise » | SIRET ou TVA (site web facultatif). Le SIRET est vérifié au registre national des entreprises (existence et activité, raison sociale affichée). Email pro ou site web → immédiat ; email grand public sans site web → onglet admin « Marques à vérifier ». Sans vérification, pas de publication. Pour désactiver le contrôle au registre (friction) : Admin → Réglages, ou `BUSINESS_REGISTRY_CHECK=false`. SIRET de test réel : 356 000 000 00048 (La Poste). |
| Abonnement Pro | Profil marque → « NeedCreator Pro » | 14 jours d'essai offerts à l'inscription. « Souscrire » ouvre Stripe Checkout (carte test 4242…). Commission 8 %, brief IA illimité, gifting, multi-créateurs. |
| Quota brief IA | Création de campagne | 3 briefs / mois en gratuit (compteur affiché), illimité en Pro. |
| Limites nouvelle marque | Publication, invitations, messages | 2 campagnes ouvertes, 5 invitations / jour, 20 messages / jour tant qu'aucune campagne n'est terminée. |
| Coordonnées masquées | Messagerie | Emails et téléphones remplacés par « [coordonnées masquées avant sélection] » tant que le créateur n'est pas sélectionné. |
| Signalement | Bouton « Signaler » (campagne, profil, discussion) | Traitement dans Admin → « Signalements » : sans suite, traité ou suspension. |
| Shopify | Profil marque → « Boutique Shopify » | Nécessite une application Shopify (`SHOPIFY_*` dans `backend/.env`). Ensuite : pré-remplir un brief depuis un produit, publier les vidéos validées sur la fiche produit (metafield `needcreator.ugc_videos`). |

## 6. Problèmes fréquents

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| "Impossible de joindre le serveur" | Backend arrêté | `cd backend && npm run dev` |
| Erreur CORS dans la console | L'adresse du frontend n'est pas dans `FRONTEND_URL` (backend/.env) | Ajoutez-la, séparée par une virgule |
| Google login refusé | Domaine non autorisé dans Firebase | Firebase Console → Authentication → Settings → Authorized domains. Une adresse IP ne peut pas être ajoutée : utilisez un nom de domaine ou testez avec email/mot de passe |
| "Finalisez votre inscription" | Compte Firebase créé mais profil non enregistré | Remplissez le formulaire proposé, le compte sera complété |
| Vidéo qui ne se lit pas | Lien signé expiré (1 h) | Rechargez la page |
| "You can only create new accounts if you've signed up for Connect" | Stripe Connect non activé | https://dashboard.stripe.com/connect |
| L'écran de carte ne s'affiche pas | Clé publique Stripe absente | Vérifiez `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` dans `frontend/.env.local` (clé `pk_test_...`) |
| "Le paiement n'a pas été confirmé" à l'approbation | Carte jamais saisie | Ouvrez la livraison et renseignez la carte dans le bloc "Paiement à confirmer" |

## Importer une liste de créateurs (admin)

Administration → onglet « Créateurs référencés » → choisir le fichier (xlsx ou csv, colonnes `Username, Name, Country, Email, Instagram, YouTube, Followers, Posts, Likes, Niche`) et le périmètre (France, francophonie, Europe, monde) → Importer. Le résumé indique les créés, mis à jour, hors périmètre et doublons. L'import est rejouable sans créer de doublons. Résultat visible sur `/annuaire-createurs` (public) et dans Créateurs → « Référencés » (marques).

Mailing : le même onglet propose l'export CSV pour l'outil d'emailing (filtres pays et abonnés minimum ; retirés et inscrits exclus) et l'import des désabonnés. Les emails à envoyer et les règles sont dans [MAILING-createurs.md](./MAILING-createurs.md).
