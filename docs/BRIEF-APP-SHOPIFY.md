# App Shopify de rappels de réachat : brief d'architecture

Brief court à donner à une autre IA ou à un développeur. Rédigé le 29/09/2026, mis à jour le 03/10/2026 (hébergement, prompt de démarrage).
À transmettre avec le document d'analyse « App Shopify de rappels de réachat — Analyse concurrentielle & MVP », dont la section
« Architecture technique » est alignée sur ce brief.

## Prompt de démarrage, à coller tel quel dans la session de construction

```
Tu construis une application Shopify de rappels de réachat, dans un nouveau dépôt vide.
Deux documents font référence, lis-les en entier avant d'écrire quoi que ce soit :
  1. le brief d'architecture (ce fichier, BRIEF-APP-SHOPIFY.md) : pile, hébergement, données, règles d'envoi, méthodes ;
  2. le document d'analyse « App Shopify de rappels de réachat — Analyse concurrentielle & MVP » : périmètre, concurrents,
     plans tarifaires, ce que l'app fait et ne fait pas.
En cas de contradiction, le brief l'emporte sur la technique, le document d'analyse sur le fonctionnel.

Je ne suis pas développeur. Pendant le travail, n'affiche pas de code dans la conversation : dis-moi où tu en es en quelques
phrases, et pose-moi seulement les questions dont la réponse change ce que tu vas faire. Une question de ma part appelle une
réponse, pas une modification : tu ne changes le code que quand je dis « ok vas y ».

Ordre des étapes, une à la fois, chacune testée avant la suivante :
  1. Squelette depuis le modèle officiel Shopify (React Router, Polaris, App Bridge), sessions dans MongoDB par le connecteur
     officiel, variables d'environnement documentées dans un fichier d'exemple, jamais de secret dans le dépôt.
  2. Installation sur une boutique de développement : connexion, désinstallation, les trois traitements RGPD obligatoires.
  3. Import des commandes des douze derniers mois à l'installation, sans déclencher aucun rappel en retard.
  4. Calcul de l'intervalle médian de réachat par produit et par client ; délai par défaut réglable par catégorie, puis par produit.
  5. Programmation des rappels à venir ; état de chaque rappel (prévu, envoyé, cliqué, commandé, annulé).
  6. Envoi des emails : une seule fois par rappel, plafond par destinataire, délai minimum entre deux envois, adresses refusées
     comptées, consentement marketing respecté, modèles natifs en français et en anglais d'abord.
  7. Écran dans l'admin Shopify : réglages, liste des rappels, chiffres simples (envoyés, cliqués, commandes).
  8. Lecture du plan actif (Shopify App Pricing) pour appliquer la limite de rappels par mois.
  9. Script de déploiement unique pour le VPS (PM2, Nginx, Cloudflare), sur le même serveur que NeedCreator, processus et base à part.
 10. Site minimal et fiche App Store : une page d'accueil, la politique de confidentialité, les conditions d'utilisation, une page de
     contact et de support (adresse email), en anglais et en français, servies par la même app sur son sous-domaine ; puis les
     éléments de la fiche App Store (nom, description courte et longue, captures d'écran de l'écran admin, catégorie, plans) rédigés
     en anglais dans un fichier du dépôt, prêts à coller dans le tableau de bord Partner. La revue Shopify exige l'adresse de support
     et la politique de confidentialité : elles doivent être en ligne avant la soumission.

Règles permanentes : une suite de tests de bout en bout contre une fausse boutique et de fausses notifications, lancée avant chaque
livraison ; chaque notification Shopify est vérifiée par sa signature, enregistrée puis traitée ensuite, et une notification reçue
deux fois n'est traitée qu'une fois ; les réglages sont dans l'app, jamais en dur ; chaque message d'erreur est rédigé pour quelqu'un
qui n'a pas vu le code ; code en anglais, commentaires et textes d'interface en français ; les exigences de Shopify évoluent, vérifie
dans leur documentation le modèle officiel en vigueur, le connecteur MongoDB et les conditions de revue avant la première étape.

Commence par l'étape 1 et dis-moi quand elle est prête à être testée.
```

## Contexte

Le porteur du projet a construit NeedCreator, une plateforme web en production. Il veut reprendre la même infrastructure pour cette app,
afin de garder ses habitudes de déploiement et d'exploitation.

## Décision d'architecture

Le modèle officiel d'app Shopify, installé sur l'infrastructure habituelle du porteur, avec MongoDB.

| Ce qui vient de Shopify | Ce qui vient de NeedCreator |
|---|---|
| Écran dans l'admin | Serveur VPS, Nginx, PM2, Cloudflare |
| Connexion intégrée | MongoDB avec Mongoose |
| Facturation (Shopify App Pricing) | Tâches planifiées |
| Traitements RGPD | Envoi d'emails |
| Apparence (Polaris) | Tests, réglages, déploiement |

## Pile technique

