# Outil de prospection multi-sources · dossier de conception

> **Statut** : idée cadrée, rien de développé. Document vivant, tenu à jour au fil des décisions (journal en fin de document).
> **But du document** : permettre à une autre session de développement, sans autre contexte, de bâtir l'outil. Il contient la vision, les
> décisions déjà prises, l'architecture cible, le modèle de données, les algorithmes éprouvés et surtout les **pièges déjà rencontrés**.
> **Origine** : l'outil généralise le module « Agents de prospection » construit dans NeedCreator entre le 15 et le 19 septembre 2026.
> Ce module sert de prototype et de référence de code (voir § 12).
> **Propriétaire produit** : non-développeur, francophone. Il attend des réponses courtes et orientées décision, des livraisons testées, et des
> écrans utilisables sans formation.

---

## 1. Vision en une page

**Problème.** Trouver des prospects qualifiés demande de croiser plusieurs sources (publicités actives, réseaux sociaux, sites web, registres),
de retrouver un moyen de contact, de juger la pertinence, puis d'écrire un message personnalisé. Aujourd'hui cela se fait à la main ou avec des
outils généralistes (Waalaxy, lemlist, PhantomBuster, Apollo, Clay) centrés sur LinkedIn et la donnée B2B anglo-saxonne.

**Produit.** Un outil autonome, distinct de NeedCreator, qui automatise toute la chaîne **sans copier-coller** :

1. **Recherche** par sources croisées, selon une cible décrite en langage courant.
2. **Enrichissement** : email, réseaux, site, audience, à partir de tout ce qui est public.
3. **Qualification** par IA : score, signaux factuels, résumé.
4. **Préparation** : message court pour les réseaux et paragraphe d'email personnalisés.
5. **Envoi** (périmètre à décider, voir § 9) : emails par un outil de mailing ; messages privés seulement assistés.
6. **Suivi** : réponses classées par IA, réponse proposée, entonnoir de conversion.

**Portée (décidée le 22/09/2026).** Projet à part entière, distinct de NeedCreator, qui en est le premier client et le terrain de preuve.
Interface **en anglais par défaut**, français en seconde langue ; **multi-pays par conception** : pays, langue, mots-clés, hashtags et sources
sont des réglages par cible, jamais des valeurs en dur (chez NeedCreator, « FR », « regionCode FR » et les hashtags UGC français le sont).
Les messages générés par l'IA sont écrits dans la langue du **prospect**, détectée depuis sa bio, pas dans celle de l'utilisateur.

**Différenciation.** Construit large, vendu étroit au début. Techniquement généraliste ; commercialement, l'outil se vend d'abord aux métiers
dont la prospection **passe par les réseaux sociaux**, là où les généralistes (Apollo, Clay, lemlist, PhantomBuster, centrés sur LinkedIn et
les fichiers B2B) ne vont pas. Sources que ces généralistes n'ont pas : publicités vidéo actives (bibliothèque Meta), hashtags, portfolios
Canva et Linktree, chaînes YouTube de créateurs débutants, fiches produit des boutiques.

**Ce que l'outil n'est pas** : un catalogue de créateurs. Les plateformes UGC exposent leur base d'inscrits ; l'outil trouve et contacte des
personnes et des entreprises **inscrites nulle part**. Il alimente les plateformes et les agences, y compris les concurrents de NeedCreator :
décision assumée, « le fournisseur de pioches ».

**Clients visés, par ordre** (le vrai client est celui dont la prospection est le métier ; pas les marques, qui passent par une plateforme ou une agence) :

| Ordre | Client | Ce qu'il cherche | Pourquoi |
|---|---|---|---|
| 1 | Plateformes UGC et agences d'influence | créateurs sur Instagram, TikTok, YouTube ; marques qui font de la publicité | cas NeedCreator : tout est construit et prouvé, aucune adaptation ; plus d'une centaine d'acteurs en Europe au même stade |
| 2 | Agences de publicité et de contenu, freelances marketing | marques qui diffusent déjà des publicités, donc qui ont un budget | source bibliothèque Meta inexploitée ; le brief offert depuis le site de la marque est un accroche-client tout fait |
| 3 | Éditeurs d'applications Shopify | boutiques par secteur, taille, publicités actives | lecture des fiches produit existante, sites détectables sans API |
| 4 | Recrutement de talents créatifs (mannequins, studios, casting) | profils Instagram et TikTok par ville et style | même mécanique, autre vocabulaire |
| 5 | Organisateurs de salons ; sport et bien-être | exposants, intervenants ; influenceurs locaux, ambassadeurs | saisonnier ou très social ; à valider une fois les cibles paramétrables éprouvées |

