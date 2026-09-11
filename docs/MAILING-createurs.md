# Campagne d'emails : recrutement des créateurs référencés

Séquence de trois emails destinée aux créateurs importés dans l'annuaire (Administration → Créateurs référencés → Export CSV). Rédigée le 11 septembre 2026.

## Règles d'envoi

- **Source** : export CSV admin, pays FR (puis BE, CH), abonnés ≥ 2 000. L'export exclut automatiquement les retirés et les inscrits.
- **Expéditeur** : une personne, pas un robot. `Ghislain de NeedCreator <ghislain@needcreator.com>` (l'adresse doit exister et être relevée : les réponses arrivent).
- **Volume** : 50 à 100 envois par jour la première semaine, puis doublement si le taux de plaintes reste sous 0,1 %.
- **Jours et heures** : mardi ou jeudi, 10 h à 12 h, ou 18 h.
- **Forme** : texte simple, pas de bannière, un seul lien d'action par email, signature courte. Pas de pièce jointe.
- **Mentions obligatoires** dans chaque email : d'où vient l'adresse, lien de désinscription (celui de l'outil de mailing), et le lien de retrait de la fiche (colonne `retrait` du CSV).
- **Après chaque envoi** : réimporter les désabonnés dans l'admin (« Marquer comme retirés »), pour que la plateforme et l'outil restent alignés.
- **Prérequis** : au moins une campagne réelle publiée (la campagne NeedCreator) avant le premier envoi.

Variables du CSV utilisables : `{{prenom}}`, `{{pseudo}}`, `{{niche}}`, `{{abonnes}}`, `{{fiche}}`, `{{retrait}}`.

Lien d'inscription à utiliser : `https://needcreator.com/register?role=creator&from={{pseudo}}` (le paramètre permet de rattacher l'inscription à la fiche référencée). Pour un lien « en savoir plus » sans inscription immédiate : `https://needcreator.com/createurs` (page dédiée aux créateurs).

---

## Email 1 — J0 : l'invitation

**Objet** (choisir, tester les deux) :
- `{{prenom}}, des marques cherchent des créateurs {{niche}} comme vous`
- `Une mission vidéo payée pour {{pseudo}} ?`

**Corps :**

> Bonjour {{prenom}},
>
> Je m'appelle Ghislain, je lance NeedCreator, une plateforme française qui met en relation des marques et des créateurs de contenu pour des vidéos UGC (témoignages, unboxings, démos), publiées sur les réseaux des marques.
>
> Je suis tombé sur votre profil @{{pseudo}} en préparant le lancement, et votre univers {{niche}} correspond exactement à ce que nos premières marques recherchent.
>
> Ce qui change avec NeedCreator :
> - **Vous fixez votre prix.** Chaque campagne, vous envoyez un devis ; la marque accepte ou non.
> - **Vous êtes payé, c'est garanti.** Le montant est bloqué par la marque avant que vous tourniez. Vous recevez 90 % de votre devis dès validation, ou automatiquement sous 7 jours si la marque ne répond pas.
> - **Un contrat clair.** Durée et supports d'utilisation de vos vidéos sont écrits dans un contrat généré à chaque mission.
>
> Une première campagne est déjà ouverte, et les marques que nous accompagnons publient les leurs dans les prochains jours. L'inscription est gratuite et prend cinq minutes : trois vidéos de portfolio suffisent.
>
> → Créer mon profil créateur : https://needcreator.com/register?role=creator&from={{pseudo}}
>
> Si vous avez une question, répondez simplement à cet email, je lis tout.
>
> Ghislain
> NeedCreator
>
> ---
> Vous recevez cet email parce que votre profil public figure dans notre annuaire de créateurs ({{fiche}}). Pour ne plus recevoir nos emails : [se désinscrire]. Pour retirer votre fiche de l'annuaire : {{retrait}}

---

## Email 2 — J+7, aux non-inscrits : la preuve et le programme Ambassadeur

**Objet** :
- `{{prenom}}, voici à quoi ressemble une mission sur NeedCreator`
- `Des campagnes en avant-première pour {{pseudo}}`

**Corps :**

> Bonjour {{prenom}},
>
> Je vous ai écrit la semaine dernière au sujet de NeedCreator. Un exemple concret vaut mieux qu'une présentation : voici une campagne actuellement ouverte.
>
> **[Titre de la campagne]** — [nom de la marque]
> [Nombre] vidéo(s) [type], [durée] secondes, budget indicatif [montant] € par vidéo, droits [durée des droits] sur [supports].
> → Voir la campagne : https://needcreator.com/campaigns/[id]
>
> Et si vous aimez parler de ce qui vous fait gagner votre vie, nous avons un programme pour vous. Publiez sur vos réseaux une vidéo sincère qui explique ce que NeedCreator vous apporte, et vous devenez **Ambassadeur** :
> - vous voyez chaque nouvelle campagne **24 heures avant tout le monde** ;
> - vos devis remontent **en tête** chez les marques, et votre profil en tête de notre annuaire ;
> - votre lien de parrainage vous rapporte **10 € par créateur inscrit** qui livre sa première mission.
>
> → Créer mon profil (5 minutes) : https://needcreator.com/register?role=creator&from={{pseudo}}
>
> Ghislain
> NeedCreator
>
> ---
> Votre profil public figure dans notre annuaire ({{fiche}}). [Se désinscrire] · Retirer ma fiche : {{retrait}}

Remplacez les crochets par une vraie campagne (Administration → Campagnes). Si aucune campagne n'a de budget affiché, utilisez la fourchette de prix suggérée du formulaire.

---

## Email 3 — J+21, aux non-inscrits : le dernier

**Objet** :
- `Dernier message, {{prenom}}`
- `Je ferme la porte (mais elle reste entrouverte)`

**Corps :**

> Bonjour {{prenom}},
>
> C'est mon dernier email : je ne veux pas encombrer votre boîte.
>
> Depuis mon premier message, [N] créateurs se sont inscrits et [N] campagnes ont été publiées. Si le moment n'est pas le bon, aucun souci. Si vous voulez essayer, votre profil est prêt à être créé en cinq minutes, et votre premier devis peut partir le jour même.
>
> → https://needcreator.com/register?role=creator&from={{pseudo}}
>
> Merci pour votre attention, et bonne continuation pour @{{pseudo}}.
>
> Ghislain
> NeedCreator
>
> ---
> [Se désinscrire] · Retirer ma fiche de l'annuaire : {{retrait}}

Mettez de vrais chiffres, même modestes (« 12 créateurs, 4 campagnes ») : un chiffre honnête convainc plus qu'un superlatif.

---

## Après l'inscription

La plateforme envoie déjà un email de bienvenue et l'email de confirmation d'adresse. Le créateur voit ensuite sur son tableau de bord les étapes à compléter (3 vidéos, informations administratives, compte Stripe) et le bloc Ambassadeur. Pas d'email supplémentaire à prévoir dans l'outil de mailing.

## Indicateurs à suivre

| Indicateur | Objectif raisonnable sur liste froide |
|---|---|
| Ouverture | 20 à 30 % |
| Clic | 3 à 6 % |
| Inscription | 2 à 5 % des envois |
| Plaintes | < 0,1 % (au-delà, réduire le volume) |

Les inscriptions issues de la liste sont visibles dans Administration → Créateurs référencés (« Inscrits sur NeedCreator »).
