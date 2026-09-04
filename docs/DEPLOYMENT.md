# Guide de Déploiement

Le projet est conçu pour être déployé sur **plusieurs plateformes** selon vos préférences. Voici toutes les options disponibles.

## 🎯 Architectures de déploiement recommandées

### Architecture 1: Full Vercel (Recommandé pour MVP)
- **Frontend**: Vercel
- **Backend**: Vercel Serverless Functions
- **Base de données**: MongoDB Atlas
- **Stockage**: Cloudflare R2
- **Avantages**: Simple, rapide, gratuit jusqu'à un certain volume

### Architecture 2: Firebase + Cloudflare
- **Frontend**: Firebase Hosting
- **Backend**: Firebase Functions
- **Base de données**: MongoDB Atlas
- **Stockage**: Cloudflare R2
- **Avantages**: Écosystème Firebase complet, scaling automatique

### Architecture 3: Cloudflare Full Stack
- **Frontend**: Cloudflare Pages
- **Backend**: Cloudflare Workers
- **Base de données**: MongoDB Atlas
- **Stockage**: Cloudflare R2
- **Avantages**: Performance mondiale, edge computing

### Architecture 4: Scaleway
- **Frontend**: Scaleway Object Storage + CDN
- **Backend**: Scaleway Serverless Functions
- **Base de données**: Scaleway Managed Database (PostgreSQL) ou MongoDB Atlas
- **Stockage**: Scaleway Object Storage
- **Avantages**: Souveraineté des données (EU), prix compétitifs

### Architecture 5: Mixte (Production)
- **Frontend**: Vercel ou Cloudflare Pages
- **Backend**: Railway ou Render (Node.js classique)
- **Base de données**: MongoDB Atlas
- **Stockage**: Cloudflare R2
- **Avantages**: Flexibilité maximale, pas de cold starts

---

## 🚀 Déploiement Backend

### Option 1: Vercel Serverless Functions

**Prérequis**: Le backend doit être adapté pour Vercel (voir section Adaptations)

```bash
cd backend
npm install -g vercel
vercel
```

**Configuration** (`vercel.json`):
```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Option 2: Firebase Functions

**Installation**:
```bash
npm install -g firebase-tools
firebase login
firebase init functions
```

**Configuration** (`firebase.json`):
```json
{
  "functions": {
    "source": "backend",
    "runtime": "nodejs18",
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run build"
    ]
  }
}
```

**Déploiement**:
```bash
firebase deploy --only functions
```

### Option 3: Cloudflare Workers

**Installation**:
```bash
npm install -g wrangler
wrangler login
```

**Configuration** (`wrangler.toml`):
```toml
name = "ugc-platform-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[env.production]
vars = { NODE_ENV = "production" }
```

**Déploiement**:
```bash
wrangler deploy
```

### Option 4: Scaleway Functions

**Installation**:
```bash
npm install -g @scaleway/serverless-functions
scw init
```

**Configuration** (`serverless.yml`):
```yaml
service: ugc-platform-api
provider:
  name: scaleway
  runtime: node18
  region: fr-par
  
functions:
  api:
    handler: src/index.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
```

**Déploiement**:
```bash
scw functions deploy
```

### Option 5: Railway (Node.js classique)

1. Créer un compte sur [Railway](https://railway.app)
2. Connecter votre repo GitHub
3. Ajouter les variables d'environnement
4. Railway détecte automatiquement Node.js et déploie

**Avantages**: Pas d'adaptation nécessaire, déploiement direct

### Option 6: Render (Node.js classique)

1. Créer un compte sur [Render](https://render.com)
2. Créer un nouveau Web Service
3. Connecter votre repo
4. Configurer:
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
5. Ajouter les variables d'environnement
6. Déployer

**Avantages**: Gratuit pour commencer, pas d'adaptation nécessaire

## 🌐 Déploiement Frontend

### Option 1: Vercel (Recommandé)

**Déploiement automatique via GitHub**:
1. Connecter votre repo sur [vercel.com](https://vercel.com)
2. Sélectionner le dossier `frontend`
3. Configurer les variables d'environnement
4. Déployer automatiquement à chaque push

**Déploiement via CLI**:
```bash
cd frontend
npm i -g vercel
vercel
```

**Configuration automatique**: Vercel détecte Next.js automatiquement

### Option 2: Netlify

```bash
cd frontend
npm i -g netlify-cli
netlify init
netlify deploy --prod
```

**Configuration** (`netlify.toml`):
```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

### Option 3: Cloudflare Pages

```bash
cd frontend
npm i -g wrangler
wrangler pages deploy .next --project-name=ugc-platform
```

**Configuration**: Cloudflare détecte Next.js automatiquement

