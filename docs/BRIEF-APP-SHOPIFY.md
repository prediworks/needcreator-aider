# App Shopify de rappels de réachat : brief d'architecture

Brief court à donner à une autre IA ou à un développeur. Rédigé le 29/09/2026.
À transmettre avec le document d'analyse « App Shopify de rappels de réachat — Analyse concurrentielle & MVP », dont la section
« Architecture technique » est alignée sur ce brief.

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

- Un VPS situé dans l'Union européenne (argument RGPD de l'offre)
- De préférence un serveur distinct de celui de NeedCreator : l'app reçoit une notification par commande de chaque boutique, un pic ne
  doit pas ralentir l'autre produit
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

## Prospection de la semaine 1

Le plan prévoit de contacter 120 à 150 boutiques. L'outil de prospection du même porteur fait déjà ce travail : bibliothèque publicitaire
Meta, recherche de l'email sur le site, contacts LinkedIn, file quotidienne de messages privés. Il peut servir tel quel pour cette validation.

## À vérifier au moment de construire

Les exigences de Shopify évoluent. Revérifier dans leur documentation : le modèle officiel en vigueur, le connecteur MongoDB pour les
sessions, le fonctionnement de Shopify App Pricing, les conditions de la revue.
