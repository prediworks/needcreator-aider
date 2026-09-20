# Séquences d'emails de prospection (agents de prospection → outil de mailing)

Deux séquences, à créer dans l'outil de mailing (SalesBlink) et à **rattacher aux deux listes** que NeedCreator alimente :
« NeedCreator · Prospection créateurs » et « NeedCreator · Prospection marques ». Sans ce rattachement, les contacts arrivent mais aucun email ne part.

Rédigé le 19 septembre 2026. À distinguer de `docs/MAILING-createurs.md`, qui vise les créateurs de l'annuaire référencé (export CSV, autres variables).

## Réglages de la séquence dans l'outil

- **Déclencheur** : tout contact ajouté à la liste entre dans la séquence.
- **Arrêt automatique** : sur réponse, sur désinscription, sur rebond. NeedCreator retire aussi de la séquence les prospects qui s'inscrivent.
- **Expéditeur** : une personne, `{{name_of_sender}} de NeedCreator`, depuis une adresse réelle et relevée. Les réponses reviennent dans Admin → Prospection, classées par l'IA.
- **Jours et heures** : du mardi au jeudi, entre 9 h 30 et 11 h 30. Pas d'envoi le week-end.
- **Volume** : 20 à 30 par jour la première semaine, 50 ensuite. La pause automatique de NeedCreator se déclenche au-delà de 5 % de rebonds.
- **Forme** : texte simple, pas d'image, pas de pièce jointe, un seul lien par email, signature de deux lignes.
- **Mention obligatoire en pied de chaque email** (déjà incluse dans les textes) : d'où vient l'adresse, et le lien de désinscription de l'outil.
- **Suivi des ouvertures** : à désactiver si l'outil le permet. Il dégrade la délivrabilité et n'apporte rien à cette étape.

## Variables envoyées par NeedCreator

| Variable | Contenu | Créateurs | Marques |
|---|---|---|---|
| `{{ greeting }}` | « Bonjour Marie, » ou « Bonjour, » si le prénom est inconnu | oui | oui (« Bonjour, ») |
| `{{ first_name }}` | Prénom, vide s'il n'est pas sûr | oui | vide |
| `{{ username }}` | Pseudo sans le @ | oui | — |
| `{{ niche }}` | Niche (créateur) ou secteur (marque) | oui | oui |
| `{{ paragraph }}` | Deux phrases personnalisées écrites par l'IA d'après la bio ou l'activité | oui | oui |
| `{{ company_name }}` | Nom de la marque | — | oui |
| `{{ website }}` | Site de la marque | — | oui |
| `{{ signup_link }}` | Lien d'inscription rattaché au prospect | oui | oui |
| `{{name_of_sender}}` | Prénom de l'expéditeur | réglage de l'outil | réglage de l'outil |

**Important pour les contacts déjà envoyés avant le 19/09/2026** : ils n'ont pas la variable `{{ greeting }}`, et leur `{{ first_name }}` peut
contenir un pseudo (« ugcbymarie »). Pour cette première vague, **commencez les emails par « Bonjour, » écrit en dur**, comme dans les textes
ci-dessous. Vous pourrez passer à `{{ greeting }}` quand cette première vague sera écoulée.

`{{ paragraph }}` est le cœur de la personnalisation. S'il est vide pour un contact, l'email reste correct : la phrase suivante enchaîne seule.

---

# Séquence créateurs · 3 emails

Cible : créateurs UGC débutants ou confirmés, trouvés sur YouTube et Instagram. Ils cherchent des missions, pas un discours. Ton direct, tutoiement proscrit.

## Créateurs · Email 1 · jour 0

**Objet** (tester les deux) :
- `Des missions UGC payées pour @{{ username }}`
- `{{ niche }} : des marques cherchent des créateurs comme vous`

```
Bonjour,

{{ paragraph }}

Je m'appelle {{name_of_sender}}, je lance NeedCreator, une plateforme française qui met en relation des marques et des créateurs pour des vidéos UGC : témoignages, unboxings, démonstrations. Pas besoin d'audience, les marques regardent votre portfolio.

Trois choses qui changent par rapport à ce que vous connaissez :
- Vous fixez votre prix. Vous envoyez un devis pour chaque campagne, la marque accepte ou non.
- Le paiement est bloqué avant que vous tourniez. Vous touchez 90 % de votre devis à la validation, ou automatiquement sous 7 jours si la marque ne répond pas.
- Un contrat de cession de droits est généré à chaque mission : durée, supports, exclusivité. Vous êtes prévenu quand les droits expirent.

Les campagnes ouvertes sont visibles sans compte : https://needcreator.com/campagnes

Si cela vous parle, l'inscription prend trois minutes : {{ signup_link }}

{{name_of_sender}}
NeedCreator · https://needcreator.com

Vous recevez ce message parce que votre adresse de contact professionnelle est publique sur votre profil de créateur. Un clic pour ne plus rien recevoir : [lien de désinscription de l'outil].
```