**Produit d'entrée envisagé** : « quelles marques ont commencé à faire de la publicité vidéo cette semaine, dans mon secteur, dans mon pays ».
**Limites de la bibliothèque publicitaire Meta à intégrer dès la conception** (relevé du 22/09/2026, à revérifier avant de construire) :
accès nominatif, réservé à un usage propre, données non revendables ni redistribuables ; plafond de requêtes par application (de l'ordre de
200 par heure, ~100 publicités par page) ; couverture complète des publicités en Union européenne seulement (hors UE : politiques et sociales).
Hypothèse de travail : **chaque client connecte son propre accès Meta** (vérification d'identité à sa charge, jeton en son nom) ; l'outil vend
le logiciel, jamais la donnée. À mesurer dès la validation de l'identité NeedCreator : requêtes et durée pour couvrir un secteur sur un pays.
Simple, lisible, utile à quiconque vend aux marques ; ne demande que l'API Meta. Peut précéder l'outil complet.

**Principe directeur.** Tout ce qui peut passer par une API officielle passe par le serveur. Ce qui n'a pas d'API passe par le navigateur
**de l'utilisateur**, dans sa session, à vitesse humaine, via notre propre extension. Jamais de ferme de navigateurs, de comptes jetables ni de proxys.

---

## 2. Décisions déjà prises (ne pas rouvrir sans raison)

| Sujet | Décision | Pourquoi |
|---|---|---|
| Séquence de construction | 1) éprouver sur NeedCreator 2 à 3 mois, 2) extension pour notre usage interne, 3) décider du produit | La preuve de conversion vendra l'outil ; l'étape 2 a de la valeur seule |
| Extensions Claude ou ChatGPT comme socle | Non | Pilotées par conversation, aucune interface pour recevoir une tâche ni rendre un résultat : le copier-coller est structurel |
| Navigateurs cloud, proxys, comptes jetables | Non | Bannissements, coût, exposition juridique |
| Scrapers open source côté serveur (Instaloader, TikTok-Api) | Non | Exigent un compte connecté ou cassent à chaque changement ; bloquent IP et comptes |
| Messages privés automatiques | Non, assistés uniquement | C'est ce qui fait suspendre les comptes ; l'utilisateur clique Envoyer |
| Compte vitrine de l'utilisateur | Jamais utilisé pour naviguer | Un blocage serait visible de tous ; compte secondaire obligatoire |
| Recherche de site par moteur gratuit (DuckDuckGo) | Non | Bloque dès la deuxième requête ; prévoir une API payante à bas coût (Brave, Serper) |
| Positionnement | Construit large (langue, pays, sources paramétrables), vendu étroit au lancement : plateformes UGC et agences d'influence, puis agences de publicité | Marché généraliste saturé ; les sources sociales sont l'avantage |
| Langue et pays | Anglais par défaut, français en second ; multi-pays par conception ; messages dans la langue du prospect | Projet à part entière, pas limité à la France |
| Vendre aux concurrents de NeedCreator | Oui | NeedCreator est le premier client, pas le seul ; l'outil est un produit à part |

**Questions ouvertes** (à trancher avec le propriétaire) : nom du produit ; première liste de cinq plateformes ou agences à qui montrer l'outil ;
inclusion de l'envoi d'emails dans l'outil ou branchement sur un outil tiers ; modèle de prix ; jusqu'où vont les messages privés assistés ;
hébergement des données en Union européenne ; le produit d'entrée « nouvelles publicités vidéo » précède-t-il l'outil complet.

---

## 3. Sources : ce qui marche, ce qui ne marche pas

### 3.1 Par API, côté serveur

| Source | Usage | Accès | Limites et pièges constatés |
|---|---|---|---|
| **YouTube Data API v3** | Créateurs par mots-clés (`search` type=channel, regionCode=FR, relevanceLanguage=fr, puis `channels` part=snippet,statistics,brandingSettings) | Clé API gratuite, 10 000 unités par jour ; une recherche = 100 unités | L'API ne donne **pas** la rubrique « Liens » de la chaîne ni l'email (captcha). Les créateurs UGC ont très peu d'abonnés : ne pas filtrer par minimum d'abonnés. Un créateur sur quatre a un email dans sa description |
| **Page « À propos » YouTube** | Rubrique « Liens » (Instagram, TikTok) | `GET {chaîne}/about` avec l'en-tête `Cookie: SOCS=CAI; CONSENT=YES+cb` (sinon redirection vers consent.youtube.com) | Les liens externes sont encodés dans `youtube.com/redirect?q=<url encodée>` : décoder `q=` avant d'extraire. Une requête par chaîne, 1,2 s d'intervalle. Environ une chaîne sur trois affiche un réseau |
| **Meta Ad Library** (`ads_archive`, Graph v21) | Marques qui diffusent des publicités actives (`ad_reached_countries=["FR"]`, `ad_type=ALL`, `ad_active_status=ACTIVE`) | Jeton utilisateur avec `ads_read` **et identité du titulaire vérifiée** par Meta | Sans vérification : erreur code 10, sous-code 2332002. La vérification se fait par le parcours « Diffuser des publicités portant sur un enjeu électoral, social ou politique » (facebook.com/ID), avec double authentification ; refusée aux comptes Facebook récents. S'arrêter à la première erreur 10 ou 190 au lieu de la répéter par mot-clé |
| **Instagram Graph : hashtags** | Publications récentes d'un hashtag (`ig_hashtag_search` puis `{id}/recent_media`) | Compte Instagram professionnel relié à une page Facebook ; permissions `instagram_basic`, `pages_show_list`, `pages_read_engagement` | **L'API ne donne pas l'auteur.** 30 hashtags uniques par 7 jours. Erreur « Please reduce the amount of data » : redemander par paliers (25, 12, 6). `me/accounts` peut ne pas lister une page pourtant accessible : lire la page par son identifiant (`{pageId}?fields=instagram_business_account`) |
| **Meta oEmbed** (`instagram_oembed`) | Auteur et balisage d'une publication | Fonctionnalité « Meta oEmbed Read », soumise à revue d'application ; nécessite vérification de l'entreprise | Accordée pour **afficher** une publication, pas pour collecter des auteurs : la demande doit présenter un vrai affichage intégré. Erreur code 10 tant que non approuvée |
| **TikTok oEmbed** | Auteur d'une vidéo dont on a l'URL | Public, sans jeton | Ne permet aucune découverte |
| **Sites web** | Email, réseaux, description, prix | Lecture HTTP simple | Voir § 5.2 : pages de 1 à 4 Mo, pied de page en fin de document, protections anti-robot |
| **Registres d'entreprises** (Sirene, Pappers) | Taille, secteur, dirigeant | API gratuites ou peu chères | Non branché dans le prototype : apport faible sans email |
| **Moteur de recherche par API** (Brave, Serper) | Retrouver le site officiel d'une marque à partir de son nom | Payant, quelques euros pour mille requêtes | À brancher : 10 % des marques du prototype n'avaient aucun site connu |

