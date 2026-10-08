# Nouveau message côté marques · textes à valider

Rédigé et validé le 07/10/2026 ; séquence d'emails refaite le 08/10/2026 (section 3). **Reporté sur le site et dans les consignes de l'IA le même jour** (accueil, page Marques, message privé aux
marques, commentaires des groupes). **Reste à faire par vous** : recoller les trois emails dans SalesBlink une fois les variables `competitor_line` et `audit_link` livrées (envoi test d'abord), envoyer les deux annonces depuis Admin → Messages aux inscrits, publier le kit réseaux.

---

## Le principe

Aujourd'hui, on dit : « on vous livre des vidéos UGC ». Demain : **« on vous aide à savoir quelles publicités faire, puis on les fait tourner ».**

- La promesse reste un **résultat** (des publicités qui marchent), pas une liste d'outils.
- Les outils gratuits deviennent les **étapes visibles** qui mènent à la vidéo : comprendre, préparer, produire, protéger.
- Dans les emails et les messages, on **ouvre sur une valeur déjà faite** (les accroches pour leur produit, le scan de leurs publicités), jamais sur « nous faisons de l'UGC ».

---

## 1. Page d'accueil

**Bandeau au-dessus du titre** (remplace « La plateforme UGC la plus simple et transparente ») :
> Publicités vidéo pour les marques et les e-commerçants

**Titre** (remplace « Des vidéos UGC authentiques, sans friction ») :
> **Sachez quelles publicités marchent. Faites-les tourner par des créateurs.**

**Sous-titre** :
> Voyez les publicités de vos concurrents qui tournent depuis des mois, recevez un brief prêt à publier, et des vidéos de créateurs vérifiés : vous ne payez que celles qui vous conviennent.

**Boutons** : inchangés (« Je suis une marque », « Je suis créateur »).

**Trois coches** :
> ✓ Vidéos dès 80 € · ✓ Vous ne payez qu'à la validation · ✓ Outils gratuits, sans abonnement

**Nouveau bandeau des quatre étapes**, juste sous l'en-tête, avant le bandeau du scan :

| **1. Comprendre** | **2. Préparer** | **3. Produire** | **4. Protéger** |
|---|---|---|---|
| Les publicités de vos concurrents qui durent, l'audit des vôtres. | Un brief prêt à publier depuis un simple lien produit. | Des créateurs vérifiés, ou une vidéo déjà tournée à regarder avant de payer. | Un contrat de droits par vidéo, un registre de tous vos contenus. |
| → Scanner un concurrent | → Mon brief depuis un lien | → Voir des créateurs | → Le registre des droits |

**Description Google** (titre de l'onglet et texte sous le lien dans les résultats) :
> Titre : `NeedCreator : des publicités vidéo qui marchent, tournées par des créateurs`
> Description : `Voyez les publicités de vos concurrents qui tournent depuis des mois, préparez votre brief, faites tourner vos vidéos par des créateurs vérifiés. Vous ne payez que les vidéos qui vous conviennent.`

---

## 2. Page Marques

**Bandeau au-dessus du titre** : inchangé (« Pour les marques et les e-commerçants »).

**Titre** (remplace « Des vidéos UGC livrées, contrôlées, payées seulement si elles vous conviennent ») :
> **De l'idée à la publicité : savoir quoi tourner, le faire tourner, le diffuser en règle.**

**Sous-titre** :
> Commencez par ce qui marche déjà : les publicités de vos concurrents, l'audit des vôtres. Transformez-le en brief en un clic. Des créateurs vérifiés le tournent au prix de leur devis ou contre votre produit ; vous ne payez qu'à la validation, contrat de droits inclus.

**Boutons**, dans cet ordre :
1. `Publier ma première campagne` (principal, inchangé)
2. `Les publicités de mes concurrents`
3. `Auditer mes publicités` (nouveau)
4. `Mon brief depuis un lien produit`

(« Voir des créateurs » descend dans la page, à la section créateurs : cinq boutons, c'est trop.)

**Trois coches** : inchangées (« Gratuit et complet, Pro seulement pour le volume », « Aucun frais ajouté au devis », « Débit à la validation seulement »).

**Le même bandeau des quatre étapes** que sur l'accueil, juste sous l'en-tête.

**Description Google** :
> Titre : `Publicités vidéo UGC pour les marques : comprendre, préparer, produire | NeedCreator`
> Description : `Scannez les publicités de vos concurrents, auditez les vôtres, transformez-les en brief et faites-les tourner par des créateurs vérifiés. Paiement à la validation, contrat de droits inclus.`

---

## 3. Séquence d'emails marques (à recoller dans SalesBlink)

**Version du 08/10/2026.** Aucune marque n'ayant réagi, on change d'approche : **l'email 1 ne vend rien**, il offre un seul outil gratuit (les
publicités de leurs concurrents), avec un seul lien. L'email 2 parle de leurs propres publicités et des trois accroches préparées pour eux,
l'email 3 garde les offres sans risque.

**Variables fournies par NeedCreator** (poussées avec chaque contact, livrées le 08/10/2026) :

| Variable | Contenu |
|---|---|
| `{{ competitor_name }}` | un concurrent de la marque, choisi par l'IA à la qualification (ex. « Typology ») |
| `{{ competitor_line }}` | la phrase complète avec le lien qui lance directement le scan de ce concurrent ; sans concurrent connu, une phrase générique (« tapez le nom d'un concurrent ») avec le lien de l'outil. **C'est elle qu'on met dans l'email**, pour ne jamais envoyer un trou. |
| `{{ audit_link }}` | le lien qui lance l'audit de leurs propres publicités |
| `{{ paragraph }}` | les trois accroches pour leur produit (inchangé) |
| `{{ signup_link }}` | création du compte marque (inchangé) |

Les liens portent la référence de la fiche : un scan ou un audit lancé depuis l'email est rattaché à la marque prospectée, et la fiche passe en
tête des relances dans l'admin (compteur de scans).

**Avant d'activer** : un envoi test pour vérifier que SalesBlink remplace bien les variables, liens compris. **Les contacts déjà poussés avant
le 08/10 n'ont pas ces variables**. Les nouvelles marques partent donc sur une **nouvelle liste, « NeedCreator · Prospection marques 2 »**,
créée d'office au premier envoi : créez une **nouvelle séquence** avec ces trois emails et rattachez-la à cette liste (sans rattachement,
aucun email ne part). L'ancienne séquence reste sur l'ancienne liste, inchangée, pour les contacts déjà en cours.

**Préparer l'arriéré** (facultatif, conseillé avant la reprise des envois) : `node --env-file=.env scripts/prepare-competitors.mjs --limit 100`,
depuis `backend/` sur le serveur. Environ 30 secondes par marque, quatre à la fois.

### Email 1 · jour 0 · les publicités de leurs concurrents

**Objet** (tester les deux) :
- `Les publicités de vos concurrents qui tournent depuis trois mois`
- `{{ company_name }} : ce que vos concurrents font tourner`

```
Bonjour,

Une publicité qu'une marque laisse tourner trois mois est une publicité qui lui rapporte. Elles sont publiques, mais introuvables à la main.

Nous avons fait un outil gratuit qui les montre : tapez le nom d'un concurrent, vous voyez ses publicités Meta actives de la plus ancienne à la plus récente, les angles qu'il utilise et ceux qu'il laisse libres.

{{ competitor_line }}

Sans compte, sans rien connecter.

{{name_of_sender}}
NeedCreator · https://needcreator.com

PS : le même outil lit aussi vos propres publicités : {{ audit_link }}

Vous recevez ce message sur l'adresse de contact publique de {{ company_name }}, dans un cadre strictement professionnel. Un clic pour ne plus rien recevoir : Se désinscrire.
```

Exemple de `{{ competitor_line }}` : « Par exemple, les publicités de Typology, la plus ancienne en premier : https://needcreator.com/publicites-concurrents?q=Typology&ref=… »

### Email 2 · jour 4 · leurs publicités

**Objet** (tester les deux) :
- `{{ company_name }} : trois accroches pour votre prochaine publicité`
- `Vos publicités qui durent, et celles qui manquent`

```
Bonjour,

Je m'appelle {{name_of_sender}}, je m'occupe de NeedCreator. Nous aidons les marques à savoir quelles publicités vidéo faire, puis nous les faisons tourner par des créateurs vérifiés, payés seulement si la vidéo vous convient.

{{ paragraph }}

Nous avons aussi lu toutes vos publicités Meta actives : celles qui tournent depuis le plus longtemps, les angles que vous répétez, ceux que vous n'utilisez pas encore. L'audit est prêt, gratuit, sans rien connecter : {{ audit_link }}

Si ce message ne vous concerne pas directement, pourriez-vous le transmettre à la personne en charge du marketing ou des publicités ? Merci d'avance.

{{name_of_sender}}
NeedCreator · https://needcreator.com

Vous recevez ce message sur l'adresse de contact publique de {{ company_name }}, dans un cadre strictement professionnel. Un clic pour ne plus rien recevoir : Se désinscrire.
```

### Email 3 · jour 9 · dernier message

**Objet** : `Dernier message : une vidéo pour {{ company_name }}, sans engagement`

```
Bonjour,

Dernier message de ma part, avec trois façons d'essayer sans risque :

- Répondez « oui vidéo » : un de nos créateurs tourne une vidéo pour l'un de vos produits avant toute commande. Vous la regardez, vous ne payez que si vous la gardez.
- Répondez « oui » : je vous prépare un brief pour l'un de vos produits (angle, accroche des trois premières secondes, format, budget indicatif), sous 48 heures, à vous que vous l'utilisiez chez nous ou ailleurs.
- Pas de budget vidéo pour l'instant ? Vous pouvez rémunérer le créateur avec votre produit offert.

Chaque vidéo vient avec son contrat de droits : durée, supports, territoire. Vous savez toujours jusqu'à quand vous pouvez la diffuser.

Votre compte marque se crée ici, en deux minutes : {{ signup_link }}

Si le sujet n'est pas d'actualité, répondez « plus tard » et je reviens vers vous dans quelques mois ; « non merci » et je n'insiste pas.

Bien cordialement,

{{name_of_sender}}
NeedCreator · https://needcreator.com

Vous recevez ce message sur l'adresse de contact publique de {{ company_name }}, dans un cadre strictement professionnel. Un clic pour ne plus rien recevoir : Se désinscrire.
```

---

## 4. Message privé aux marques (consigne de l'IA, file du jour)

Aujourd'hui : accroche + « ce n'est pas une demande de collaboration, c'est une plateforme où des créateurs tournent vos publicités » + question
sur le bon interlocuteur. **On garde la structure** (elle obtient des réponses), on change la phrase du milieu.

**Appliqué** (la phrase finale, rodée sur le terrain depuis le 26/09, est gardée telle quelle ; seule la présentation change) :
> Bonjour, j'ai vu votre publicité pour [produit]. Un de nos créateurs l'ouvrirait ainsi : « [accroche] ». Je ne suis pas créatrice : je m'occupe de NeedCreator, qui repère les publicités qui marchent dans votre secteur et les fait tourner par des créateurs vérifiés, payées seulement si elles vous conviennent. J'en ai deux autres, tournables sous dix jours par un créateur vérifié : à quelle adresse puis-je vous les envoyer ?

**Test depuis le 08/10/2026** : une marque sur deux reçoit, quand un concurrent a été trouvé chez Meta, la version « concurrent » :
> Bonjour, j'ai vu votre publicité pour votre sérum. Un de nos créateurs l'ouvrirait ainsi : « Mes yeux tiraient chaque matin ». Je m'occupe de NeedCreator, qui repère les publicités qui marchent dans votre secteur et les fait tourner par des créateurs vérifiés. J'ai relevé les publicités de Typology qui tournent depuis le plus longtemps : à quelle adresse puis-je vous les envoyer ?

L'autre moitié garde le message ci-dessus. Quand la marque donne son adresse, l'email proposé contient le lien vers les publicités de ce
concurrent, puis celui de l'audit de ses propres publicités. Résultat du test en haut de la file du jour (réponses par version) : décider
au bout de deux semaines, avec au moins 30 messages par version.

---

## 5. Commentaire sous une demande dans un groupe Facebook (consigne de l'IA)

Seule la phrase qui présente NeedCreator change. Aujourd'hui : « C'est ce que propose NeedCreator, plateforme française de vidéos UGC. »
Demain :
> NeedCreator, plateforme française qui aide les marques à savoir quelles vidéos tourner et les fait tourner par des créateurs.

(Le reste du commentaire, qui répond au besoin exprimé, ne change pas.)

---

## 6. Annonces aux inscrits (Admin → Messages aux inscrits)

### Aux marques inscrites

**Objet** : `Nouveau : les publicités de vos concurrents, et l'audit des vôtres`

```
Bonjour {{prenom}},

Deux outils sont arrivés dans votre espace, gratuits :

- Les publicités de vos concurrents : tapez un nom, voyez ses publicités Meta actives de la plus ancienne à la plus récente, les angles qu'il utilise et ceux qu'il laisse libres.
- L'audit de vos publicités : ce qui tient dans la durée, ce que vous répétez, ce que vous n'avez pas encore essayé, et trois vidéos créateur à commander.

Chaque idée se transforme en brief en un clic.

À essayer depuis votre tableau de bord : https://needcreator.com/dashboard
```

### Aux créateurs inscrits

**Objet** : `Proposez à une marque la version créateur de sa meilleure publicité`

```
Bonjour {{prenom}},

Nouvel outil dans « Vos outils » : scanner une marque. Vous voyez les publicités Meta qu'elle fait tourner depuis des mois, donc celles qui lui rapportent.

Vous avez un de ses produits chez vous ? Tournez votre version de cette publicité et proposez-la depuis la page : elle la reçoit finie, avec votre prix. C'est la candidature spontanée, avec un angle dont vous savez qu'il marche.

À essayer ici : https://needcreator.com/publicites-concurrents
```

---

## 7. Kit réseaux sociaux · trois publications

**LinkedIn · 1**
> Une publicité qu'une marque maintient trois mois est une publicité qui lui rapporte.
> Elles sont toutes publiques, dans la bibliothèque de Meta. Introuvables à la main.
> On a fait l'outil : tapez le nom d'un concurrent, voyez ses publicités de la plus ancienne à la plus récente, les angles qu'il utilise, ceux qu'il laisse libres. Gratuit, sans compte.
> 👉 needcreator.com/publicites-concurrents

**LinkedIn · 2**
> Vos publicités qui durent ont un point commun. Vous le connaissez ?
> L'audit créatif de NeedCreator lit vos publicités Meta actives : ce qui tient, ce que vous répétez, ce que vous n'avez pas essayé. Et trois vidéos créateur à tourner ensuite.
> Rien à connecter. 👉 needcreator.com/audit-publicites

**Instagram (carrousel, 4 visuels de texte)**
> 1. « Cette publicité tourne depuis 106 jours. »
> 2. « Une pub qu'on garde, c'est une pub qui rapporte. »
> 3. « Voyez celles de vos concurrents, en un nom. »
> 4. « needcreator.com/publicites-concurrents · gratuit »

(Le chiffre de 106 jours vient du scan réel de Respire. Ne pas nommer la marque sans son accord.)

---

## Ce que je change une fois les textes validés

- Accueil et page Marques : en-têtes, bandeau des quatre étapes, boutons, descriptions Google.
- Consignes de l'IA : message privé aux marques, commentaire des groupes Facebook.
- `docs/MAILING-prospection.md` : les trois emails marques remplacés (l'ancienne version gardée en dessous, datée).
- Les annonces aux inscrits : je les prépare dans « Messages aux inscrits », c'est vous qui cliquez sur Envoyer.

## Mises à jour faites ensuite (07/10/2026)

- **Page « Comment ça marche »** refaite côté marques sur les quatre étapes ; côté créateurs, une étape « proposer une vidéo déjà tournée » (scan d'une marque + candidature spontanée).
- **Messages déjà rédigés, pas encore envoyés** : script `backend/scripts/update-brand-messages.mjs` (simulation par défaut, `--apply` pour agir). Il remplace la phrase qui présente NeedCreator dans les messages privés des fiches marques jamais contactées, et dans les commentaires proposés sous les demandes de marques encore « à répondre » quand ils reprennent la formule exacte. Rien n'est touché sur ce qui est déjà parti.