## Créateurs · Email 2 · jour 4 · des outils utiles même sans mission

**Objet** : `Un calculateur de tarif UGC, gratuit et sans compte`

```
Bonjour,

Je me permets un second message, avec quelque chose d'utile tout de suite, que vous vous inscriviez ou non.

Combien facturer une vidéo UGC ? Notre calculateur donne une fourchette selon le type de vidéo, la durée des droits, les supports (organique ou publicité) et l'exclusivité : https://needcreator.com/calculateur-tarif-ugc

Et une fois inscrit, les outils servent pour toute votre activité, y compris vos clients trouvés ailleurs :
- devis et contrat de cession de droits en PDF, envoyés à n'importe quelle marque ;
- registre de vos droits et exclusivités, avec rappel avant expiration pour facturer une prolongation ;
- suivi de vos revenus par rapport aux seuils de la micro-entreprise ;
- suivi de prospection, avec relances.

C'est gratuit. Nous ne prenons une commission que sur les missions passées par la plateforme.

Votre lien d'inscription : {{ signup_link }}

{{name_of_sender}}
NeedCreator

Vous recevez ce message parce que votre adresse de contact professionnelle est publique sur votre profil de créateur. Un clic pour ne plus rien recevoir : [lien de désinscription de l'outil].
```

## Créateurs · Email 3 · jour 10 · dernier message

**Objet** : `Je ne vous écris plus après celui-ci`

```
Bonjour,

Dernier message de ma part, promis.

Nous ouvrons NeedCreator avec un petit groupe de créateurs, validés un par un sur leur portfolio. Les premiers inscrits sont ceux que les marques voient en premier, et ceux à qui nous proposons le statut Ambassadeur : commission réduite et accès aux campagnes 24 heures avant les autres.

Si vous voulez en faire partie : {{ signup_link }}

Si ce n'est pas le moment, aucun souci. Une simple réponse « plus tard » et je vous recontacte dans quelques mois ; « non merci » et vous n'entendrez plus parler de nous.

Bonne continuation pour vos vidéos,

{{name_of_sender}}
NeedCreator

Vous recevez ce message parce que votre adresse de contact professionnelle est publique sur votre profil de créateur. Un clic pour ne plus rien recevoir : [lien de désinscription de l'outil].
```

---

# Séquence marques · 3 emails

Cible : PME et marques e-commerce françaises qui diffusent déjà des publicités vidéo. L'adresse est souvent générique (contact@, hello@) : l'email doit
être compris et transmis par quelqu'un qui n'est pas le décideur. Court, concret, sans jargon.

## Marques · Email 1 · jour 0

**Objet** (tester les deux) :
- `Des vidéos UGC pour {{ company_name }}, payées seulement si elles vous conviennent`
- `{{ company_name }} : vos prochaines vidéos publicitaires`

```
Bonjour,

{{ paragraph }}

Je m'appelle {{name_of_sender}}, je lance NeedCreator, une plateforme française de vidéos UGC : des créateurs vérifiés tournent des témoignages, unboxings et démonstrations de vos produits, prêts pour vos publicités et vos réseaux.

Ce qui nous distingue :
- Vous publiez un brief, vous recevez des devis avec le portfolio vidéo de chaque créateur, vous choisissez.
- Vous ne payez qu'à la validation des vidéos. Le prix affiché est le prix payé, sans frais ajoutés.
- Chaque mission génère un contrat de cession de droits : durée, supports, territoire. Plus de flou sur ce que vous avez le droit de diffuser.
- Pas de budget vidéo pour l'instant ? Vous pouvez rémunérer le créateur avec votre produit offert.

Pour voir ce que cela donnerait pour vous, collez le lien d'un de vos produits ici, sans créer de compte : vous obtenez trois angles créatifs, un format et un budget estimé en trente secondes.
https://needcreator.com/brief-depuis-url

Si ce message ne vous concerne pas directement, pourriez-vous le transmettre à la personne en charge du marketing ou des publicités ? Merci d'avance.

{{name_of_sender}}
NeedCreator · https://needcreator.com

Vous recevez ce message sur l'adresse de contact publique de {{ company_name }}, dans un cadre strictement professionnel. Un clic pour ne plus rien recevoir : [lien de désinscription de l'outil].
```