### 3.2 Sans API : uniquement par le navigateur de l'utilisateur

| Besoin | Où | Remarque |
|---|---|---|
| Découverte de créateurs TikTok | pages de hashtags et profils | Aucune API de découverte, pour personne |
| Email Instagram | bouton « E-mail » du profil, bio, lien de bio | Invisible sans session connectée |
| Auteur d'une publication Instagram trouvée par hashtag | la publication elle-même | Contourne l'attente d'oEmbed |
| Marques et décideurs LinkedIn | pages entreprise, recherche | Réseau le plus agressif contre l'automatisation |
| Bibliothèque publicitaire Meta sans identité vérifiée | facebook.com/ads/library | Consultable par tous dans un navigateur |

### 3.3 Rendements mesurés sur le prototype (septembre 2026)

| Étape | Résultat |
|---|---|
| YouTube, recherche par mots-clés | 60 nouveaux créateurs par nuit, 20 à 25 % avec email |
| Publications Instagram par hashtag, complétées dans le navigateur | 27 emails sur 30 publications : **meilleure source** |
| Marques de la bibliothèque publicitaire, email cherché sur leur site | 67 emails sur 100 marques |
| Profils Instagram ou TikTok de créateurs « sans email », lus dans le navigateur | 11 emails sur 45 |
| Chaînes YouTube sans aucun réseau, recherche du même pseudo sur Instagram | 1 sur 28 : **à abandonner** |
| Qualification IA | environ 20 % écartés (coachs et formateurs UGC, agences, hors sujet) |

---

## 4. Architecture cible

```
┌────────────────────────┐      tâches      ┌─────────────────────────────┐
│  Application web       │◄────────────────►│  Serveur (API + ordonnanceur)│
│  (cibles, files,       │    résultats     │  - sources par API           │
│   messages, réponses)  │                  │  - enrichissement web        │
└────────────────────────┘                  │  - qualification IA          │
                                            │  - déduplication, exclusion  │
┌────────────────────────┐   file de tâches │  - connecteurs d'envoi       │
│  Extension Chrome      │◄────────────────►│  - base de données           │
│  (navigateur et session│   résultats JSON └─────────────────────────────┘
│   de l'utilisateur)    │
└────────────────────────┘
```

### 4.1 Serveur

- Pile du prototype, à reprendre sauf raison contraire : Node 22 en modules ES, Express, MongoDB avec Mongoose, validation Joi, journalisation,
  IA par fournisseur interchangeable (sortie JSON contrainte par schéma, avec lecture tolérante en repli).
- **Ordonnanceur** : une exécution par cible et par jour, plafond de nouveaux prospects, **parts réservées par source** (sinon la source la plus
  abondante remplit tout ; ordre : sources rares d'abord, source abondante en dernier avec le reliquat).
- **Journal d'exécution** par lancement : créé au démarrage, complété à la fin ; l'interface doit afficher « en cours » puis « interrompue »
  après une heure sans fin (redémarrage du serveur), jamais des zéros trompeurs.
- Multi-locataire dès le départ : chaque document porte un `workspaceId`.

### 4.2 Extension Chrome (la pièce nouvelle)

- **Manifest V3**, service worker, permissions d'hôte limitées aux sites utiles (`instagram.com`, `tiktok.com`, `linkedin.com`, `facebook.com`,
  `youtube.com`), à justifier une par une dans la fiche du Chrome Web Store.
