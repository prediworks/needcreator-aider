# Campagne d'emails : recrutement des créateurs référencés

Séquence de trois emails destinée aux créateurs importés dans l'annuaire (Administration → Créateurs référencés → Export CSV). Rédigée le 11 septembre 2026, refondue le 15 septembre 2026 pour intégrer les outils créateur (prospection, devis et contrats, registre des droits, revenus et seuils, calculateur de tarif), l'académie et la commission Ambassadeur.

## Règles d'envoi

- **Source** : export CSV admin, pays FR (puis BE, CH), abonnés ≥ 2 000. L'export exclut automatiquement les retirés et les inscrits.
- **Expéditeur** : une personne, pas un robot. `{{name_of_sender}} de NeedCreator <prenom@needcreator.com>` (l'adresse doit exister et être relevée : les réponses arrivent).
- **Volume** : 50 à 100 envois par jour la première semaine, puis doublement si le taux de plaintes reste sous 0,1 %.
- **Jours et heures** : mardi ou jeudi, 10 h à 12 h, ou 18 h.
- **Forme** : texte simple, pas de bannière, un seul lien d'action par email, signature courte. Pas de pièce jointe.
- **Coller du texte brut dans l'outil de mailing.** Les corps d'email ci-dessous ne contiennent volontairement ni gras, ni flèche, ni emoji : collés tels quels, les marqueurs de gras apparaissent sous forme d'astérisques (`**`) et les caractères spéciaux deviennent des « ? » chez le destinataire (constaté le 20/09/2026). Si vous voulez du gras, appliquez-le avec l'éditeur de l'outil. Traduisez aussi le lien de désinscription de l'outil (« Click Here to Unsubscribe » par défaut) en « Se désinscrire ».
- **Mentions obligatoires** dans chaque email : d'où vient l'adresse, lien de désinscription (celui de l'outil de mailing), et le lien de retrait de la fiche (colonne `retrait` du CSV).
- **Après chaque envoi** : réimporter les désabonnés dans l'admin (« Marquer comme retirés »), pour que la plateforme et l'outil restent alignés.
- **Prérequis** : au moins une campagne réelle publiée avant le premier envoi. Les campagnes publiées sont visibles sans connexion sur https://needcreator.com/campagnes : c'est la preuve à montrer.

## Variables de l'outil de mailing

| Variable | Contenu | Colonne du CSV |
|---|---|---|
| `{{name_of_sender}}` | Prénom de l'expéditeur | (réglage de l'outil) |
| `{{ first_name }}` | Prénom du créateur | `prenom` |
| `{{ username }}` | Pseudo (sans le @) | `pseudo` |
| `{{ niche }}` | Niche principale | `niche` |
| `{{ fiche }}` | Lien de la fiche publique dans l'annuaire | `fiche` |
| `{{ retrait }}` | Lien de retrait de la fiche | `retrait` |

Si l'outil ne reprend pas `fiche` et `retrait`, importez ces deux colonnes du CSV comme champs personnalisés : elles sont obligatoires pour la mention de fin d'email.

Liens à utiliser :
- Inscription : `https://needcreator.com/register?role=creator&from={{ username }}` (le paramètre rattache l'inscription à la fiche référencée).
- Présentation sans inscription : `https://needcreator.com/createurs` ; les outils : `https://needcreator.com/createurs#outils`.
- Calculateur de tarif, accessible sans compte : `https://needcreator.com/calculateur-tarif-ugc`.
- Campagnes ouvertes, visibles sans compte : `https://needcreator.com/campagnes`.

Les chiffres cités (commission 10 %, Ambassadeur 8 %, validation sous 7 jours, 24 h d'avant-première, 10 € de parrainage) sont ceux des réglages de l'admin au 15 septembre 2026 : vérifiez-les avant chaque envoi.

---

## Email 1 — J0 : l'invitation

**Objet** (choisir, tester les deux) :
- `{{ first_name }}, des marques cherchent des créateurs {{ niche }} comme vous`
- `Une mission vidéo payée pour @{{ username }} ?`

**Corps :**

> Bonjour {{ first_name }},
>
> Je m'appelle {{name_of_sender}}, je lance NeedCreator, une plateforme française qui met en relation des marques et des créateurs de contenu pour des vidéos UGC (témoignages, unboxings, démos), diffusées sur les réseaux et les publicités des marques. Pas besoin d'audience : les marques regardent votre portfolio, pas vos abonnés.
>
> Je suis tombé sur votre profil @{{ username }} en préparant le lancement, et votre univers {{ niche }} correspond à ce que nos premières marques recherchent.
>
> Ce qui change avec NeedCreator :
> - Vous fixez votre prix. Chaque campagne, vous envoyez un devis ; la marque accepte ou non. Un calculateur vous donne une fourchette si vous hésitez.
> - Vous êtes payé, c'est garanti. Le montant est bloqué par la marque avant que vous tourniez. Vous recevez 90 % de votre devis dès validation, ou automatiquement sous 7 jours si la marque ne répond pas.
> - Un contrat clair. Durée, supports et exclusivité sont écrits dans un contrat généré à chaque mission, et vous êtes prévenu quand les droits expirent : la marque vous rachète une prolongation.
> - Zéro paperasse. Vos factures sont émises en votre nom, avec un relevé mensuel pour votre comptable.
>
> Des campagnes sont déjà ouvertes, vous pouvez les voir sans compte : https://needcreator.com/campagnes
>
> L'inscription est gratuite et prend cinq minutes : trois vidéos de portfolio suffisent.
>
> Créer mon profil créateur : https://needcreator.com/register?role=creator&from={{ username }}
>
> Si vous avez une question, répondez simplement à cet email, je lis tout.
>
> {{name_of_sender}}
> NeedCreator
>
> ---
> Vous recevez cet email parce que votre profil public figure dans notre annuaire de créateurs ({{ fiche }}). Pour ne plus recevoir nos emails : [se désinscrire]. Pour retirer votre fiche de l'annuaire : {{ retrait }}

---

## Email 2 — J+7, aux non-inscrits : les outils, même sans mission chez nous

L'angle change : on ne vend plus des missions, on offre des outils utiles dès aujourd'hui pour les clients que le créateur a déjà.

**Objet** :
- `{{ first_name }}, vos devis et contrats en un clic (même pour vos clients actuels)`
- `Un client vous paie en retard, @{{ username }} ?`

**Corps :**

> Bonjour {{ first_name }},
>
> Je vous ai écrit la semaine dernière au sujet de NeedCreator. Aujourd'hui, un autre angle : même si vous ne prenez aucune mission chez nous, votre compte vous donne des outils gratuits pour votre activité actuelle.
>
> - Devis et contrat en un clic. Un client vous contacte en direct ? Vous décrivez la mission, NeedCreator génère le devis PDF et le contrat de cession de droits, et les envoie au client. Il peut payer via la plateforme : le montant est bloqué avant que vous tourniez et vous est versé à la validation. Fini les factures impayées. S'il paie en direct, rien à payer, vous facturez vous-même.
> - Suivi de prospection. Les marques que vous démarchez, avec une relance à date : vous êtes prévenu le jour même.
> - Registre de vos droits et exclusivités. Tout ce que vous avez cédé, ici ou ailleurs, avec un rappel 30 jours avant la fin des droits pour proposer un renouvellement, et le jour où une exclusivité se termine.
> - Revenus et seuils micro-entreprise. Vos revenus NeedCreator et les autres au même endroit, franchise de TVA et plafond calculés sur le total.
> - Calculateur de tarif. Une fourchette selon le type de vidéo, les droits, les supports et l'exclusivité, à partir des devis réellement acceptés. Essayez-le sans compte : https://needcreator.com/calculateur-tarif-ugc
>
> Tout est inclus, sans abonnement. La commission de 10 % ne s'applique que si un client choisit de payer via NeedCreator.
>
> Créer mon profil (5 minutes) : https://needcreator.com/register?role=creator&from={{ username }}
>
> {{name_of_sender}}
> NeedCreator
>
> ---
> Votre profil public figure dans notre annuaire ({{ fiche }}). [Se désinscrire] · Retirer ma fiche : {{ retrait }}

---

## Email 3 — J+21, aux non-inscrits : la preuve, l'Ambassadeur, et le dernier

**Objet** :
- `Dernier message, {{ first_name }}`
- `Commission à 8 % et campagnes en avant-première pour @{{ username }}`

**Corps :**

> Bonjour {{ first_name }},
>
> C'est mon dernier email : je ne veux pas encombrer votre boîte.
>
> Depuis mon premier message, [N] créateurs se sont inscrits et [N] campagnes ont été publiées. Un exemple parmi celles qui sont ouvertes :
>
> [Titre de la campagne] — [nom de la marque]
> [Nombre] vidéo(s) [type], [durée] secondes, [budget indicatif ou « devis libre »], droits [durée] sur [supports].
> Voir la campagne : https://needcreator.com/campagnes/[id]
>
> Deux choses à savoir avant de décider :
> - Une académie gratuite de cinq guides courts (lire un brief, lumière, son, les trois premières secondes, rédiger un devis). Trois quiz réussis vous donnent le badge Formé, un coup de pouce dans le classement des candidatures, et un badge à partager sur vos réseaux.
> - Le programme Ambassadeur. Publiez sur vos réseaux une vidéo sincère sur ce que NeedCreator vous apporte : votre commission passe à 8 % au lieu de 10 %, vous voyez chaque campagne 24 heures avant tout le monde, vos devis remontent en tête chez les marques, et votre lien de parrainage vous rapporte 10 € par créateur inscrit qui livre sa première mission.
>
> Si le moment n'est pas le bon, aucun souci. Sinon, votre profil est prêt à être créé en cinq minutes, et votre premier devis peut partir le jour même.
>
> https://needcreator.com/register?role=creator&from={{ username }}
>
> Merci pour votre attention, et bonne continuation pour @{{ username }}.
>
> {{name_of_sender}}
> NeedCreator
>
> ---
> [Se désinscrire] · Retirer ma fiche de l'annuaire : {{ retrait }}

Remplacez les crochets par de vrais chiffres, même modestes (« 12 créateurs, 4 campagnes »), et par une vraie campagne publiée (Administration → Campagnes, ou la page publique https://needcreator.com/campagnes). Un chiffre honnête convainc plus qu'un superlatif.

---

## Après l'inscription

La plateforme envoie déjà un email de bienvenue et l'email de confirmation d'adresse. Le créateur voit ensuite sur son tableau de bord une seule prochaine étape à la fois (3 vidéos, informations administratives, compte Stripe), la carte des outils (prospection, devis, droits, calculateur) et le bloc Ambassadeur. Pas d'email supplémentaire à prévoir dans l'outil de mailing.

## Indicateurs à suivre

| Indicateur | Objectif raisonnable sur liste froide |
|---|---|
| Ouverture | 20 à 30 % |
| Clic | 3 à 6 % |
| Inscription | 2 à 5 % des envois |
| Plaintes | < 0,1 % (au-delà, réduire le volume) |

Les inscriptions issues de la liste sont visibles dans Administration → Créateurs référencés (« Inscrits sur NeedCreator »).
