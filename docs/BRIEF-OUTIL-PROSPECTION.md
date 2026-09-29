# Outil de prospection : brief de départ

Brief court à donner à une autre IA ou à un développeur. Rédigé le 29/09/2026.
Le dossier complet (algorithmes, modèle de données, pièges, journal) est dans `OUTIL-PROSPECTION-SPEC.md` : à transmettre en entier à qui doit coder.

## Ce que c'est

Un produit autonome qui trouve des prospects, les enrichit, les qualifie par IA et prépare les messages. Il existe déjà en prototype, à
l'intérieur d'une plateforme appelée NeedCreator, qui en est le premier utilisateur. Objectif : le sortir dans son propre dépôt.

## Architecture visée : trois pièces

1. Serveur : API, ordonnanceur, sources, qualification IA, base de données
2. Application web : cibles, files de prospects, messages, réponses
3. Extension Chrome : lit les pages sans API, dans le navigateur et la session de l'utilisateur

## Pile du prototype, à reprendre sauf raison contraire

- Node.js 22, modules ES, Express, MongoDB avec Mongoose
- Validation Joi ; sorties de l'IA contrôlées par schéma (Zod)
- IA par fournisseur interchangeable
- Application web : Next.js 14, React, TypeScript, Tailwind
- Extension : Manifest V3, générique, sans rien de propre à un client
- Hébergement : VPS, PM2, Nginx, Cloudflare ; déploiement par un script shell unique

## Principe directeur

Ce qui a une API officielle passe par le serveur. Ce qui n'en a pas passe par le navigateur de l'utilisateur, à vitesse humaine.
Jamais de ferme de navigateurs, de proxys ni de comptes jetables.

## Protocole de l'extension

Elle demande une tâche au serveur, ouvre la page, renvoie le texte et les liens visibles. Le serveur en extrait les données.
Aucun sélecteur CSS : c'est ce qui résiste aux refontes des sites.

## Garde-fous codés dans l'extension

- 5 à 10 s aléatoires entre deux pages
- Plafonds par session et par jour (150 pages par jour ; 20 sur LinkedIn)
- Arrêt sur captcha, page de connexion ou restriction
- Aucun like, abonnement, commentaire ni message envoyé
- Messages privés : le texte est collé, l'utilisateur clique Envoyer

## À prévoir dès le départ, absent du prototype

- Multi-locataire : chaque enregistrement porte un identifiant d'espace
- Multi-pays et multi-langue : rien en dur
- Anglais par défaut, français en second
- Messages écrits dans la langue du prospect

## Leçons du terrain (septembre 2026)

- Un onglet en arrière-plan ne charge pas la suite d'une liste : l'onglet doit être affiché pendant la lecture des listes
- Instagram refuse (code 429) la lecture directe des données de profil
- Un compte cité dans une publication est une personne trois fois sur quatre : vérifier le profil avant de créer un prospect
- Le nombre d'abonnés ne distingue pas une marque d'un influenceur
- Sur LinkedIn, contrôler le nom de l'entreprise avant de lire la page
- Un domaine d'envoi récent part en indésirables : le faire vieillir
- Une interrogation trop fréquente du serveur sature la limite par adresse IP

## Clients visés, par ordre

1. Plateformes UGC et agences d'influence
2. Agences de publicité et freelances marketing
3. Éditeurs d'applications Shopify
