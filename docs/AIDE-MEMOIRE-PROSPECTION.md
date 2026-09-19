# Aide-mémoire prospection NeedCreator

Deux routines, vingt minutes chacune, dont quinze où l'assistant travaille seul.
Matériel : l'application Claude sur le PC, l'extension Chrome active, vos comptes **secondaires** Instagram et Facebook connectés
(jamais @need.creator), et Admin → Prospection ouvert dans un autre onglet.

---

## Routine créateurs · deux ou trois fois par semaine

**But** : donner un auteur et un email aux publications Instagram que l'agent trouve chaque nuit par hashtag.

1. Admin → Prospection → onglet **Créateurs** → **« Copier les liens Instagram sans auteur »**.
   Message « Aucune publication sans auteur » : rien à faire aujourd'hui.
2. Copier la consigne ci-dessous, remplacer `<coller les liens>` par le contenu du presse-papiers, coller dans l'application Claude.

```
Utilise Claude in Chrome avec mon compte Instagram secondaire déjà connecté. Voici des liens de publications Instagram (un par ligne) :
<coller les liens>
Pour chaque lien : ouvre la publication, note le pseudo de l'auteur, ouvre son profil, relève la bio, l'email s'il est affiché ou dans le bouton
« E-mail », le lien de bio (ouvre-le et relève un email s'il y en a un), et le nombre d'abonnés.
Règles : 5 à 10 secondes entre deux pages, pas de like, pas de commentaire, pas de message, pas d'abonnement. Au plus 60 profils.
Sortie : une ligne par publication, séparateur « ; » : lien de la publication (tel que fourni) ; https://www.instagram.com/pseudo/ ; email ; bio courte + abonnés ; site ou lien de bio.
```

3. Copier la liste rendue par l'assistant.
4. Admin → onglet **Créateurs** → **« Import groupé (liste collée) »** → coller → **« Vérifier la lecture »** → **« Importer et qualifier »**.
5. Lire le message : « N fiche(s) existante(s) complétée(s), dont M avec un nouvel email ». Cinq minutes après, les fiches sont qualifiées.

Repère : le premier lot a donné 27 emails sur 30 publications. C'est votre meilleure source.

---

## Routine marques · une fois par semaine

**But** : trouver des marques qui diffusent déjà des publicités vidéo, donc qui ont besoin d'UGC. Nécessaire tant que Meta n'a pas validé
votre identité ; ensuite l'agent le fera seul.

1. Copier la consigne ci-dessous et remplacer `<MOTS-CLÉS>` par la liste de la semaine (tableau plus bas).
   **Changer de mots-clés à chaque fois** : avec les mêmes, l'assistant ramène les mêmes marques, déjà connues.

```
Utilise Claude in Chrome. Va sur https://www.facebook.com/ads/library, pays France, catégorie « Toutes les publicités », statut « Actives ».
Cherche tour à tour ces mots-clés : <MOTS-CLÉS>.
Pour chaque recherche, relève les 15 premiers annonceurs distincts qui diffusent des publicités vidéo : nom de la page, lien de la page Facebook,
site web indiqué dans l'annonce, et une phrase sur ce qu'ils vendent. Ignore les grands groupes (L'Oréal, Sephora, Decathlon…) et les revendeurs
(Amazon, Cdiscount) : on veut des marques françaises de taille PME.
Règles : une page toutes les 5 à 10 secondes, pas plus de 100 annonceurs au total, aucune interaction avec les publicités.
Sortie : une ligne par marque, séparateur « ; » : nom ; lien de la page Facebook ; email si visible ; ce qu'elle vend + « publicités vidéo actives » ; site web.
```

2. Copier la liste rendue par l'assistant.
3. Admin → onglet **Marques** → **« Import groupé (liste collée) »** → coller → champ Origine : `bibliothèque Meta` →
   **« Vérifier la lecture »** → **« Importer et qualifier »**.
4. Rien d'autre à faire : l'email est cherché sur le site de chaque marque pendant l'import. Repère : 67 emails sur 100 marques au premier lot.

### Mots-clés, semaine par semaine

| Semaine | Mots-clés à coller à la place de `<MOTS-CLÉS>` |
|---|---|
| 1 (fait le 18/09/2026) | cosmétique, soin visage, complément alimentaire, vêtement, bijou, décoration, épicerie fine, application mobile |
| 2 | maquillage, parfum, soin cheveux, lingerie, chaussures, maroquinerie, bébé, jouet |
| 3 | thé, café, chocolat, vin, boisson sans alcool, animalerie, sport, yoga |
| 4 | literie, linge de maison, bougie, mobilier, jardin, high-tech, accessoire téléphone, montre |
| 5 | soin homme, barbe, solaire, hygiène féminine, dentaire, lunettes, sac, bagage |
| 6 | cuisine, électroménager, vaisselle, box repas, snack, protéine, vélo, running |

Après la semaine 6, reprendre à la semaine 1 : de nouvelles marques auront lancé des publicités entre-temps.

---

## Une fois par semaine : le coup d'œil de contrôle

Dans Admin → Prospection :

- **Ligne d'état en haut** : YouTube, Meta, Instagram et IA doivent être en vert. « Meta : expire dans … j » : renouveler le jeton quand il reste
  moins de 10 jours.
- **« Pourquoi tous les prospects ne sont pas dans le mailing ? »** : la ligne « Prêts, partiront au prochain envoi » doit retomber à zéro
  après chaque envoi. « En attente de qualification IA » ne doit pas grossir.
- **Pastille « A répondu »** : ouvrir chaque réponse, relire la proposition de l'IA, cliquer « Relire et envoyer ».
- **Journal des exécutions** : une ligne par nuit, sans erreur autre que « identité non encore validée par Meta ».

## Ce qui tourne tout seul

- Recherche nocturne des créateurs sur YouTube et Instagram, répartie entre les sources.
- Qualification par l'IA : score, message court, paragraphe d'email.
- Envoi vers SalesBlink des prospects avec email au-dessus du score minimum, si « Envoi automatique » est activé.
- Récupération des réponses, rebonds et désabonnements, classement des réponses par l'IA.
- Création d'une campagne en brouillon quand une marque prospectée s'inscrit.

## À ne jamais faire

- Envoyer des messages privés en rafale ou les faire envoyer par l'assistant : 10 à 20 par jour, à la main, c'est vous qui cliquez Envoyer.
- Naviguer avec le compte @need.creator : c'est la vitrine, un blocage serait visible de tous.
- Dépasser 60 profils ou 100 annonceurs par session d'assistant.

## Quand ça ne marche pas

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| « fiche(s) déjà connue(s) sans rien de nouveau » | ce n'est pas un rejet : l'assistant n'a rien trouvé de plus pour ces fiches |
| « ligne(s) en double » | la même ligne figure deux fois, ou le prospect existe déjà sans rien à compléter |
| « Rien à chercher : déjà visités il y a moins de 30 jours » | la mémoire anti-répétition fonctionne, il n'y a rien à refaire |
| Le journal affiche « en cours » | la recherche tourne, recharger dans quelques minutes |
| Le journal affiche « interrompue » | un déploiement a redémarré le serveur pendant la recherche : la relancer |
| Des contacts dans SalesBlink mais aucun email envoyé | la séquence n'est pas rattachée à la liste « NeedCreator · Prospection … » |

Détails techniques et autres consignes (TikTok, LinkedIn, profils sans email, messages assistés) : `docs/AGENT-CHROME.md`.