- **Protocole** : l'extension s'authentifie auprès du serveur (jeton de l'espace de travail), demande une tâche (`GET /tasks/next`), l'exécute,
  renvoie le résultat (`POST /tasks/{id}/result`). Pas de WebSocket nécessaire au début : interrogation toutes les 20 à 30 secondes quand
  l'utilisateur a lancé une session.
- **Types de tâches** : `read_profile` (bio, email, lien de bio, audience), `read_post_author`, `list_hashtag` (N publications récentes),
  `list_ad_library` (annonceurs pour un mot-clé), `read_company_page`, `prefill_message` (ouvre la messagerie et colle le texte, **s'arrête là**).
- **Lecture des pages** : extraire le texte visible et les liens de l'onglet, puis envoyer ce contenu réduit au serveur, qui demande à l'IA un
  JSON strict. Ne pas dépendre de sélecteurs CSS : c'est ce qui rend l'outil résistant aux refontes. Prévoir un cache par URL.
- **Garde-fous non négociables, codés dans l'extension** : 5 à 10 secondes aléatoires entre deux pages ; plafond par session (60 profils,
  100 annonceurs) et par jour ; aucune action d'engagement (like, abonnement, commentaire, message envoyé) ; arrêt immédiat sur captcha, page de
  connexion ou message de restriction, avec remontée à l'utilisateur ; bouton Pause visible ; onglet dédié que l'utilisateur voit travailler.
- **Transparence** : l'utilisateur voit la file, ce qui est lu et ce qui est envoyé au serveur. Aucune lecture hors des tâches demandées.

### 4.3 Application web

Écran éprouvé à reprendre : une **file quotidienne de contact manuel** (un prospect à la fois, message copié à l'ouverture du profil, « contacté, suivant », « passer » avec retour à 7 jours, objectif quotidien plafonné), qui rend le message privé praticable sans l'automatiser. Écrans minimaux : définition d'une **cible** (texte libre traduit par l'IA en mots-clés, hashtags et critères) ; **files** par statut ; fiche
prospect avec sources, réseaux, score, signaux, message et paragraphe ; **tableau « où sont mes prospects »** (une seule case par prospect, la
somme donne le total) ; boîte de réponses ; réglages (sources, plafonds, connecteurs). Règles d'ergonomie éprouvées : infobulle sur chaque
bouton, onglet conservé dans l'adresse, filtres conservés au rafraîchissement, messages d'import en clair.

---

## 5. Algorithmes éprouvés (à reprendre tels quels)

### 5.1 Extraction des réseaux sociaux

- Motifs par réseau, **profils uniquement** : ignorer `/p/`, `/reel/`, `/explore/`, `/share/`, boutons de partage Facebook, `/watch`.
- Reconnaître aussi les pseudos écrits dans une bio : `TikTok : @pseudo`, `insta @pseudo`. Retirer le point final collé au pseudo.
- Normaliser : `https://www.instagram.com/pseudo/`, `https://www.tiktok.com/@pseudo`, `https://www.youtube.com/@pseudo`.
- Comparer sans tenir compte de la casse ni de la barre finale.

### 5.2 Email et réseaux depuis un site web

1. Lire la page d'accueil **jusqu'à 6 Mo** : les boutiques en ligne font 1 à 4 Mo et le pied de page (contact, mentions légales) est à la fin.
   Une limite à 400 Ko donnait zéro résultat sur Shopify.
2. `mailto:` en priorité, puis emails dans le texte (décoder `[at]`, `(at)`, `&#64;`). Écarter `noreply`, `privacy@`, `dpo@`, `abuse@`, images,
   domaines techniques (sentry, wixpress).
3. Suivre au plus 4 pages du même domaine dont le chemin contient contact, mentions, legal, about, a-propos, collab, partenariat, presse.
4. Si aucun lien n'est repéré (menu en JavaScript) : essayer `/policies/legal-notice`, `/policies/contact-information`, `/pages/contact`,
   `/contact`, `/mentions-legales`, `/pages/mentions-legales`.
5. Préférence d'adresse : nominative, puis collab ou partenariat, puis contact ou hello. Pour un créateur, une adresse générique ne part pas
   automatiquement ; pour une marque, elle est acceptée.
6. Reconnaître un **site écrit sans `https://`** (« respire.co », « www.cabaia.fr ») dans un texte, en excluant réseaux sociaux, messageries et
   places de marché. Ce seul point a fait passer le prototype de 0 à 67 emails sur 100 marques.
7. Rendement réaliste : un site sur trois à deux sur trois donne un email ; les autres n'ont qu'un formulaire.

### 5.3 Lecture d'une fiche produit (utile pour qualifier une marque)

JSON-LD `Product` (nom, marque, description, prix, image), puis Open Graph, puis balises meta, puis texte. Statuts explicites : 404, 403 ou
redirections en boucle (« protection anti-robot » : DataDome, Akamai), délai. Toujours offrir une saisie manuelle en repli.
**Anti-SSRF obligatoire** dès qu'une URL vient d'un utilisateur : protocole http(s), résolution DNS, refus des plages privées.

### 5.4 Déduplication, mémoire et exclusion

- Identité d'un prospect : `source + identifiant externe`, puis email, puis profils normalisés. Un même créateur vu par deux publications ou deux
  comptes avec le même email : **une seule fiche reste active**, l'autre est marquée doublon.
- Une ligne importée qui correspond à une fiche existante **la complète** (email, bio, audience, réseaux) au lieu d'être rejetée.
- **Mémoire de 30 jours** par prospect et par type de recherche (email, réseaux, remise à l'extension) : jamais deux fois la même visite.
- **Liste d'exclusion** : à la suppression, ne garder que des empreintes SHA-256 (email, profils, identifiant source). Un prospect supprimé n'est
  plus jamais recollecté ni réimporté. Purge automatique après 24 mois sans activité.

### 5.5 Qualification par IA

- Une seule fois par prospect, à la création ; requalification seulement sur demande ou quand la fiche est enrichie.
- Entrée : nom, pseudo, audience, pays, description tronquée à 1 500 caractères, mot-clé d'origine, contexte de la cible.
- Sortie JSON stricte : `niche`, `fit` (0 à 100), `signals` (1 à 4 constats factuels), `summary`, `firstName` (seulement s'il apparaît),
  `message` (300 caractères, sans lien ni emoji, cite un élément concret), `emailParagraph` (deux phrases).
- Règles apprises : exclure explicitement coachs, formateurs et agences ; couper le message à une fin de phrase ; lecture tolérante du JSON
  (premier objet complet, accolades appariées) ; **ne jamais utiliser un pseudo comme prénom** (« Bonjour ugcbymarie, »), fournir un champ
  `greeting` prêt à l'emploi.

### 5.6 Import de listes (repli universel, à conserver même avec l'extension)

Une ligne par prospect, séparateurs `;`, tabulation ou `|`, colonnes libres. L'email et les liens sont reconnus où qu'ils soient. Une ligne qui
commence par un lien et dont le premier texte ressemble à une bio (plus de quatre mots, `/`, `&`, chiffres, mots « UGC », « créatrice »…) n'a pas
de colonne nom : le nom devient le pseudo et tout le texte reste la bio. Lecture du nombre d'abonnés (« 1 416 abonnés », « 9,1 k »).
Message de résultat en clair : lignes lues, nouveaux, fiches complétées (dont nouveaux emails), fiches connues sans rien de nouveau, vraies
lignes en double, exclues, illisibles. Le mot « doublon » seul a induit l'utilisateur en erreur.

---

## 6. Modèle de données (point de départ)

```
Workspace   { name, plan, settings, connectors }
Target      { workspaceId, kind: person|company, description, keywords[], hashtags[], criteria, dailyLimit, sourceShares }
Prospect    { workspaceId, targetId, kind, source, externalId, name, handle, firstName, url, website, country, language,
              description, email, emailSource, socials{instagram,tiktok,youtube,linkedin,facebook}, stats{subscribers,videos,views,ads,likes},
              keyword, niche, score, signals[], aiSummary, message, emailParagraph,
              status: new|qualified|to_contact|contacted|replied|converted|rejected|excluded,
              enrich{emailSearchedAt,socialsSearchedAt,handedToExtensionAt,noSite},
              outreach{provider,listId,pushedAt,replyAt,replyText,replyIntent,replySuggestion,bounced,unsubscribedAt},
              notes, runId, timestamps }
Run         { workspaceId, targetId, startedAt, finishedAt, trigger, sources{searched,found,new,withEmail,errors}, qualified, issues[] }
Task        { workspaceId, type, payload, status: queued|running|done|failed|blocked, result, attempts, prospectId, timestamps }
Suppression { workspaceId, hash, type: email|profile }
```

Index : `(workspaceId, source, externalId)` unique ; `email` ; `socials.*` ; `status`. Ne pas nommer un champ `errors` dans Mongoose (réservé).

---

## 7. Connecteurs d'envoi

Couche interchangeable, comme dans le prototype (`MAILING_PROVIDER`). Interface minimale : `verify`, `ensureList`, `pushContacts` (champs en
snake_case, 500 par appel), `blocklist`, `replies`, `stats`, `removeFromSequences`, `reply`.

- **SalesBlink**, déjà branché : base `https://run.salesblink.io/api/public/v1.0.0`, en-tête `Authorization: <clé>` ; `/lists`, `/contacts`,
  `/unsubscribe`, `/replies`, `/analytics/lead-stats`, `/sequences/{id}/leads/{leadId}/unsubscribe`, `/inbox/{messageId}/reply`.
  **Piège** : les contacts arrivent dans la liste, mais rien ne part tant qu'une séquence n'y est pas rattachée.
- À prévoir : lemlist, Brevo, ou envoi direct par boîte connectée (Gmail, Outlook) pour les petits volumes.
- **Infrastructure d'envoi, apprise sur le prototype** : envoyer depuis un **domaine distinct** du domaine de service (ici `needcreator.net` pour
  la prospection, `needcreator.com` pour les emails transactionnels), afin qu'une mauvaise réputation de prospection ne touche ni les
  confirmations d'inscription ni les factures. SPF, DKIM et DMARC sur ce domaine ; un sous-domaine de suivi en CNAME vers l'outil. Le domaine
  d'envoi doit mener à un vrai site : une redirection **visible et permanente (301)** vers le site principal, jamais une page « en
  construction » ni une redirection « invisible » par cadre (signal de domaine jetable). La règle de volume vaut **par adresse** : 20 à 30
  emails par jour, après deux à trois semaines de chauffe ; démarrer à 10 à 15. Multiplier les adresses n'aide que si le stock de prospects
  suit : sur le prototype, la limite est le nombre de prospects, pas la capacité d'envoi. L'outil devra afficher ce diagnostic à l'utilisateur.
  **Âge du domaine** : constaté le 20/09/2026, un domaine de 5 jours parfaitement configuré (SPF, DKIM et DMARC en PASS, 9,6 sur 10 à mail-tester,
  aucune liste noire) arrive en indésirables chez Gmail et Outlook ; seule pénalité relevée : `FROM_FMBLA_NEWDOM` (domaine enregistré depuis moins
  de 7 jours). Règle à intégrer à l'outil : acheter le domaine d'envoi et lancer la chauffe **un mois avant** le premier email, refuser ou
  avertir si le domaine a moins de 30 jours, et proposer un test de délivrabilité avant tout lancement.
- Garde-fous : plafond quotidien, score minimum, pause automatique au-delà de 5 % de rebonds sur 7 jours, retrait de la séquence dès qu'un
  prospect répond, se désinscrit ou se convertit.
- **Promesse tenue automatiquement** : quand la séquence promet quelque chose sur simple réponse (ici un brief offert), le livrable est généré dès que la réponse est classée « intéressé » et joint à la réponse proposée, avec un lien d'inscription qui reprend le livrable. Une seule génération par prospect, action manuelle de secours, repli propre si la source est illisible.
- Réponses : classement IA (intéressé, question, pas maintenant, refus, ne plus écrire, absence), réponse proposée, envoi dans le même fil
  après relecture ; réponse automatique réservée aux « intéressés », et désactivée par défaut.

---

## 8. Conformité : ce qui change par rapport au prototype

- **Rôle RGPD.** Dans NeedCreator, l'éditeur prospecte pour son propre compte (responsable de traitement, intérêt légitime). Vendu à des tiers,
  l'outil fait de l'éditeur un **sous-traitant** : contrat de sous-traitance, registre, mesures de sécurité, assistance aux demandes des
  personnes, localisation des données. Chaque client reste responsable de sa base légale et de ses envois.
- **Multi-pays** : le RGPD reste la règle la plus exigeante, s'y conformer couvre l'Union européenne. Les États-Unis sont plus permissifs pour
  l'email B2B (CAN-SPAM : désinscription et adresse postale), le Canada l'est moins (LCAP : consentement ou relation d'affaires). Les mentions
  de pied d'email doivent dépendre du pays du prospect ; chaque client reste responsable de sa base légale.
- **Prospection par email en France** : entre professionnels, sans consentement préalable si le message est en rapport avec la fonction ; vers un
  particulier, consentement requis. Un créateur individuel est une zone grise : adresse professionnelle publique, message en rapport avec son
  activité, désinscription en un clic, mention de l'origine de l'adresse. Ces mentions figurent dans chaque modèle d'email.
- **Conditions d'utilisation des plateformes** : la lecture automatisée est interdite par Meta, TikTok et LinkedIn, même à petit volume et dans
  la session de l'utilisateur. Le risque pratique est faible à vitesse humaine, mais réel ; l'utilisateur le porte, l'éditeur porte la
  réputation. À écrire noir sur blanc dans les conditions de l'outil.
- **Chrome Web Store** : revue longue pour les permissions d'hôte larges, retrait possible sans préavis. Prévoir une distribution alternative
  (installation par fichier pour les clients professionnels) et un fonctionnement dégradé sans extension (sources API plus import).
- **Politique de confidentialité** publique : lister précisément les données lues par source, l'usage, la durée (24 mois), l'absence de
  revente, et une procédure de suppression avec ou sans compte. Exigé aussi par la revue d'application Meta.

---

## 9. Périmètre par étapes

| Étape | Contenu | Critère de sortie |
|---|---|---|
| **0. Preuve** (en cours) | Prospection NeedCreator avec l'assistant Chrome de Claude et l'import groupé | Taux de réponse et d'inscription mesurés sur 2 à 3 mois |
| **1. Extension interne** | Extension et file de tâches, branchées sur NeedCreator ; types `read_post_author`, `read_profile`, `list_ad_library` | Les deux routines hebdomadaires se font sans copier-coller |

**Décision du 23/09/2026 : l'étape 1 se construit dans le dépôt NeedCreator**, pas dans un projet séparé (qui aurait exigé de recréer prospects,
qualification, mailing et écrans avant la première ligne utile). Impacts acceptés : code en plus dans le dépôt (dossier `extension/`, un modèle et
des routes de tâches), une porte d'entrée de plus sur le serveur de production (réservée aux administrateurs, à écrire avec soin), un peu de charge
IA, et une migration d'une journée le jour du projet séparé. Trois conditions à tenir : 1) tout ce qui touche à l'extension est **isolé** (dossier,
modèle, routes à part, rien mélangé aux fonctions existantes) ; 2) **rien de spécifique à NeedCreator dans l'extension**, pour que le déplacement
soit un copier-coller ; 3) la **suite de tests couvre la file de tâches**. À la fin de l'étape 1, décision explicite : outil interne ou projet séparé.
Le produit final aura son propre dépôt (serveur, application web et extension en trois sous-dossiers), sa base, son domaine ; NeedCreator y sera un
client par API.
| **2. Socle autonome** | Dépôt séparé, multi-locataire, cibles en langage courant, sources API, import, qualification, files, tableau de répartition | Un utilisateur externe obtient 100 prospects qualifiés en une heure |
| **3. Envoi et réponses** | Connecteurs, garde-fous, boîte de réponses | Une campagne complète menée dans l'outil |
| **4. Produit** | Comptes, facturation, quotas IA, pages légales, fiche du Web Store | Premier client payant |