### Option 4: Firebase Hosting

```bash
firebase init hosting
firebase deploy --only hosting
```

**Configuration** (`firebase.json`):
```json
{
  "hosting": {
    "public": "frontend/out",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

**Note**: Nécessite d'exporter Next.js en mode statique ou utiliser Next.js sur Firebase Functions

### Option 5: Scaleway Object Storage + CDN

1. Build statique:
```bash
cd frontend
npm run build
npm run export
```

2. Upload vers Scaleway:
```bash
s3cmd put --recursive out/* s3://your-bucket/
```

3. Configurer le CDN Scaleway pour pointer vers le bucket

## 🗄️ Base de données

### Option 1: MongoDB Atlas (Recommandé)

1. Créer un cluster sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Créer un utilisateur de base de données
3. Whitelist les IPs:
   - Pour serverless: `0.0.0.0/0` (tous)
   - Pour serveur dédié: IP spécifique
4. Copier la connection string
5. Ajouter à vos variables d'environnement

**Avantages**: Gratuit jusqu'à 512MB, backups automatiques, scaling facile

### Option 2: Scaleway Managed Database

1. Créer une instance PostgreSQL ou MongoDB
2. Configurer les accès
3. Récupérer la connection string

**Note**: Si vous utilisez PostgreSQL, vous devrez adapter les modèles Mongoose

### Option 3: MongoDB auto-hébergé

Déployer MongoDB sur votre propre serveur (non recommandé pour production)

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

### Avant de commencer
- [ ] Choisir votre architecture de déploiement
- [ ] Créer les comptes nécessaires (Vercel, Firebase, Cloudflare, etc.)
- [ ] Préparer les variables d'environnement

### Backend
- [ ] Variables d'environnement configurées sur la plateforme
- [ ] MongoDB Atlas connecté et IP whitelistées
- [ ] Firebase Admin SDK configuré
- [ ] Stripe configuré (clés API + webhooks)
- [ ] Cloudflare R2 configuré (ou alternative)
- [ ] SendGrid configuré
- [ ] CORS configuré avec l'URL du frontend
- [ ] Rate limiting activé
- [ ] Logs configurés
- [ ] Health check endpoint fonctionnel (`/health`)

### Frontend
- [ ] Variables d'environnement configurées
- [ ] Firebase config ajoutée (clés publiques)
- [ ] API URL pointant vers le backend déployé
- [ ] Stripe publishable key ajoutée
- [ ] Build réussi localement (`npm run build`)
- [ ] Routes testées
- [ ] Images optimisées

### Post-déploiement
- [ ] Tester le workflow complet (inscription → campagne → livraison → paiement)
- [ ] Configurer les webhooks Stripe avec l'URL de production
- [ ] Tester les emails (SendGrid)
- [ ] Vérifier les uploads de fichiers (R2)
- [ ] Configurer le monitoring (Sentry, LogRocket, etc.)
- [ ] Configurer les backups MongoDB
- [ ] Documenter les URLs de production

## 🔄 Adaptations nécessaires selon la plateforme

### Pour Firebase Functions

Le code Express doit être wrappé pour Firebase:

```javascript
// backend/src/index.js - Ajouter à la fin
import functions from 'firebase-functions';

// Export for Firebase Functions
export const api = functions.https.onRequest(app);
```

### Pour Cloudflare Workers

Cloudflare Workers nécessite un adapter:

```javascript
// backend/src/worker.js
import app from './index.js';

export default {
  async fetch(request, env, ctx) {
    return app(request);
  }
};
```

### Pour Vercel Serverless

Vercel nécessite un export par défaut:

```javascript
// backend/src/index.js - Ajouter à la fin
export default app;
```

### Pour Scaleway Functions

Scaleway nécessite un handler:

```javascript
// backend/src/index.js - Ajouter à la fin
export const handler = async (event, context) => {
  // Adapter l'event Scaleway vers Express
  return app(event);
};
```

## 💡 Recommandations par cas d'usage

### Startup / MVP
**Architecture recommandée**: Vercel (Frontend + Backend)
- Gratuit jusqu'à un certain volume
- Déploiement ultra-rapide
- Pas de configuration complexe

### Scale-up / Production
**Architecture recommandée**: Cloudflare Pages + Railway/Render
- Performance mondiale (Cloudflare CDN)
- Backend stable sans cold starts (Railway)
- Coûts prévisibles

### Entreprise / Conformité EU
**Architecture recommandée**: Scaleway Full Stack
- Données hébergées en France/EU
- Conformité RGPD native
- Support professionnel

### Budget limité
**Architecture recommandée**: Firebase + Cloudflare R2
- Free tier généreux
- Scaling automatique
- Pas de serveur à gérer

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
