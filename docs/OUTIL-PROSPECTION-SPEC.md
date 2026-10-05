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
| Accès à la bibliothèque publicitaire pour un client | Deux chemins : **par défaut, l'extension lit le site public de la bibliothèque** dans le navigateur du client (aucun jeton, aucune vérification d'identité, résultats en dix minutes) ; **en option « volume », l'API Meta** avec un bouton « Connecter Meta » (connexion Facebook, jeton conservé et renouvelé par l'outil), la vérification d'identité de la personne restant à sa charge, guidée pas à pas et détectée par l'outil. Proposer l'API seulement après les premiers résultats | La configuration Meta est lourde (application, jeton, identité) : la valeur d'abord, l'effort ensuite. Décidé le 24/09/2026, à confirmer à l'étape 2 |
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
| **1. Extension interne** (livrée en versions successives du 23 au 26/09/2026) | Extension et file de tâches, branchées sur NeedCreator ; types `read_post_author`, `read_profile`, `list_hashtag`, `list_ad_library`, `prefill_message` (rôle « messages »), `read_post_brands` (marques taguées dans les publications de partenariat), `list_tiktok_ads` (TikTok Creative Center) | Les deux routines hebdomadaires se font sans copier-coller |

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
| `backend/src/services/browserTasks.js`, `models/BrowserTask.js`, `controllers/browserTasks.js`, `routes/browserTasks.js` | File de tâches de l'extension : lots, remise, lecture des résultats (auteur, profil, annonceurs, publications), tâches filles, réinjection par l'import groupé (lignes structurées) |
| `extension/` | Extension Chrome générique (Manifest V3) : boucle de tâches, extraction de page, garde-fous, fenêtre et options. Copier-coller vers le projet séparé |
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
| 23/09/2026 | **Étape 1 livrée en première version** : file de tâches côté serveur (isolée : un modèle, un service, un contrôleur, des routes ; jeton dédié ; couverte par la suite de tests) et extension Chrome générique dans `extension/` (rien de NeedCreator dedans ; le serveur est une adresse et un jeton dans ses options). Protocole retenu : l'extension renvoie la page réduite (titre, texte visible, liens, signal de blocage), le serveur en tire le prospect (règles déterministes d'abord, IA pour la bio et les annonceurs). Enseignements du premier test réel (Chrome sans interface, chaîne YouTube publique) : 1) les permissions d'hôte doivent couvrir les sous-domaines (`consent.youtube.com`) ; 2) une page de consentement aux cookies est un motif d'arrêt à part ; 3) les pages à chargement différé exigent d'attendre que le texte soit là (jusqu'à 10 s) ; 4) une page 404 ne doit pas compter comme « fiche connue » ; 5) l'appel du serveur depuis l'extension passe par une permission d'hôte optionnelle demandée à l'enregistrement des options, avec en repli l'acceptation de l'origine `chrome-extension://` sur les seules routes de la file. Reste pour clore l'étape 1 : `prefill_message`, test sur Instagram et la bibliothèque Meta avec un vrai profil Chrome et un compte secondaire, puis mesure sur les deux routines hebdomadaires. |
| 24/09/2026 | Premier passage réel sur Instagram (60 pages) : **tous les auteurs lus étaient le compte connecté**, dont le lien de profil (menu latéral) est le premier de la page. Correction : l'extension remonte la description de la page (« 12 likes, 3 comments - pseudo on … ») et le compte connecté ; le serveur lit l'auteur dans la description, puis le titre, puis un lien dont le texte est le pseudo, en écartant toujours le compte connecté ; sans certitude, aucun auteur plutôt qu'un mauvais. Script de réparation `backend/scripts/repair-lead-author.mjs <pseudo>`. Leçon pour le produit : toute lecture doit connaître l'identité du compte qui navigue et l'exclure des résultats. |
| 24/09/2026 | Deuxième passage (60 pages) : auteurs corrects sauf « popular » (page interne d'Instagram prise pour un profil, six fois) et 12 « auteur introuvable » sur 60. Corrections : liste des chemins réservés d'Instagram étendue ; un lien de profil est aussi accepté si son pseudo est cité dans le texte de la page ; le message d'échec indique titre, quantité de texte et liens lus, pour diagnostiquer le prochain passage. Un lot de 60 publications demande deux sessions (auteur puis profil) : cliquer Start une seconde fois. |
| 25/09/2026 | Recherche de marques par API opérationnelle : 2 recherches, 200 marques, 75 emails (52 % au second passage), environ 25 min par recherche depuis que l'email n'est cherché que pour les marques retenues. **Incident** : quand sa file était vide, l'extension interrogeait le serveur toutes les demi-secondes ; le plafond global par adresse IP (300 requêtes par 15 min en production) a bloqué le PC du propriétaire pour toute l'application (connexion refusée, 429). Corrections : attente sur alarme quand la file est vide (0.1.1) ; routes de l'extension exclues du plafond global, avec leur propre plafond. Règle pour le produit : une extension a toujours son propre quota, jamais celui du navigateur de l'utilisateur, et un client bloqué doit voir un message clair plutôt qu'une déconnexion. |
| 25/09/2026 | Extension, bilan de deux lots : 71 fiches complétées, 10 emails sur 49 profils lus (20 %), contre 27 sur 30 avec l'assistant Claude. Écart : l'email Instagram est souvent derrière le bouton « E-mail » ou dans le lien de bio, pas dans le texte visible. L'extension remonte désormais les emails présents dans le code de la page (0.1.2), le serveur les prend en repli ; le lien de bio est déjà visité côté serveur. Réseaux des marques relevés sur leur site : 93 sur 414 prospects visités. Lots : recomptage depuis les tâches à chaque affichage, tâches à bout de tentatives en échec, colonne emails juste. |
| 26/09/2026 | `prefill_message` livré (0.2.0) avec la notion de **rôle** par installation : « lecture » sur le compte secondaire, « messages » sur le compte principal, la file ne donnant à chacun que ses tâches (`GET /ext/next?types=`). La préparation ouvre la conversation et colle le texte, l'envoi reste humain ; bouton « Préparer dans Chrome » dans la file du jour. Règle pour le produit : une installation d'extension = un compte = un rôle, jamais les deux. Reste : test réel sur Instagram (sélecteurs du bouton « Message » et de l'éditeur). Message d'ouverture aux marques resserré après les premières réponses : un détail, formulation au positif, question finale neutre (« Qui s'occupe de vos vidéos publicitaires, et à quelle adresse puis-je lui écrire ? »), question rétablie si l'IA la coupe. |
| 26/09/2026 | Deux sources de marques ajoutées à l'extension : **marques taguées par les créateurs** (hashtags de partenariat ; la marque en « partenariat rémunéré » ou citée dans la légende devient un prospect, jamais l'auteur ; site et publicités cherchés côté serveur dans la bibliothèque Meta par le nom, pour ne pas ouvrir une page de plus) et **TikTok Creative Center** (page publique, annonceurs par liens de profils et IA). Sources de marques recensées, par intérêt : marques taguées (achètent déjà de l'UGC), bibliothèque Meta, TikTok Creative Center, Google Ads Transparency (vérification, pas recherche), bibliothèque LinkedIn (B2B). LinkedIn : jamais de recherche automatisée ; usage prévu à l'étape 2 pour trouver la bonne personne dans une marque déjà connue (`read_company_page`), à très petit volume. |
| 28/09/2026 | **Mini-audit de la publicité** : à la qualification, l'IA rédige trois accroches de créateur pour le produit de la marque (problème vécu, promesse, curiosité) d'après le texte de son annonce ; la meilleure ouvre le message privé, les trois forment le paragraphe de l'email d'ouverture, la question finale demande l'adresse pour envoyer les deux autres. Réécriture nocturne des fiches anciennes, 50 par jour. Constat qui motive ce choix : les marques sont sursollicitées par les créateurs ; ce qui sort du tas arrive avec la valeur déjà faite. Suite prévue : vidéo vitrine (créateurs qui tournent avant la demande, achat par devis client), puis lecture des pages LinkedIn pour joindre la bonne personne. |
| 28/09/2026 | **Vidéo vitrine** livrée : un créateur tourne une vidéo pour un produit qu'il possède d'une marque prospectée ; devis client créé d'office, page publique avec aperçu filigrané, achat en un clic, vidéo livrée à l'acceptation ; l'admin propose la vidéo depuis la file du jour (email ou message privé). C'est le message que les marques sursollicitées ouvrent : la valeur est déjà faite. À suivre : taux d'ouverture de la page (`viewedAt`) et d'achat. |
| 28/09/2026 | **La bonne personne** : lot « contacts LinkedIn » (recherche de la page entreprise, personnes marketing, email déduit du format de la marque), plafond serveur de 20 pages LinkedIn par jour, message LinkedIn préparé par le rôle Messenger vers la personne. Règle : jamais de recherche LinkedIn côté serveur, compte secondaire neuf, volume minimal. Les trois leviers contre la sursollicitation sont en place : mini-audit (accroches), vidéo vitrine, bonne personne. |
| 29/09/2026 | Premiers passages réels des lots « marques taguées » et « contacts LinkedIn » : deux défauts de qualité. 1) Les comptes cités dans les commentaires et les concours (« tague tes amis ») étaient pris pour des marques : environ 140 fausses fiches. Correction : légende seulement (description de la page), trois comptes au plus, partenariat rémunéré prioritaire, et contrôle « est-ce une marque » après lecture du profil (catégorie, commerce, site, audience). 2) La recherche LinkedIn prenait le premier résultat : pages d'anciens ou d'une autre entreprise. Correction : le nom de la page doit correspondre à la marque. 3) Le « site » relevé sur un profil Instagram était un lien de Meta présent sur toutes les pages. Leçon pour le produit : toute source qui crée des prospects doit avoir un contrôle de nature (marque ou personne) avant l'entrée en base, et un script de nettoyage (`backend/scripts/clean-tagged-brands.mjs`). |
| 29/09/2026 | **Vidéo demandée (« oui vidéo »)** : la réponse de la marque est reconnue sans IA (email synchronisé ou message privé collé), le produit cité est relevé, une réponse est proposée (produit, délai de dix jours), les créateurs de la niche sont prévenus par notification et email (tous les créateurs actifs si la niche en compte moins de cinq). Suivi dans l'admin (« Vidéos demandées » : produit, créateurs prévenus, vidéos déposées, jour n sur 10), alerte à l'équipe à J+7, réponse de repli préparée à J+10 qui propose la campagne au produit offert, créée en brouillon à l'inscription. Deux boutons à compteur dans la rangée des filtres : « Vidéos à envoyer » et « Vidéos demandées ». |
| 29/09/2026 | **Marque suggérée par un créateur** : sur la page de candidature spontanée, « Ma marque n'est pas dans la liste » (nom, site ou Instagram, produit possédé). Doublons détectés par site, Instagram ou nom ; une marque déjà prospectée est proposée telle quelle. Taille en trois niveaux : accessible, grande (le créateur est prévenu et confirme), très grande (refus d'office). Indices : liste de marques toujours refusées, annonces actives sur Meta (seuils 50 et 300), connaissance de l'IA ; **le nombre d'abonnés n'est pas mesuré** (pas d'accès fiable) et les seuils sont des estimations, en réglages, à ajuster après un mois. Validation par l'équipe avant tout tournage ; la fiche est créée à la validation, qualifiée en arrière-plan, réservée dix jours au créateur ; trois suggestions en attente au plus par créateur. Bouton à compteur « Marques suggérées » dans l'admin. |
| 29/09/2026 | **Adresse de contact Instagram** (extension 0.2.5) : sur un profil, l'extension lit l'adresse que le compte professionnel publie (le bouton « E-mail » de l'application mobile, absent de la page web). Aucun clic : lien `mailto` visible, sinon données de profil que le site charge pour la page (une requête de plus par profil, dans la session de l'onglet). L'adresse prime sur le texte de la bio ; source notée « bouton e-mail ». Désactivable dans les options. **Non vérifié sur Instagram réel** : testé sur une page simulée ; rendement et tolérance d'Instagram à mesurer sur le premier lot (avant : 10 emails sur 49 profils, 20 %). Relance du devis client livrée le même jour (rappels automatiques à J+4 et J+8, trois rappels au plus, jamais pour une candidature spontanée). |
| 29/09/2026 | Premier lot réel avec les hashtags légaux et l'extension 0.2.5 (35 pages, 8 marques, 2 emails) : trois constats. 1) **Lecture de l'adresse de contact refusée par Instagram** (« 429 ») : coupée par défaut en 0.2.6, un refus l'arrête pour la session ; piste abandonnée, les emails de marques passent par le site, LinkedIn et le message privé. 2) **Trois publications par hashtag**, soit la première rangée : l'onglet de l'extension est en arrière-plan et Instagram ne charge la suite qu'affichée ; en 0.2.6 l'onglet passe au premier plan pendant la lecture des listes puis rend la main, le défilement va jusqu'en bas, et le résultat porte le nombre de liens vus à chaque défilement. Vérifié sur une liste simulée dans un vrai navigateur (39 liens au lieu de 3) ; **l'effet sur Instagram reste à confirmer au prochain lot**. 3) **Trop de grandes marques** (Garnier, Printemps) : filtre de taille étendu aux marques taguées : liste des marques refusées ignorée avant toute lecture, plus de 500 000 abonnés écartée, plus de 100 000 gardée et signalée « grande marque » ; seuils en réglages. |
| 29/09/2026 | Extension 0.2.6 confirmée sur Instagram : **20 publications par hashtag au lieu de 3** (l'onglet affiché pendant la lecture des listes était bien la cause) ; trois hashtags donnent 60 publications et une vingtaine de profils, soit le plafond de 150 pages par jour. Lot LinkedIn du matin : 8 échecs « page introuvable » normaux (pseudos, personnes, petites marques sans page), mais 4 pages d'autres entreprises retenues avant le contrôle du nom (« hydros-alumni »). Corrections : 1) le nom est contrôlé **avant** la lecture, à chaque remise de tâche ; une page d'une autre entreprise est écartée sans coûter de page LinkedIn, l'identifiant de page étant rapproché de la marque malgré les lettres accentuées perdues (« kr-me » pour Krème) ; 2) le lot LinkedIn ne retient que de vraies marques : pas de pseudo ni de marque taguée dont le profil n'a pas été lu, pas de site qui soit un réseau social, pas de très grande marque ; un pseudo confirmé devient un nom à chercher (« wildrefill_fr » → « wildrefill »). |
| 29/09/2026 | File du jour : bouton **« Déjà contacté »**. Des marques réellement contactées revenaient dans la file, leur date de contact ayant été effacée par l'annulation du marquage en masse (une seule fiche par marque : pas de doublon). Le bouton passe la fiche en « Contacté » avec une date rétablie à sept jours plus tôt (la vraie est perdue), trace le geste dans la note et n'entre pas dans le décompte du jour. Préféré à une restauration automatique, qui n'aurait retrouvé que les messages préparés par l'extension. |
| 29/09/2026 | **Personnes prises pour des marques** dans la file du jour (« valette49 », score 80, aucune donnée). Trois causes : la fiche d'une marque taguée était qualifiée et proposée avant la lecture de son profil ; le contrôle « marque ou personne » acceptait tout compte de plus de 20 000 abonnés avec un lien en bio, soit le portrait d'un influenceur ; la consigne de l'IA affirmait « marque trouvée dans la bibliothèque Meta » quelle que soit l'origine. Corrections : 1) une marque taguée reste **en attente** (ni qualifiée, ni file du jour, ni mailing, ni LinkedIn) jusqu'à la lecture de son profil, puis elle est qualifiée avec sa bio, son site et ses abonnés ; les fiches en attente sans lecture prévue sont lues en tête du lot suivant ; 2) contrôle strict : il faut une catégorie de commerce ou un vocabulaire de vente avec un site à soi, les abonnés ne comptent plus, une page de liens n'est pas un site, un signe de personne écarte le profil ; 3) la consigne de l'IA dit d'où vient la fiche, l'IA peut répondre « ce n'est pas une marque » et ne note plus au-dessus de 30 sans information ; 4) profil introuvable sur Instagram : fiche écartée avec le motif ; 5) script `hold-unverified-tagged-brands.mjs` (simulation par défaut) qui remet en attente les fiches existantes, sans en écarter aucune. |
| 30/09/2026 | Marques suggérées par les créateurs : **Instagram obligatoire** (site et TikTok facultatifs), et **lecture du profil par l'extension avant validation** (lot « Marques suggérées » du jour, rôle lecture) : marque ou personne, abonnés, site, bio ; une personne ou une très grande marque est refusée d'office avec le motif, le créateur prévenu ; l'admin voit le résultat de la lecture. Correction du comptage des abonnés quand le pseudo se termine par des chiffres (« valette49 300 abonnés » donnait 49 300). Candidature spontanée : une modification possible après acceptation (paiement bloqué), page publique `/candidature-spontanee`, bandes sur l'accueil et la page créateur, adresse d'envoi dédiée aux vidéos ; email 1 créateurs refondu autour de la candidature spontanée (à reporter dans SalesBlink) ; le message privé créateur généré par l'IA la mentionne. |
| 30/09/2026 | **Compte étranger sur une fiche** : « Dhaka University » (éditeur d'applications trouvé par Meta sur « robe ») portait l'Instagram de PUBG Mobile, pris sur son site, et le même compte se retrouvait sur plusieurs fiches. Correction : parmi plusieurs comptes d'un même réseau cités sur un site, celui dont le pseudo ressemble au nom ou au domaine de la marque est retenu ; sans candidat, le premier est gardé mais la fiche est marquée « compte à vérifier » et la file du jour l'affiche en avertissement (rien n'est écarté d'office : marques renommées, groupes). La recherche de l'admin couvre les comptes et le site. Script `check-social-handles.mjs` : liste (simulation), `--apply` marque, `--reject <pseudo>` écarte toutes les fiches jamais contactées portant ce compte. Décision du propriétaire : les applications et jeux restent des cibles. |
| 30/09/2026 | Simulation sur la production : 21 fiches sur 407 avec un compte qui ne ressemble pas à la marque, dont 9 justes (compte du fondateur, autre mot, deux pages d'une même marque), 8 comptes de prestataires (@shopify, @wix, @google, @themefullstack…) et 3 faux comptes (@https, @channel : adresse mal découpée). Corrections : liste intégrée de comptes toujours ignorés, complétable dans les réglages ; découpage des adresses resserré (un pseudo n'est jamais suivi de « : ») ; annonceur Meta au nom de personne sans site **signalé** dans la file et la liste, jamais écarté (« Mélusine Besançon Dijon » est une vraie marque au nom d'une personne). Fiches à nom de personne trouvées par Meta sur « robe » : Julie Holler Jacqueline, Adlesic Tyler Kaitlyn, Akib jabad. |
| 30/09/2026 | Première réponse positive d'une marque en message privé (« envoyez-nous vos prix », avec une adresse). Ajouts : la réponse proposée par l'IA pour une demande de prix suit un plan fixe (fourchette 80 à 250 € HT droits inclus, payés après validation ; deux voies : vidéo tournée par un créateur qui possède le produit, ou compte prêt avec campagne préparée ; « Quelle voie vous convient ? ») ; pour une réponse reçue en message privé qui donne une adresse, la réponse proposée est l'email complet à envoyer à cette adresse ; « Relire et envoyer » part par email direct (adresse dédiée aux vidéos en expéditeur et en réponse) quand la marque n'a pas de fil dans l'outil de mailing. |
| 30/09/2026 | File du jour vide (12 messages envoyés, 0 en attente) : la file ne servait que les prospects sans email, jamais ceux partis par le mailing. Décision : les prospects envoyés au mailing depuis plus de 7 jours, sans réponse, sans rebond ni désabonnement, entrent dans la file après les prospects jamais joints, avec la mention « Déjà jointe par email le … » ; relancés en message privé, ils en sortent. |
| 02/10/2026 | **Défaut du contrôle « marque ou personne »** : au premier lot réel de 60 vérifications, aucune fiche n'a été reconnue comme marque, de vraies marques comprises (sobio_etic, osloskinlab, gedimat). Cause : le contrôle lisait tout le texte de la page, dont le pied de page d'Instagram (« Meta · À propos · Blog · Emplois »), et le mot « blog » classait chaque profil en personne. Les tests ne l'avaient pas vu : leurs textes d'essai n'avaient ni menus ni pied de page. Corrections : (1) seule la **zone du profil** est lue, du pseudo au pied de page exclu ; (2) le verdict devient une **somme de signes** : catégorie de commerce +2, vocabulaire de vente +2, site à soi +1, site au nom du compte +2, mot de personne −2, page de liens −1, marque à partir de 3 ; le site au nom du compte (sobio_etic → sobio-etic.com) reconnaît une marque dont la bio ne dit rien de commercial ; « depuis 20 ans » n'est plus pris pour un âge ; (3) les **raisons du verdict** sont écrites dans le détail du lot, sur la fiche et sur la suggestion ; (4) script `recheck-rejected-brands.mjs` : rejuge les fiches écartées à partir du texte gardé avec chaque tâche, sans relire Instagram, rétablit et qualifie les marques, remet à valider les suggestions refusées à tort. Leçon : un contrôle qui lit une page doit être testé sur un texte de page entière, menus et pied de page compris. |
| 02/10/2026 | **Second défaut, révélé par la simulation sur la production** (102 fiches rejugées, 20 marques reconnues, mais cookut, silikomart, royalcaninfrance encore écartées, et « site à soi » sur presque tous les particuliers). Cause : le **site du compte** était le premier lien externe de la page, et un lien présent sur toutes les pages (`muse.ai`) passait avant le lien de la bio ; ce faux site a été inscrit sur les fiches, et la recherche d'email s'est faite dessus. De plus, une bio à plusieurs liens (« linktr.ee/marque and 1 more ») est un bouton, absent de la liste des liens. Corrections : (1) sur Instagram, le site vient **du lien de la bio seulement** : la ligne du profil écrite comme une adresse, sinon un lien enveloppé par Instagram ; (2) l'IA, déjà interrogée pour la bio, dit en plus si le compte est celui d'une **entreprise ou d'une personne** (±4 dans le verdict, lu sur la zone du profil) : une marque sans mot de commerce dans sa bio est reconnue (cookut), un particulier sans aucun signe est écarté ; (3) le script `recheck-rejected-brands.mjs` retire le faux site des fiches, avec l'email et les comptes sociaux qui en venaient, inscrit le vrai lien de bio, et signale les fiches déjà envoyées au mailing avec un email du faux site. Leçon : rien de ce qui se trouve sur une page de réseau social n'appartient au compte lu tant que ce n'est pas dans la zone du profil. |
| 02/10/2026 | Seconde simulation sur la production : 29 marques reconnues sur 102 (cookut, silikomart, sosh_fr, royalcaninfrance, corsairesdenantes), 73 comptes personnels ; 62 fiches portaient le faux site `muse.ai` et 26 `meta.ai`, aucune n'en avait tiré d'email ni de compte social. Trois réglages tirés de ce résultat : (1) un **pseudo cité sur la page** (« a.lucard », « hugo.bawer », comptes de « Suivi(e) par… ») était pris pour une adresse : une adresse doit porter une terminaison connue (.fr, .com, .shop…), et la lecture s'arrête à « Suivi(e) par » ; (2) la règle d'âge (« 35 ans ») est retirée : elle classait en personne des entreprises qui écrivent leur ancienneté (« 40 ans de recherche »), et l'avis de l'IA la remplace ; (3) une **page de liens ou une boutique Amazon** n'est plus inscrite comme site de la marque (la recherche d'email n'y trouve rien), elle reste un signe du verdict. `meta.ai` rejoint les faux sites retirés par le script. |
| 02/10/2026 | **Lot LinkedIn** : sur 20 pages par jour, environ 8 partaient sur des fiches sans page entreprise possible. Avant toute lecture, le serveur écarte désormais sans consommer de page : les noms illisibles (« Mindlyra、zz », « Neo/Growarcx »), les noms de personne sans site à ce nom (« Edson Pina »), les très grandes enseignes (liste des marques refusées, complétée de Monoprix, Fnac, Darty, Leroy Merlin, Action…, annonces et abonnés). La page entreprise inscrite sur une fiche n'est plus lue de confiance : si son identifiant ne porte ni le nom ni le domaine de la marque (« hydros-alumni »), elle est retirée et la marque est cherchée par son nom. Ces contrôles s'appliquent aussi aux tâches déjà en attente. **Suggestion de marque** : un profil jugé « compte personnel » ne refuse plus la suggestion d'office ; elle reste à valider avec un avertissement, le contrôle pouvant se tromper et un refus automatique décourageant le créateur. **Extension 0.2.7** : rôle affiché dans la fenêtre, compteurs avec plafonds, raison de l'arrêt (session ou jour), ligne d'attente rédigée selon le rôle. |
| 02/10/2026 | **Groupes Facebook, première version** (méthode dans `GROUPES-FACEBOOK.md`). Principe : répondre à des demandes, pas démarcher des membres. Groupes suivis ajoutés par leur adresse (40 au plus), avec leur public (créateurs, marques, annonceurs). Lot « Groupes Facebook » : tâche `list_group_posts`, la page du groupe triée par date, une fois par jour et par groupe, 15 groupes par lot. Extension 0.2.8 : le fil se vide en défilant, son texte est donc gardé ligne à ligne sur cinq défilements. L'IA ne garde que quatre types de publications (marque cherche des créateurs, question d'une marque, créateur cherche des marques, question d'un créateur) et propose un commentaire ; l'extrait doit se retrouver mot pour mot dans la page, sinon la publication est écartée (invention). File « À répondre » dans l'admin : « Copier et ouvrir » copie le commentaire et ouvre la recherche du groupe sur les premiers mots de la publication ; « Répondu », « Passer ». Compteurs par groupe (lectures, demandes, répondues). Aucun membre n'est collecté, rien n'est publié par l'outil, les demandes sont effacées après 60 jours. Non fait : lien direct vers la publication (à régler sur des pages réelles), Messenger assisté, recherche de groupes. **File du jour** : bouton « Corriger le lien » (adresse Instagram, TikTok ou LinkedIn, ou pseudo Instagram, collé tel quel ; l'avertissement « compte à vérifier » est levé). |
| 03/10/2026 | **Première lecture réelle des groupes** : 6 groupes, 10 demandes, toutes « marque cherche des créateurs », mais 4 hors cible (annonce en anglais à 4 000 $ avec lien Discord, offre de stage, casting de modèle, couverture d'événement) et des commentaires qui faisaient la leçon (« Précisez le nombre de vidéos… »). Réglages : la consigne exclut emplois, stages, castings, événements, annonces en anglais ou hors France/Belgique/Suisse, liens Discord/Telegram/WhatsApp et revenus mensuels, avec un garde-fou serveur sur l'extrait ; le commentaire répond au besoin (ce que la personne peut obtenir pour ses produits), nomme NeedCreator une fois, propose un message, et ne commente jamais la rédaction de l'annonce ; l'extrait est coupé avant « En voir plus » ; la date affichée de la publication est relevée ; un groupe à zéro dit si la page était presque vide (non rejoint, pas chargée) ou lue sans demande. Rejoué sur les publications du lot : 3 gardées sur 7, les bonnes. **LinkedIn, premier lot trié** : 5 écartées sans lecture, 11 contacts ajoutés ; deux marques prises pour des personnes (LIFT Shoewear, Cosmetic Times : un mot en majuscules ou de commerce n'est plus un prénom) et une page ignorée pour une lettre « ı » (désormais lue comme un i). |
| 03/10/2026 | **Groupes Facebook, suite** : (1) l'IA relève aussi le nom de la marque, l'adresse email et le site écrits dans l'annonce (gardés seulement s'ils figurent dans la page) ; bouton « Créer la fiche marque » : prospect marque `source manual`, `externalId fbgroup:<clé>`, `mailing.hold` (jamais poussé vers les envois automatiques, filtre ajouté à `pushToMailing`), premier email rédigé par l'IA pour la demande (repli sur un texte fixe), « Relire et envoyer » par `sendLeadReply(lead, text, { subject, first })` : la fiche passe « contactée », `mailing.pushedAt` et `provider: 'direct'` la font revenir dans la file du jour après sept jours pour une relance à la main ; (2) type « creator_opportunity » (agence ou production qui recrute pour un tournage rémunéré) : pas de commentaire, bouton « Relayer aux créateurs » qui prépare le message aux inscrits (`relayDraft`) et ouvre « Messages aux inscrits » pré-rempli (sessionStorage), statut « relayed » compté par groupe. Décision : une annonce d'agence ne se démarche pas en public ; elle se transmet aux créateurs, et se contacte par email si elle donne une adresse. |
| 03/10/2026 | **Demandes de marques** (nouveau nom du panneau « Groupes Facebook ») : (1) le lien « Copier et ouvrir » cassait quand les premiers mots contenaient « : », des parenthèses ou « & » (la recherche de groupe de Facebook ne les supporte pas) : la recherche ne garde que des mots de trois lettres et plus, et les liens des demandes en file sont recalculés à l'affichage ; (2) « Créer la fiche marque » reste disponible sur une demande déjà passée ou répondue tant qu'elle a une adresse et pas de fiche ; (3) **« Coller une annonce »** : une demande vue n'importe où (autre groupe, LinkedIn, story, newsletter) qui donne une adresse entre dans la même file (`GroupPost` sans `groupId`, champ `source`), l'IA relève type, marque, site et propose un commentaire ; refusée sans adresse, dédoublonnée sur le texte ; les compteurs de groupe ne sont touchés que pour une demande venue d'un groupe. Décision : ce qui compte est une demande exprimée avec une adresse, quelle que soit sa provenance. |
| 03/10/2026 | **Marques cherchées par les créateurs.** Le journal du serveur a montré l'entonnoir de la candidature vidéo : 49 créateurs connectés, ~20 ont ouvert la page, 4 ont cherché une marque (Quitoque, Filorga, NHCO, Lyphéa, une marque de meubles), toutes sans résultat, 1 vidéo déposée. Une recherche sans résultat est le meilleur signal de prospection : un créateur possède le produit et veut tourner. Désormais : recherche de quatre caractères et plus sans résultat enregistrée (`BrandSearch`, par créateur et nom normalisé, la frappe lettre à lettre ne laisse que la forme la plus longue, retours en arrière ignorés) ; panneau admin « Marques cherchées » regroupé par marque (créateurs, recherches, dernière date, fiche existante signalée) ; « Créer la fiche marque » : taille estimée (liste refusée, annonces Meta, IA ; une très grande marque est refusée), fiche en prospection avec la note « cherchée par n créateur(s) », réservée dix jours au créateur s'il est seul, créateurs prévenus par notification, qualification en arrière-plan sans que la note de l'IA l'écarte ; « Ignorer ». Jamais de création automatique : une recherche n'est pas une suggestion. Côté créateur, la recherche vide renvoie vers « Proposez la marque ». |
| 05/10/2026 | Seconde lecture réelle des groupes (6 groupes, 22 demandes) : le tri est juste (14 marques, 7 opportunités, 1 créateur), les commentaires répondent au besoin. Deux réglages : une même annonce publiée dans plusieurs groupes n'est relevée qu'une fois (dédoublonnage sur le texte, tous groupes confondus) ; une publication de plus de 21 jours est écartée (âge lu sur la date affichée : « 6 h », « il y a 4 jours », « 10 sep », « 3 sept. 2025 »), le fil n'étant pas strictement chronologique. Le détail du lot compte les deux cas. |