Ordre de grandeur : étape 1, trois à cinq semaines ; étapes 2 à 4, deux à trois mois. Coûts variables : IA (quelques centimes par prospect
qualifié, davantage si l'IA lit des pages entières), moteur de recherche par API, hébergement.

---

## 10. Pièges rencontrés, à relire avant de coder

1. Un champ de modèle nommé `errors` casse Mongoose.
2. Une limite de lecture de page trop basse donne des résultats vides sans aucune erreur. Toujours vérifier la taille réelle des pages cibles.
3. `me/accounts` de Meta peut omettre une page accessible : prévoir la lecture par identifiant.
4. Un jeton Meta déjà émis ne voit pas les pages ajoutées après coup ; retirer l'autorisation de l'application force Facebook à reposer la
   question des pages. Choisir « tous les éléments actuels et futurs ».
5. Un compte Facebook récent échoue aux vérifications d'identité et d'entreprise : laisser le compte vieillir, un seul essai propre.
6. La source la plus abondante affame les autres si le plafond n'est pas réparti.
7. Un script de maintenance qui supprime « le lot X » doit refuser un identifiant vide : un lot indéfini a effacé des données réelles pendant
   le développement du prototype. Toute suppression groupée exige un identifiant au format attendu.
8. Les tests de bout en bout doivent servir de fausses pages en local (variable d'environnement qui autorise les adresses privées, uniquement
   en test) pour ne dépendre ni d'Internet ni des sites tiers.
9. Un serveur de test oublié sur le port fait tourner les tests contre l'ancien code : vérifier le processus à l'écoute avant de conclure.
10. Les messages d'interface ambigus coûtent plus cher que le code : « doublon », des zéros dans un journal en cours, un bouton sans infobulle
    ont chacun provoqué une incompréhension. Rédiger chaque message pour quelqu'un qui n'a pas vu le code.
11. DuckDuckGo bloque à la deuxième requête automatisée ; DataDome et Akamai bloquent toute lecture serveur des grandes enseignes.
12. Retrouver un compte Instagram à partir d'un nom de chaîne YouTube ne fonctionne pas (1 sur 28).
13. Chez OVH, une redirection web se compose de deux pièces indissociables : l'entrée « redirection visible permanente » (TXT `4|cible`) et
    l'entrée A vers `213.186.33.5`. Supprimer l'entrée A rend le domaine muet. L'espace client affiche des erreurs de suppression alors que
    l'opération a réussi : vérifier l'état réel en interrogeant les serveurs de noms faisant autorité, pas l'interface. La redirection gratuite
    ne répond qu'en http.
14. Un serveur protégé par un pare-feu « Cloudflare uniquement » ne peut pas recevoir un second domaine géré hors de Cloudflare : ni le trafic
    ni la validation du certificat ne passent. Ne pas ajouter un tel domaine à la configuration du serveur : la demande de certificat échouerait
    pour tous les domaines.

---

## 11. Consignes déjà rodées (à transformer en types de tâches de l'extension)

Les consignes textuelles utilisées avec l'assistant Chrome de Claude, et leurs formats de sortie, sont dans `docs/AGENT-CHROME.md`
(bibliothèque publicitaire, auteurs de publications Instagram, profils sans email, chaînes YouTube, TikTok par hashtags, LinkedIn, messages
assistés). La routine hebdomadaire et six semaines de mots-clés pour les marques sont dans `docs/AIDE-MEMOIRE-PROSPECTION.md`.
Les séquences d'emails (créateurs et marques, trois emails chacune) sont dans `docs/MAILING-prospection.md`.

---

## 12. Code de référence dans NeedCreator

Environ 1 300 lignes côté serveur, réutilisables presque telles quelles :

| Fichier | Rôle |
|---|---|
| `backend/src/services/acquisition/index.js` | Exécution, répartition du plafond, déduplication à la création, qualification, purge, état du jeton |
| `backend/src/services/acquisition/youtube.js` | Recherche de chaînes, rubrique « Liens » par la page « À propos » |
| `backend/src/services/acquisition/instagram.js` | Compte relié (par liste ou par identifiant de page), hashtags, paliers de taille, oEmbed |
| `backend/src/services/acquisition/meta.js` | Bibliothèque publicitaire, arrêt sur erreur de permission |
| `backend/src/services/acquisition/enrich.js` | Emails, réseaux, site sans `https://`, lecture de sites, enrichissement d'une fiche |
| `backend/src/services/acquisition/importLeads.js` | Lecture de listes collées, complétion des fiches, doublons d'un même créateur |
| `backend/src/services/acquisition/qualify.js` | Consignes et schémas de qualification |
| `backend/src/services/acquisition/outreach.js` | Envoi vers l'outil de mailing, synchronisation, réponses, tableau de répartition |
| `backend/src/services/acquisition/replies.js` | Classement des réponses, brouillon de campagne à l'inscription |
| `backend/src/services/mailing/` | Couche interchangeable : SalesBlink et faux fournisseur de test |
| `backend/src/services/embeds.js` | Reconnaissance d'URL de publications, oEmbed Meta, TikTok, YouTube |
| `backend/src/services/productBrief.js` | Lecture de fiche produit, garde anti-SSRF, statuts explicites |
| `backend/src/models/Lead.js`, `LeadSuppression.js` | Modèles prospect, exécution, liste d'exclusion |
| `backend/src/controllers/acquisition.js` | Routes d'administration : files, import, passes groupées, lots pour l'assistant, décompte |
| `frontend/src/components/admin/AcquisitionTool.tsx` | Interface complète de référence |
| `backend/scripts/e2e-test.js` (étape « Prospection ») | Scénarios de test à reprendre |

---

## 13. Journal des évolutions

| Date | Évolution |
|---|---|
| 15/09/2026 | Prototype dans NeedCreator : YouTube, bibliothèque Meta, qualification IA, files, export CSV |
| 16/09/2026 | Hashtags Instagram par l'API officielle ; couche de mailing interchangeable (SalesBlink) ; réponses classées par IA ; entonnoirs |
| 17/09/2026 | Réseaux des prospects (bio, rubrique « Liens » YouTube, lien de bio, site) ; import groupé ; consignes pour l'assistant Chrome ; décision : pas de scrapers serveur ni d'extension agentique pour l'audit publicitaire |
| 18/09/2026 | Liste d'exclusion par empreintes, purge à 24 mois, politique de confidentialité détaillée ; affichage intégré des publications (condition de la revue oEmbed) ; répartition du plafond entre sources ; recherche d'email sur les sites ; mémoire de 30 jours |
| 19/09/2026 | Site sans `https://` reconnu (0 → 67 emails sur 100 marques) ; complétion des fiches par publication, par profil et par chaîne ; doublons d'un même créateur ; tableau « où sont les prospects » ; messages d'import en clair ; prénom sûr et champ `greeting` ; séquences d'emails ; **idée de l'outil autonome cadrée, ce document créé** |
| 20/09/2026 | Domaine d'envoi distinct vérifié (SPF, DKIM, DMARC, redirection 301 vers le site) ; **les deux séquences d'emails sont lancées** sur 88 créateurs et 63 marques : début de l'étape 0 « Preuve », mesures attendues sous une semaine (envois, rebonds, réponses, inscriptions) |
| 20/09/2026 | Premier rendement réel : **4 inscriptions de créateurs sur 38 emails** (prospects Instagram par hashtag, complétés dans le navigateur) contre 0 résultat sur 432 emails d'une liste extérieure non triée, arrêtée ; l'outil de mailing n'affiche que les réponses rattachées à un contact de campagne : prévoir une redirection des boîtes d'envoi vers une boîte lue ; brief offert généré automatiquement à la réponse positive d'une marque |
| 20/09/2026 | Délivrabilité : emails en indésirables chez Gmail et Outlook malgré une configuration parfaite ; cause unique, l'âge du domaine (créé le 12/09) ; volume réduit à 3 par jour et par adresse avec chauffe, reprise visée mi-octobre ; le message privé manuel prend le relais entre-temps |
| 20/09/2026 | File « À contacter aujourd'hui » : messages privés à la main, un prospect à la fois, 15 par jour, sans email d'abord ; devient le canal principal pendant la maturation du domaine d'envoi |
| 22/09/2026 | Portée élargie et décidée : projet à part entière, anglais par défaut, multi-pays par conception, vendu d'abord aux plateformes UGC et agences d'influence puis aux agences de publicité, y compris aux concurrents de NeedCreator ; produit d'entrée envisagé « nouvelles publicités vidéo par secteur et pays » ; vidéos iPhone (HEVC) réencodées en H.264 dans NeedCreator, sans lien avec l'outil mais à retenir pour tout traitement de médias |
| 23/09/2026 | Décision : l'étape 1 (extension et file de tâches) se construit dans le dépôt NeedCreator, sous trois conditions d'isolement ; le projet séparé viendra après. Messages Instagram aux marques commencés à la main avec les textes de l'admin : prochaine amélioration, consigne IA plus courte orientée réponse et fiche de réponses par objection |