- Node.js 22, modules ES
- Modèle officiel Shopify (React Router, Polaris, App Bridge)
- MongoDB avec Mongoose pour les données de l'app
- Sessions Shopify rangées dans MongoDB, par le connecteur officiel
- Admin API GraphQL de Shopify
- Validation des entrées avec Joi ou Zod
- Emails transactionnels par un fournisseur reconnu

## Facturation

Shopify App Pricing : les plans et leurs prix se configurent dans le tableau de bord Partner. Aucun code de facturation à écrire.
L'app lit seulement le plan actif de la boutique, pour appliquer ses limites (nombre de rappels par mois).

## Hébergement

- Décision du 29/09/2026 : **le même VPS que NeedCreator au départ** (Union européenne, 7,8 Go de mémoire dont 11 % utilisés, 96 Go de
  disque). Un processus PM2 à part, un sous-domaine à part, une base MongoDB à part sur la même instance.
- Séparer les serveurs seulement si le volume le demande : l'app reçoit une notification par commande de chaque boutique, un pic ne
  doit pas ralentir l'autre produit. À surveiller à partir de quelques dizaines de boutiques.
- PM2 pour faire tourner l'app, Nginx en frontal, Cloudflare devant
- HTTPS obligatoire
- Déploiement par un script shell unique, lancé à la main

## Ne pas refaire à la main

L'écran intégré à l'admin, la connexion, les trois traitements RGPD obligatoires et la gestion des désinstallations sont fournis par le
modèle officiel. Les réécrire avec Express ajouterait une à deux semaines et un risque de refus à la revue de l'App Store.

## Contraintes propres à Shopify

- Répondre vite aux notifications : enregistrer, répondre, traiter ensuite
- Une même notification peut arriver deux fois : la traiter une seule fois
- Vérifier la signature de chaque notification
- Respecter le consentement marketing du client final
- Supprimer les données d'une boutique à sa désinstallation

## Données principales

- Boutique : domaine, jeton, langue, plan actif, réglages
- Produit : catégorie, délai de réachat par défaut ou réglé à la main
- Client final : consentement, langue, intervalle médian d'achat
- Commande : produits, date, lien éventuel avec un rappel
- Rappel : client, produit, date prévue, état, envoi, clic, commande

Chaque enregistrement porte l'identifiant de sa boutique.

## Envoi d'emails : le point critique

Les deux plaintes relevées chez les concurrents portent sur des emails non envoyés ou envoyés en rafale. Règles éprouvées sur NeedCreator :

- Chaque rappel n'est envoyé qu'une fois : l'envoi est noté sur l'enregistrement avant de passer au suivant
- Une adresse refusée est comptée, pour ne pas être retentée sans fin
- Plafond de rappels par destinataire, délai minimum entre deux envois
- À l'installation, l'import de 12 mois de commandes ne doit déclencher aucun rappel en retard : seuls les rappels à venir sont programmés
- Domaine d'envoi authentifié (SPF, DKIM, DMARC) et vieilli avant le volume

## Méthodes de travail à reprendre

- Une suite de tests de bout en bout avant chaque livraison, contre un serveur isolé, avec une fausse boutique et de fausses notifications
- Les réglages (délais, plafonds, textes) dans l'administration, jamais en dur dans le code
- Chaque message d'erreur rédigé pour quelqu'un qui n'a pas vu le code
- Scripts de maintenance en simulation par défaut, application sur option
- Code en anglais, commentaires et textes d'interface en français

## Multilingue

Modèles d'emails natifs en français, anglais, allemand, espagnol et italien. L'email part dans la langue du client final.

## Déjà pratiqué sur NeedCreator

Une intégration Shopify existe (`backend/src/services/shopify.js`) : installation OAuth, vérification HMAC, état signé, lecture des
produits. La logique est connue.

## Distribution et paiement

L'app se vend dans Shopify, pas en dehors : le marchand l'installe depuis l'App Store (ou par un lien direct), choisit un plan sur la
page de Shopify App Pricing et paie sur sa facture Shopify ; Shopify reverse au partenaire. Aucun paiement à coder. La publication
passe par une revue Shopify (une à trois semaines). Le site minimal et la fiche App Store de l'étape 10 servent à cette revue et à la
crédibilité ; la vente se fait par l'App Store et, au début, par la prospection directe des marchands (playbook séparé).

## Prospection de la semaine 1

Le plan prévoit de contacter 120 à 150 boutiques. L'outil de prospection du même porteur fait déjà ce travail : bibliothèque publicitaire
Meta, recherche de l'email sur le site, contacts LinkedIn, file quotidienne de messages privés. Il peut servir tel quel pour cette validation.

## À vérifier au moment de construire

Les exigences de Shopify évoluent. Revérifier dans leur documentation : le modèle officiel en vigueur, le connecteur MongoDB pour les
sessions, le fonctionnement de Shopify App Pricing, les conditions de la revue.
