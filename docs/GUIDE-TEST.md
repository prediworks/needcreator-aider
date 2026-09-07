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

Résultat attendu : `32/32 étapes OK`. Si une étape est ❌, le message dit quoi et pourquoi.

## 4. Test manuel dans le navigateur

### Comptes à créer

Vous aurez besoin de 3 comptes (3 emails différents). Astuce : Gmail accepte `votrenom+marque@gmail.com`, `votrenom+createur@gmail.com`, etc.

| Rôle | Comment |
|------|---------|
| Marque | Page d'inscription → "Marque" |
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

## 5. Problèmes fréquents

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
