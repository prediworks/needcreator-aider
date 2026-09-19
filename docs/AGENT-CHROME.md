# Assistant Chrome pour la prospection (application Claude + extension « Claude in Chrome »)

Ce document contient des consignes prêtes à coller dans l'application Claude sur votre PC, avec l'extension Chrome active.
L'assistant navigue dans **votre** navigateur, avec **vos** sessions, à vitesse humaine, et produit une liste à coller dans
**Admin → Prospection → « Import groupé (liste collée) »**. NeedCreator dédoublonne, marque les comptes déjà inscrits,
trouve les réseaux et qualifie chaque prospect avec l'IA. Les emails partent ensuite par l'outil de mailing ; les prospects
sans email restent dans la file « contact manuel » avec un message prêt.

## Règles de conduite (à laisser dans chaque consigne)

- Jamais de message privé envoyé automatiquement : l'assistant peut préparer et pré-remplir, c'est vous qui cliquez Envoyer.
- Vitesse humaine : une page toutes les 5 à 10 secondes, 50 à 100 profils par session, jamais en boucle toute la nuit.
- Navigation Instagram et TikTok depuis un compte secondaire, jamais depuis @need.creator (compte vitrine).
- Ne relever que des informations publiques : bio, email affiché, lien de bio, site.
- Format de sortie : une ligne par prospect, champs séparés par « ; » : `nom ; lien du profil ; email ; bio courte ; site`.
  Laisser un champ vide quand l'information manque. Pas de tableau, pas de commentaire entre les lignes.

## 1. Marques : bibliothèque publicitaire Meta (sans attendre la vérification d'identité)

```
Utilise Claude in Chrome. Va sur https://www.facebook.com/ads/library, pays France, catégorie « Toutes les publicités », statut « Actives ».
Cherche tour à tour ces mots-clés : cosmétique, soin visage, complément alimentaire, vêtement, bijou, décoration, épicerie fine, application mobile.
Pour chaque recherche, relève les 15 premiers annonceurs distincts qui diffusent des publicités vidéo : nom de la page, lien de la page Facebook,
site web indiqué dans l'annonce, et une phrase sur ce qu'ils vendent. Ignore les grands groupes (L'Oréal, Sephora, Decathlon…) et les revendeurs
(Amazon, Cdiscount) : on veut des marques françaises de taille PME.
Règles : une page toutes les 5 à 10 secondes, pas plus de 100 annonceurs au total, aucune interaction avec les publicités.
Sortie : une ligne par marque, séparateur « ; » : nom ; lien de la page Facebook ; email si visible ; ce qu'elle vend + « publicités vidéo actives » ; site web.
```

Coller la liste dans Admin → Prospection, onglet Marques, « Import groupé », origine « bibliothèque Meta ».

## 2. Créateurs Instagram : compléter les auteurs des publications trouvées par hashtag

Tant que Meta n'a pas approuvé « oEmbed Read », les prospects Instagram trouvés par hashtag n'ont que le lien de la publication, sans auteur.

**Où trouver les liens** : Admin → Prospection → onglet Créateurs → bouton **« Copier les liens Instagram sans auteur »**. Il copie
jusqu'à 60 liens dans le presse-papiers. Collez-les à la place de `<coller les liens>` dans la consigne ci-dessous.

```
Utilise Claude in Chrome avec mon compte Instagram secondaire déjà connecté. Voici des liens de publications Instagram (un par ligne) :
<coller les liens>
Pour chaque lien : ouvre la publication, note le pseudo de l'auteur, ouvre son profil, relève la bio, l'email s'il est affiché ou dans le bouton
« E-mail », le lien de bio (ouvre-le et relève un email s'il y en a un), et le nombre d'abonnés.
Règles : 5 à 10 secondes entre deux pages, pas de like, pas de commentaire, pas de message, pas d'abonnement. Au plus 60 profils.
Sortie : une ligne par publication, séparateur « ; » : lien de la publication (tel que fourni) ; https://www.instagram.com/pseudo/ ; email ; bio courte + abonnés ; site ou lien de bio.
```

Coller le résultat dans « Import groupé », onglet Créateurs. Comme chaque ligne commence par le lien de la publication, NeedCreator
**complète la fiche existante** (pseudo, profil, email, bio) au lieu d'en créer une nouvelle, puis la requalifie avec ces informations.
Le message indique « N fiche(s) complétée(s) ». Recommencez avec le bouton pour les 60 suivantes.

## 2 bis. Créateurs sans email : lire le bouton « E-mail » et la bio

La moitié des créateurs trouvés n'ont pas d'email public lisible par le serveur (YouTube le cache derrière un captcha, Instagram derrière
le bouton « E-mail »). L'assistant, lui, le voit.

**Où trouver les profils** : Admin → Prospection → onglet Créateurs → bouton **« Copier les profils sans email »** (60 au plus, les mieux
notés d'abord ; un profil remis n'est pas redonné avant 30 jours). Si le bouton répond qu'il n'y a rien, cliquez d'abord
« Compléter les réseaux (tous) » : il faut un profil Instagram ou TikTok sur la fiche.

```
Utilise Claude in Chrome avec mes comptes Instagram et TikTok secondaires déjà connectés. Voici des profils de créateurs (un par ligne) :
<coller les profils>
Pour chaque profil : ouvre-le, relève l'email s'il est dans la bio ou derrière le bouton « E-mail » ou « Contact », ouvre le lien de bio
(Linktree, Canva, site) et relève un email s'il y en a un, note la bio en une phrase et le nombre d'abonnés.
Règles : 5 à 10 secondes entre deux pages, pas de like, pas de commentaire, pas de message, pas d'abonnement. Au plus 60 profils.
Sortie : une ligne par profil, séparateur « ; » : lien du profil (tel que fourni) ; email ; bio courte + abonnés ; site ou lien de bio.
Ne saute aucun profil : s'il n'y a pas d'email, laisse le champ vide.
```

