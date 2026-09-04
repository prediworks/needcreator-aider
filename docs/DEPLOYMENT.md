# Guide de Déploiement

## 🚀 Déploiement Backend

### Option 1: Railway

1. Créer un compte sur [Railway](https://railway.app)
2. Connecter votre repo GitHub
3. Ajouter les variables d'environnement
4. Déployer automatiquement

### Option 2: Render

1. Créer un compte sur [Render](https://render.com)
2. Créer un nouveau Web Service
3. Connecter votre repo
4. Configurer les variables d'environnement
5. Déployer

### Option 3: Scaleway

1. Créer un compte Scaleway
2. Créer une Serverless Function
3. Configurer les variables d'environnement
4. Déployer via CLI

```bash
npm install -g @scaleway/serverless-functions
scw init
scw functions deploy
```

## 🌐 Déploiement Frontend

### Vercel (Recommandé)

1. Installer Vercel CLI
```bash
npm i -g vercel
```

2. Déployer
```bash
cd frontend
vercel
```

3. Configurer les variables d'environnement dans le dashboard Vercel

### Netlify

1. Installer Netlify CLI
```bash
npm i -g netlify-cli
```

2. Déployer
```bash
cd frontend
netlify deploy --prod
```

## 🗄️ Base de données

### MongoDB Atlas

1. Créer un cluster sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Créer un utilisateur de base de données
3. Whitelist les IPs (ou 0.0.0.0/0 pour tous)
4. Copier la connection string
5. Ajouter à vos variables d'environnement

## 🔐 Configuration des Services

### Firebase

1. Créer un projet sur [Firebase Console](https://console.firebase.google.com)
2. Activer Authentication (Email/Password)
3. Créer un Service Account
4. Télécharger les credentials
5. Configurer les variables d'environnement

### Stripe

1. Créer un compte sur [Stripe](https://stripe.com)
2. Activer Stripe Connect
3. Récupérer les clés API (test et production)
4. Configurer les webhooks
5. Ajouter les clés aux variables d'environnement

### Cloudflare R2

1. Créer un compte Cloudflare
2. Créer un bucket R2
3. Générer des Access Keys
4. Configurer CORS si nécessaire
5. Ajouter les credentials aux variables d'environnement

### SendGrid

1. Créer un compte sur [SendGrid](https://sendgrid.com)
2. Créer une API Key
3. Vérifier votre domaine d'envoi
4. Ajouter la clé aux variables d'environnement

## ✅ Checklist de Déploiement

### Backend
- [ ] Variables d'environnement configurées
- [ ] MongoDB Atlas connecté
- [ ] Firebase configuré
- [ ] Stripe configuré
- [ ] Cloudflare R2 configuré
- [ ] SendGrid configuré
- [ ] Webhooks Stripe configurés
- [ ] CORS configuré correctement
- [ ] Rate limiting activé

### Frontend
- [ ] Variables d'environnement configurées
- [ ] Firebase config ajoutée
- [ ] API URL pointant vers le backend
- [ ] Stripe publishable key ajoutée
- [ ] Build réussi
- [ ] Routes fonctionnelles

## 🔄 CI/CD

### GitHub Actions

Créer `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: cd backend && npm install
      - run: cd backend && npm test
      # Ajouter votre commande de déploiement

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: cd frontend && npm install
      - run: cd frontend && npm run build
      # Ajouter votre commande de déploiement
```

## 🐛 Troubleshooting

### Erreur de connexion MongoDB
- Vérifier la connection string
- Vérifier les IP whitelistées
- Vérifier les credentials

### Erreur Firebase
- Vérifier les credentials
- Vérifier que Authentication est activé
- Vérifier les domaines autorisés

### Erreur Stripe
- Vérifier les clés API
- Vérifier que Connect est activé
- Vérifier les webhooks

### Erreur CORS
- Vérifier la configuration CORS dans le backend
- Vérifier l'URL du frontend dans les variables d'environnement
