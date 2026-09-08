# Guide de test (sans être développeur)

Ce guide explique comment démarrer la plateforme en local et tester chaque parcours, dans l'ordre.

## 1. Démarrer

Deux terminaux :

```bash
# Terminal 1 — backend (port 3002)
cd backend
npm run dev

# Terminal 2 — frontend (port 3000)
cd frontend
npm run dev
```

Puis ouvrez http://localhost:3000 (ou http://95.111.238.135:3000 depuis un autre poste).

## 2. Vérifier que tout est branché (30 secondes)

```bash
cd backend
npm run check:env
```

Chaque ligne doit être ✅ : MongoDB, Stripe, Firebase, email, Cloudflare R2.
Deux points peuvent rester ❌ sans bloquer les tests :

- **Stripe Connect** : à activer une fois sur https://dashboard.stripe.com/connect. Sans lui, les marques paient bien, mais l'argent n'est pas reversé aux créateurs (il reste sur votre compte Stripe, statut "encaissé, virement en attente").
- **R2 URL publique** : les vidéos sont lues via des liens temporaires signés. Ça marche, mais pour la production il faudra activer un domaine public sur le bucket R2.

## 3. Test automatique de tous les flux (1 minute)

Le backend doit tourner. Ce script crée une marque et un créateur de test, déroule tout le parcours (campagne, candidature, sélection avec paiement Stripe test, livraison, révision, approbation, avis, auto-approbation) puis supprime ses données :

```bash
cd backend
npm run test:e2e -- --clean
```

Résultat attendu : `55/55 étapes OK`. Si une étape est ❌, le message dit quoi et pourquoi.

## 4. Test manuel dans le navigateur

### Comptes à créer

Vous aurez besoin de 3 comptes (3 emails différents). Astuce : Gmail accepte `votrenom+marque@gmail.com`, `votrenom+createur@gmail.com`, etc.

| Rôle | Comment |
|------|---------|
| Marque | Page d'inscription → "Marque", puis vérification d'entreprise dans le profil (SIRET réel de test : 356 000 000 00048) avant de publier |
| Créateur | Page d'inscription → "Créateur" |
| Admin | Créez un compte marque, puis dans un terminal : `cd backend && npm run make-admin -- email@du.compte`. Reconnectez-vous : le menu "Administration" apparaît. |

Utilisez une fenêtre de navigation privée pour être connecté avec plusieurs comptes en même temps.

### Parcours marque