Coller le résultat dans « Import groupé », onglet Créateurs. Comme chaque ligne commence par le lien du profil déjà connu, NeedCreator
**ajoute l'email à la fiche existante** (message « N email(s) ajouté(s) à des fiches existantes ») ; les fiches déjà qualifiées deviennent
aussitôt éligibles au mailing.

## 2 ter. Créateurs YouTube sans aucun réseau connu : retrouver leur Instagram et leur email

Quand « Copier les profils sans email » n'a plus de profil Instagram ou TikTok à donner, il copie à la place des **chaînes YouTube**
(40 au plus), une par ligne, sous la forme `lien de la chaîne ; nom`. Ces créateurs n'affichent aucun lien sur leur chaîne, mais ils ont
presque toujours un compte Instagram au même pseudo, avec leur email en bio.

```
Utilise Claude in Chrome avec mes comptes YouTube et Instagram secondaires connectés. Voici des chaînes YouTube de créateurs UGC (lien ; nom) :
<coller les chaînes>
Pour chaque chaîne :
1. Ouvre la chaîne, onglet ou fenêtre « À propos » : relève les liens affichés et l'email s'il est visible. S'il est derrière un bouton avec
   un captcha, ne le résous pas, passe à la suite.
2. Cherche sur Instagram le même pseudo ou le même nom (par exemple via la recherche Instagram). Ne retiens le compte que si la photo, le nom
   ou la bio montrent clairement que c'est la même personne ; dans le doute, laisse vide.
3. Si tu as trouvé le compte Instagram : relève l'email de la bio ou du bouton « E-mail », ouvre le lien de bio et relève un email s'il y en a un.
Règles : 5 à 10 secondes entre deux pages, pas de like, commentaire, message ni abonnement. Au plus 40 chaînes.
Sortie : une ligne par chaîne, séparateur « ; » : lien de la chaîne YouTube (tel que fourni) ; lien du profil Instagram ; email ; bio courte + abonnés Instagram ; site ou lien de bio.
Ne saute aucune chaîne : laisse vides les champs introuvables.
```

Coller le résultat dans « Import groupé », onglet Créateurs : la chaîne YouTube étant déjà connue, NeedCreator ajoute l'Instagram, l'email et
la bio à la fiche existante. Un créateur dont l'Instagram est retrouvé mais pas l'email pourra être contacté à la main.

## 3. Créateurs TikTok par hashtags (seule voie propre pour TikTok)

```
Utilise Claude in Chrome avec mon compte TikTok secondaire connecté. Ouvre https://www.tiktok.com/tag/ugcfrance puis
https://www.tiktok.com/tag/createurugc et https://www.tiktok.com/tag/ugccreatorfrance.
Sur chaque page, ouvre les 20 premières vidéos récentes, relève l'auteur, ouvre son profil : bio, email s'il est affiché, lien de bio
(ouvre-le et relève un email s'il y en a un), nombre d'abonnés. Garde uniquement les créateurs francophones qui proposent des vidéos UGC
aux marques. Ignore les agences et les coachs qui vendent des formations UGC.
Règles : 5 à 10 secondes entre deux pages, aucun like, commentaire, message ni abonnement. Au plus 60 profils par session.
Sortie : une ligne par profil, séparateur « ; » : @pseudo ; https://www.tiktok.com/@pseudo ; email ; bio courte + abonnés ; lien de bio.
```

## 4. Marques et responsables marketing sur LinkedIn

```
Utilise Claude in Chrome avec mon compte LinkedIn connecté. Cherche les entreprises françaises de 5 à 100 salariés dans ces secteurs :
cosmétiques, compléments alimentaires, mode, décoration, épicerie. Pour chacune, ouvre la page entreprise : site web, description, taille.
Ne contacte personne, n'envoie aucune invitation. Au plus 50 entreprises par session, 5 à 10 secondes entre deux pages.
Sortie : une ligne par entreprise, séparateur « ; » : nom ; lien de la page LinkedIn ; email si visible sur le site ; description courte + taille ; site web.
```

NeedCreator cherche ensuite l'email générique sur le site et les mentions légales lors de la qualification.

## 5. Messages privés assistés (après import et qualification)

Dans Admin → Prospection, chaque prospect qualifié a un message court (bouton « Copier le message ») et ses liens Instagram et TikTok.

```
Utilise Claude in Chrome. Voici une liste de profils avec, pour chacun, le message à envoyer :
<coller : lien du profil — message>
Pour chaque profil : ouvre-le, ouvre la messagerie, colle le message tel quel, puis ARRÊTE-TOI et attends que je clique Envoyer moi-même.
Passe au suivant seulement quand je te le dis. Au plus 15 messages par jour.
```

Marquez ensuite les prospects « Contacté » (sélection groupée → statut) avec le canal « instagram » ou « tiktok ».

## Ce que fait NeedCreator après l'import

1. Dédoublonnage par lien, email et identifiant ; comptes déjà inscrits marqués « Inscrit », créateurs de l'annuaire marqués « Déjà connu ».
2. Réseaux relevés dans la ligne (Instagram, TikTok, YouTube, LinkedIn, Facebook), niche et origine par défaut si renseignées.
3. Pour les prospects importés sans email mais avec un site : recherche de l'email sur le site (accueil, contact, mentions légales) avant la qualification.
4. Qualification IA en arrière-plan : score, signaux, message réseaux, paragraphe email. Résultat visible en quelques minutes dans les files.
5. Les prospects avec email suivent le circuit mailing habituel (envoi automatique ou « Pousser les éligibles »).
