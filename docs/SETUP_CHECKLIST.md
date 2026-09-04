# Checklist de configuration

## ✅ Services à configurer

### MongoDB Atlas (OBLIGATOIRE)
- [ ] Compte créé
- [ ] Cluster M0 créé
- [ ] Utilisateur de base de données créé
- [ ] IP `0.0.0.0/0` whitelistée
- [ ] Connection string copiée dans `backend/.env`

### Firebase (OBLIGATOIRE)
- [ ] Projet créé
- [ ] Authentication activée (Email/Password)
- [ ] Google Sign-In activé
- [ ] Service Account créé
- [ ] Clé privée téléchargée
- [ ] Clés publiques copiées dans `frontend/.env.local`
- [ ] Clés privées copiées dans `backend/.env`
- [ ] `localhost` ajouté aux domaines autorisés

### Stripe (OBLIGATOIRE)
- [ ] Compte créé
- [ ] Mode Test activé
- [ ] Stripe Connect activé
- [ ] Clés TEST copiées dans `backend/.env`
- [ ] Clé publique TEST copiée dans `frontend/.env.local`

### SendGrid (OPTIONNEL)
- [ ] Compte créé
- [ ] API Key créée
- [ ] Email d'envoi vérifié
- [ ] API Key copiée dans `backend/.env`

### Cloudflare R2 (OPTIONNEL)
- [ ] Compte créé
- [ ] Bucket créé
- [ ] Access Keys générées
- [ ] Credentials copiées dans `backend/.env`

## ✅ Installation

- [ ] Node.js 18+ installé
- [ ] Git installé
- [ ] Dépendances backend installées (`cd backend && npm install`)
- [ ] Dépendances frontend installées (`cd frontend && npm install`)

## ✅ Configuration

- [ ] `backend/.env` créé et configuré
- [ ] `frontend/.env.local` créé et configuré
- [ ] MongoDB connection testée
- [ ] Firebase authentication testée

## ✅ Tests

- [ ] Backend démarre sans erreur (`npm run dev`)
- [ ] Frontend démarre sans erreur (`npm run dev`)
- [ ] Page d'accueil accessible (http://localhost:3001)
- [ ] Inscription créateur fonctionne
- [ ] Inscription marque fonctionne
- [ ] Login fonctionne
- [ ] Dashboard accessible

## 🎯 Prêt pour le développement !

Une fois tous les points cochés, vous êtes prêt à développer et tester l'application en local.