## Marques · Email 2 · jour 4 · le problème des droits

**Objet** : `Savez-vous jusqu'à quand vous pouvez diffuser vos vidéos ?`

```
Bonjour,

Une question que peu de marques se posent avant d'avoir un problème : pour chaque vidéo de créateur que vous diffusez en publicité, savez-vous jusqu'à quelle date vous en avez le droit, et sur quels supports ?

La plupart des collaborations se font par message, sans contrat. Le jour où le créateur réclame un complément, ou où une vidéo tourne encore en publicité après la fin des droits, il n'y a aucun document auquel se référer.

Sur NeedCreator, chaque mission produit un contrat de cession de droits en PDF. Et un registre « Contenus & droits » réunit toutes vos vidéos, y compris celles achetées ailleurs, avec une alerte avant chaque expiration. Il est gratuit : https://needcreator.com/contenus-et-droits

Créer un compte marque prend deux minutes : {{ signup_link }}

{{name_of_sender}}
NeedCreator

Vous recevez ce message sur l'adresse de contact publique de {{ company_name }}, dans un cadre strictement professionnel. Un clic pour ne plus rien recevoir : [lien de désinscription de l'outil].
```

## Marques · Email 3 · jour 9 · dernier message

**Objet** : `Dernier message : un brief offert pour {{ company_name }}`

```
Bonjour,

Dernier message de ma part.

Si vous me répondez simplement « oui », je vous prépare moi-même un brief de campagne pour l'un de vos produits : angle, accroche des trois premières secondes, format, budget indicatif. Vous le recevez sous 48 heures, il est à vous, que vous l'utilisiez chez nous ou ailleurs.

Et si vous préférez avancer seul, votre compte marque se crée ici : {{ signup_link }}

Si le sujet n'est pas d'actualité, répondez « plus tard » et je reviens vers vous dans quelques mois ; « non merci » et je n'insiste pas.

Bien cordialement,

{{name_of_sender}}
NeedCreator

Vous recevez ce message sur l'adresse de contact publique de {{ company_name }}, dans un cadre strictement professionnel. Un clic pour ne plus rien recevoir : [lien de désinscription de l'outil].
```

---

## Ce qui se passe quand quelqu'un répond

1. « Synchroniser » (ou la tâche nocturne) ramène la réponse dans Admin → Prospection, pastille « A répondu ».
2. L'IA la classe (intéressé, question, pas maintenant, refus, ne plus écrire, absence) et propose une réponse.
3. Vous relisez et cliquez « Relire et envoyer » : la réponse part depuis l'expéditeur de l'outil, dans le même fil.
4. Un « oui » à l'email 3 des marques : **le brief est préparé automatiquement** depuis une fiche produit du site de la marque, et la réponse
   proposée contient déjà son lien, plus un lien d'inscription qui crée le compte avec la campagne en brouillon. Vous n'avez qu'à relire et envoyer.
   Si le site est illisible (protection anti-robot) ou inconnu, la réponse proposée ne contient pas le brief : renseignez le site sur la fiche et
   cliquez « Brief offert », ou préparez-le sur `https://needcreator.com/brief-depuis-url` avec la description du produit.
5. « Non merci » et « ne plus écrire » : le prospect passe en Hors cible et sort de la séquence, sans intervention.

## À vérifier avant le premier envoi

- [ ] Les deux séquences sont créées et **rattachées aux deux listes**.
- [ ] L'adresse d'expédition existe, est relevée, et son domaine a SPF, DKIM et DMARC en place (l'outil l'indique dans ses réglages de domaine).
- [ ] `[lien de désinscription de l'outil]` est remplacé par la variable de désinscription de l'outil dans les six emails.
- [ ] Un email de test reçu sur votre propre adresse : variables remplacées, lien d'inscription cliquable, pas de crochets restants.
- [ ] Au moins une campagne réelle publiée sur https://needcreator.com/campagnes, puisque l'email 1 des créateurs y renvoie.
- [ ] Les chiffres cités (90 % du devis, validation sous 7 jours, avant-première de 24 heures) correspondent aux réglages actuels de l'admin.
