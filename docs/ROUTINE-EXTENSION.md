# Routine de prospection avec l'extension Chrome

La routine quotidienne et hebdomadaire quand l'extension NeedCreator (dossier `extension/`) fait le travail de lecture.
L'ancienne routine avec l'assistant Claude et le copier-coller reste dans `docs/AIDE-MEMOIRE-PROSPECTION.md`, comme plan B.

---

## Une fois pour toutes : deux installations

| Profil Chrome | Compte connecté | Rôle de l'extension (options) | Ce qu'elle fait |
|---|---|---|---|
| Profil « lecture » | comptes **secondaires** Instagram, TikTok, Facebook | **Reader** | lit les pages des lots, ne clique jamais |
| Profil « messages » | **@need.creator** | **Messenger** | ouvre une conversation et colle le message préparé, vous envoyez |

Pour chaque profil : `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → dossier `extension/` du dépôt
sur le PC. Options : l'adresse et le jeton affichés dans Admin → Prospection → « Extension Chrome : lots de tâches », le rôle, puis
« Test connection ». Jamais l'inverse des rôles : le compte @need.creator ne lit pas de pages, le compte secondaire n'écrit pas.

**Mise à jour** : quand je vous dis qu'une nouvelle version est poussée, sur le PC `git pull` dans le dossier du projet, puis « recharger »
(flèche circulaire) sur la carte de l'extension, dans les deux profils. Le numéro de version doit changer.

**Fenêtre de l'extension (0.2.7)** : le rôle du profil est affiché en haut, en vert « Reader » ou en jaune « Messenger ». Si des lots
restent en attente alors que la fenêtre dit « No message to prepare », Start a été cliqué dans le profil Messenger. Les compteurs
donnent les pages lues et leur plafond (« 60 / 60 », « 150 / 150 »). À l'arrêt, la ligne d'état dit pourquoi : « session cap reached,
press Start for a new session » (pause voulue après 60 pages : attendre une vingtaine de minutes puis Start) ou « daily cap reached,
back tomorrow » (150 pages : la suite reste en file jusqu'au lendemain).

---

## Chaque jour · 10 minutes

1. Admin → Prospection, onglet **Marques** : carte « À contacter aujourd'hui ».
2. Dans le profil « messages », extension **Start** une fois pour la journée.
3. Pour chaque marque : **« Préparer dans Chrome »** → la conversation Instagram s'ouvre avec le message collé → relisez, ajoutez un mot si
   le profil vous inspire, **Envoyer** → dans l'admin, **« Contacté, suivant »**. Sans le rôle Messenger, « Copier et ouvrir Instagram » fait
   la même chose avec un collage à la main.
   Une marque à qui vous avez déjà écrit revient dans la file ? **« Déjà contacté »** : elle passe en « Contacté » avec une date rétablie à sept jours plus tôt, et ne compte pas dans les 15 du jour.
   Les marques parties par le mailing depuis plus de 7 jours sans réponse reviennent dans la file, après les autres, avec la mention « Déjà jointe par email le … » : un message privé court qui rappelle l'email et pose la question.
   **Test du message (depuis le 08/10/2026)** : une marque sur deux reçoit la version « concurrent » (« J'ai relevé les publicités de X qui
   tournent depuis le plus longtemps : à quelle adresse puis-je vous les envoyer ? »). La version est indiquée au-dessus du message ; si
   « concurrent en cours de recherche » s'affiche, le message change seul dans la minute, ou envoyez celui affiché. Le résultat (réponses par
   version) est sous la barre de progression.
4. S'arrêter à 15. Les réponses reçues : **« Coller la réponse »** sur la fiche (l'email donné entre dans le mailing) ; quoi répondre selon
   le cas : `docs/REPONSES-MARQUES.md`.

5. Admin → Prospection → **Scan concurrentiel** : trois listes à parcourir. **« Abonnés au rapport »** (depuis le 09/10/2026 : des visiteurs ont
   laissé leur adresse sous un scan ; une marque sans compte a une fiche « Nouveau », à relire puis à passer « À contacter » si c'en est une),
   **« Marques venues de l'email »** (à relancer en premier, en citant ce qu'elles ont regardé) et **« Clients de devis venus des outils »**.

Les créateurs ne passent plus par les messages privés que s'ils n'ont pas d'email : la file du jour côté Créateurs les propose d'elle-même.

---

## Deux ou trois fois par semaine · créateurs (profil « lecture », 5 minutes puis ça tourne seul)

1. Admin → Prospection → « Extension Chrome : lots de tâches » → **« Lot : publications sans auteur »**.
2. Dans le profil « lecture », extension **Start**. Un lot de 60 publications demande deux sessions (60 pages chacune : auteurs, puis
   profils) : quand l'extension s'arrête sur « Session cap reached », recliquer Start.
3. Le tableau des lots avance tout seul : « N complétée(s), N email(s) ». Les fiches complétées sont qualifiées dans les minutes qui suivent
   et entrent dans le mailing ou la file du jour.

Plafond : 150 pages par jour pour le compte secondaire. L'extension s'arrête seule ; reprendre le lendemain.

---

## Une fois par semaine · marques (profil « lecture »)

Trois sources, par ordre d'intérêt :

1. **« Lot : marques taguées »** avec les hashtags proposés (#partenariat, #collab…) : les marques qui paient déjà des créateurs. L'extension
   lit les publications, puis le profil de chaque marque nouvelle (site, email, abonnés). Le meilleur lot.
2. **La bibliothèque Meta par API** : rien à faire, la recherche nocturne trouve 100 marques par nuit avec leur email et leurs réseaux, tant
   que la ligne d'état affiche « Meta : jeton valide ».
3. **« Lot : pubs TikTok »** avec les mots-clés de la semaine (tableau dans `docs/AIDE-MEMOIRE-PROSPECTION.md`) : les annonceurs des
   meilleures publicités TikTok du mois.

4. **« Lot : contacts LinkedIn »** (compte LinkedIn secondaire connecté dans le profil de lecture) : 20 marques par jour au plus ; la fiche reçoit
   les personnes marketing avec un email déduit, à « retenir » d'un clic dans la file du jour, et un bouton « message LinkedIn » pour la personne.

**Mots-clés** : chaque champ est pré-rempli avec la liste de la semaine (« Semaine 3 sur 6 · liste précédente lancée le … »). Cliquez
simplement sur le lot. Vous pouvez changer les mots : le lot part avec vos mots, mais la rotation n'avance pas, et « Liste de la semaine »
remet la liste prévue. Les listes se modifient dans Réglages → Prospection.

Puis Start dans le profil « lecture ». Les marques avec email partent au mailing la nuit suivante ; celles avec Instagram arrivent dans la
file du jour.

---

## Ce qu'il faut regarder

- **Tableau des lots** : « terminé » avec le nombre d'emails. Un clic sur le nom du lot donne le détail tâche par tâche ; les lignes
  « auteur introuvable » ou « échec » se lisent en clair.
- **Fenêtre de l'extension** : « Stopped: login / captcha / consent » → ouvrir l'onglet qu'elle utilise, régler la page à la main (se
  connecter, accepter les cookies), puis Start. « Daily cap reached » → demain.
- **Pages de hashtag** (extension 0.2.6) : pendant la lecture d'une liste, l'onglet de l'extension passe au premier plan une vingtaine de secondes, puis votre onglet revient. C'est voulu : Instagram ne charge la suite des publications que si la page est affichée. Dans le détail du lot, un hashtag doit donner une vingtaine de publications ; « page peu chargée » signale une liste restée sur ses premières publications.
- **Groupes Facebook** (extension 0.2.9) : Admin → Prospection → « Demandes de marques » → « Lire les groupes », puis Start en profil Reader. Une page par groupe et par jour, l'onglet passe au premier plan le temps de la lecture. Le compte Facebook du profil Reader doit avoir rejoint les groupes. Depuis la 0.2.9, chaque demande garde le lien direct de sa publication quand la page le montre (« Copier et ouvrir » l'ouvre directement ; « Copier et ouvrir (recherche) » signale qu'il manque et passe par la recherche du groupe). Méthode complète : `GROUPES-FACEBOOK.md`.
- **Plusieurs adresses sur une fiche marque** : dans la file du jour, « retenir » sur une personne LinkedIn ajoute son adresse à la fiche ; la première retenue (ou celle qui remplace un contact@ générique) est l'adresse principale, les suivantes s'ajoutent (cinq au plus) et partent au mailing avec les mêmes champs ; « retirer » enlève une adresse. Une réponse venue de n'importe laquelle vaut pour la fiche.
- **Lot LinkedIn** : avant toute lecture, le serveur écarte sans consommer de page les noms illisibles (« Mindlyra、zz »), les noms de personne sans site à ce nom, les très grandes enseignes (liste dans Réglages → Prospection → « Taille des marques ») et remplace par une recherche la page entreprise inscrite sur la fiche quand elle ne porte ni le nom ni le site de la marque. Dans le détail du lot : « nom de personne : écartée sans lecture », « très grande enseigne : écartée sans lecture ».
- **Marque ou personne** : une marque taguée par un créateur reste « en attente de vérification » tant que l'extension n'a pas lu son profil. Elle n'apparaît ni dans la file du jour ni dans le mailing. Dans le détail du lot : « fiche marque complétée » (marque confirmée, qualifiée dans les minutes qui suivent), « compte personnel, pas une marque (…) : fiche écartée » ou « profil introuvable sur Instagram ». Les parenthèses donnent les signes lus (« site au nom du compte », « compte d'entreprise selon l'IA », « mot de personne “maman” », « aucun signe d'entreprise »…) : une vraie marque écartée à tort se repère ainsi tout de suite. Une personne passée entre les mailles : « Hors cible ».
- **Taille des marques** : dans le détail du lot, « très grande marque : fiche écartée » (plus de 500 000 abonnés, ou liste des marques refusées) et « grande marque » (plus de 100 000 : gardée, signalée). Seuils et liste dans Réglages → Prospection → « Taille des marques ».
- **Adresse de contact Instagram** : lecture coupée par défaut depuis la 0.2.6. Instagram l'a refusée (« 429 ») au premier passage réel ; ne pas la réactiver.
- **Ligne d'état** en haut de Prospection : Meta, YouTube, Instagram, IA en vert.
- **Bloc mailing** : « poussés aujourd'hui » supérieur à zéro après une nuit avec des marques nouvelles.

## À ne jamais faire

- Lire des pages avec le compte @need.creator, ou envoyer des messages avec le compte secondaire.
- Dépasser les plafonds en les remontant dans les options la première semaine : 60 pages par session, 150 par jour.
- Lancer deux lots de lecture en même temps : ils se partagent la même session, rien ne va plus vite.