1. Inscription → tableau de bord.
2. "Nouvelle campagne" : titre (10 caractères min), description (50 min), niches, type de vidéo, budget (une suggestion marché s'affiche), date limite → "Enregistrer le brouillon" → "Publier maintenant".
3. La campagne apparaît "Ouverte aux candidatures". Les créateurs des mêmes niches reçoivent un email.

### Parcours créateur

1. Inscription → tableau de bord : un encart jaune liste ce qui manque pour candidater.
2. "Mon portfolio" : ajoutez 3 vidéos (n'importe quel fichier vidéo court). Elles se lisent directement sur la page.
3. Bloc "Recevoir mes paiements" → "Connecter Stripe" (fonctionne uniquement si Stripe Connect est activé).
4. Attendez la validation admin (étape suivante).

### Parcours admin

1. Menu "Administration" → onglet "Créateurs à valider" → "Voir le portfolio" → "Valider". Le créateur reçoit un email.
2. Le bouton "Lancer les tâches planifiées" force l'auto-approbation des livraisons de plus de 7 jours (utile pour tester sans attendre).

### Retour créateur

1. "Campagnes" → ouvrez la campagne → "Candidater maintenant" (prix pré-rempli, message optionnel).
2. Onglet "Mes candidatures" pour suivre.

### Retour marque

1. Ouvrez la campagne : la candidature apparaît avec le score de matching, la note et un lien vers le portfolio.
2. "Sélectionner et payer" : vous êtes redirigé vers la livraison, où un écran Stripe demande votre carte. En mode test, utilisez le numéro **4242 4242 4242 4242**, une date future (ex. 12/34) et un CVC quelconque (123). Le montant est bloqué, pas débité : il ne sera prélevé qu'à votre validation de la livraison.

### Livraison

1. Créateur : "Livraisons" → envoyez une ou plusieurs vidéos → "Soumettre la livraison".
2. Marque : "Livraisons" → regardez les vidéos → "Approuver et payer" ou "Demander une révision" (2 max, 20 caractères min).
3. Après approbation : chacun peut noter l'autre (étoiles + critères). La note apparaît sur le profil public du créateur.

### Auto-approbation à 7 jours

Sans réponse de la marque, la livraison est validée automatiquement. Pour tester sans attendre : admin → "Lancer les tâches planifiées" après avoir modifié la date dans la base, ou lancez `npm run test:e2e` qui simule ce cas.

## 5. Tester les nouvelles fonctionnalités

| Fonctionnalité | Où | Comment tester |
|---|---|---|
| Devis (prix, droits, conditions) | Page campagne, côté créateur | « Envoyer un devis » puis « Modifier mon devis » tant que la marque n'a pas accepté. La marque voit chaque devis et clique « Accepter le devis et payer ». |
| Budget facultatif | Création de campagne | Laissez le budget vide : les créateurs voient « Devis libre ». |
| Livraison par lien | Page livraison, côté créateur | Collez une URL TikTok / Instagram / Drive (une par ligne). Le compteur « x / N attendue(s) » bloque la soumission au-delà de N. |
| Liens publics / privés | Page livraison, après validation | Chaque partie coche ou décoche « J'accepte qu'il soit public ». Le lien n'apparaît sur le profil du créateur que si les deux acceptent. |
| Badges et niveaux | Profil créateur, candidatures | Nouveau / Confirmé (3 missions, note ≥ 4,5) / Expert (10 missions, note ≥ 4,7). Seuils modifiables dans `backend/.env` (`BADGE_*`). |
| Vidéo Ambassadeur | Profil créateur → « Parlez de NeedCreator » | Collez un lien, puis Admin → « Vidéos Ambassadeur » → Valider. Le créateur voit les campagnes 24 h avant les autres (`EARLY_ACCESS_HOURS`, 0 pour désactiver). |
| Réactivité des marques | Cartes et page campagne, côté créateur | « Valide en X j », « répond en X j », calculés après les premières sélections et validations. |
| Invitation | Annuaire « Créateurs » ou fiche créateur, côté marque | « Inviter » → choisir une campagne ouverte. Le créateur invité voit la campagne même en avant-première. |
| Annuaire des créateurs | Menu « Créateurs » (marque) | Filtres niches, prix, note, niveau, réseau, abonnés ; onglet « Mes collaborateurs ». |
| Réseaux sociaux et réalisations | Profil créateur | Blocs « Mes réseaux sociaux » et « Mes réalisations » ; visibles sur la fiche publique (onglet Réalisations, 12 par page). |
| Multi-créateurs | Création de campagne → « Nombre de créateurs recherchés » | Sélectionnez plusieurs devis ; « Payer toutes les sélections en une fois » sur la page campagne. |
| Messagerie | Page campagne (« Discuter ») et menu « Messages » | Ouverte après candidature ou invitation. Email de notification, au plus un toutes les 15 min par discussion. |
| Envoi de produit | Création de campagne (case à cocher) → page livraison | Le créateur renseigne son adresse dans son profil ; la marque marque « expédié » (suivi) ; le créateur « reçu ». Le délai de production démarre à la réception. |
| Mes revenus | Menu « Mes revenus » (créateur) | Missions payées, en attente, bonus, export CSV. |
| Parrainage | Profil (marque et créateur) | Copiez le lien d'invitation ; le filleul s'inscrit avec le code (`?ref=`). Montants dans `backend/.env` (`REFERRAL_*`). |
| Performances | Page livraison après validation | Renseignez vues / likes par vidéo ; cumul et coût pour 1 000 vues sur la page campagne (marque). |
| Brief IA | Création de campagne, étape 1 | Nécessite une clé dans `backend/.env` (`ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`, `AI_PROVIDER`). Prompts modifiables dans `backend/config/prompts/`. |
| Pack prêt à diffuser | Page livraison après validation (marque) | Choisissez les formats, payez (`READY_PACK_PRICE`, 0 = inclus), téléchargez les déclinaisons. Sous-titres si `OPENAI_API_KEY` est renseignée. |
| Vérification d'entreprise | Profil marque → « Vérification de l'entreprise » | SIRET ou TVA + site web. Le SIRET est vérifié au registre national des entreprises (existence et activité, raison sociale affichée). Email pro → immédiat ; email grand public → onglet admin « Marques à vérifier ». Sans vérification, pas de publication. Pour désactiver le contrôle au registre (friction) : Admin → Réglages, ou `BUSINESS_REGISTRY_CHECK=false`. SIRET de test réel : 356 000 000 00048 (La Poste). |
| Abonnement Pro | Profil marque → « NeedCreator Pro » | 14 jours d'essai offerts à l'inscription. « Souscrire » ouvre Stripe Checkout (carte test 4242…). Commission 8 %, brief IA illimité, gifting, multi-créateurs. |
| Quota brief IA | Création de campagne | 3 briefs / mois en gratuit (compteur affiché), illimité en Pro. |
| Limites nouvelle marque | Publication, invitations, messages | 2 campagnes ouvertes, 5 invitations / jour, 20 messages / jour tant qu'aucune campagne n'est terminée. |
| Gifting | Création de campagne → « Gifting (produit offert) » (Pro) | Produit ≥ 30 €, 2 vidéos max, 2 campagnes / mois. Le créateur candidate sans prix ; à la sélection la marque paie 5 € par vidéo. Le créateur peut refuser les gifting dans son profil. |
| Coordonnées masquées | Messagerie | Emails et téléphones remplacés par « [coordonnées masquées avant sélection] » tant que le créateur n'est pas sélectionné. |
| Signalement | Bouton « Signaler » (campagne, profil, discussion) | Traitement dans Admin → « Signalements » : sans suite, traité ou suspension. |
| Shopify | Profil marque → « Boutique Shopify » | Nécessite une application Shopify (`SHOPIFY_*` dans `backend/.env`). Ensuite : pré-remplir un brief depuis un produit, publier les vidéos validées sur la fiche produit (metafield `needcreator.ugc_videos`). |

## 6. Problèmes fréquents

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| "Impossible de joindre le serveur" | Backend arrêté | `cd backend && npm run dev` |
| Erreur CORS dans la console | L'adresse du frontend n'est pas dans `FRONTEND_URL` (backend/.env) | Ajoutez-la, séparée par une virgule |
| Google login refusé | Domaine non autorisé dans Firebase | Firebase Console → Authentication → Settings → Authorized domains. Une adresse IP ne peut pas être ajoutée : utilisez un nom de domaine ou testez avec email/mot de passe |
| "Finalisez votre inscription" | Compte Firebase créé mais profil non enregistré | Remplissez le formulaire proposé, le compte sera complété |
| Vidéo qui ne se lit pas | Lien signé expiré (1 h) | Rechargez la page |
| "You can only create new accounts if you've signed up for Connect" | Stripe Connect non activé | https://dashboard.stripe.com/connect |
| L'écran de carte ne s'affiche pas | Clé publique Stripe absente | Vérifiez `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` dans `frontend/.env.local` (clé `pk_test_...`) |
| "Le paiement n'a pas été confirmé" à l'approbation | Carte jamais saisie | Ouvrez la livraison et renseignez la carte dans le bloc "Paiement à confirmer" |
