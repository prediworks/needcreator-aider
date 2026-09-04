# Configuration Cloudflare Full Stack

## 🎯 Vue d'ensemble

Ce guide vous accompagne pour déployer l'application sur Cloudflare avec deux environnements distincts (PREPROD et PROD).

**Nouvelle approche** : Les variables d'environnement sont gérées via des fichiers `.env.preprod` et `.env.production` au lieu de `wrangler secret`, ce qui simplifie grandement le déploiement.

---

## 📦 Étape 1: Créer les buckets R2

```bash
# Installer Wrangler si ce n'est pas déjà fait
npm install -g wrangler

# Se connecter à Cloudflare
wrangler login

# Créer les buckets
wrangler r2 bucket create ugc-platform-preprod
wrangler r2 bucket create ugc-platform-prod
```

---

## 🔐 Étape 2: Configurer les variables d'environnement

### PREPROD

1. **Copiez le fichier d'exemple:**
```bash
cd backend
cp .env.preprod.example .env.preprod
```

2. **Éditez `.env.preprod` avec vos vraies valeurs:**
```bash
# Utilisez votre éditeur préféré
nano .env.preprod
# ou
code .env.preprod
# ou
vim .env.preprod
```

3. **Remplissez toutes les variables:**

```env
# MongoDB Atlas (cluster preprod)
MONGODB_URI=mongodb+srv://username:password@cluster-preprod.xxxxx.mongodb.net/ugc-platform?retryWrites=true&w=majority

# Firebase (projet preprod)
FIREBASE_PROJECT_ID=ugc-platform-preprod
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nVOTRE_CLE_ICI\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ugc-platform-preprod.iam.gserviceaccount.com

# Stripe (clés TEST)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PLATFORM_FEE_PERCENT=10

# SendGrid
SENDGRID_API_KEY=SG.xxxxx
FROM_EMAIL=noreply@preprod.votre-domaine.com

# Cloudflare R2 (preprod)
CLOUDFLARE_ACCOUNT_ID=votre-account-id
CLOUDFLARE_ACCESS_KEY_ID=votre-access-key-id
CLOUDFLARE_SECRET_ACCESS_KEY=votre-secret-access-key
CLOUDFLARE_BUCKET_NAME=ugc-platform-preprod
CLOUDFLARE_PUBLIC_URL=https://preprod-files.votre-domaine.com

# Frontend URL
FRONTEND_URL=https://preprod.votre-domaine.com

# JWT Secret (générez avec: openssl rand -base64 32)
JWT_SECRET=votre-secret-aleatoire-fort

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Storage Provider
STORAGE_PROVIDER=cloudflare
```

### PRODUCTION

1. **Copiez le fichier d'exemple:**
```bash
cp .env.production.example .env.production
```

2. **Éditez `.env.production` avec vos vraies valeurs:**
```bash
nano .env.production
# ou
code .env.production
```

3. **Remplissez toutes les variables (utilisez des valeurs DIFFÉRENTES de preprod):**

**⚠️ Important:**
- Utilisez des clés Stripe LIVE (pas TEST)
- Utilisez un JWT_SECRET différent de preprod
- Pointez vers les ressources de production (MongoDB prod, Firebase prod, etc.)

---

## 🚀 Étape 3: Déployer le Backend

### Méthode 1: Avec les scripts (Recommandé)

**Déployer PREPROD:**
```bash
cd backend
chmod +x scripts/deploy-preprod.sh
npm run deploy:preprod
```

**Déployer PRODUCTION:**
```bash
cd backend
chmod +x scripts/deploy-production.sh
npm run deploy:prod
```

Le script de production vous demandera une confirmation avant de déployer.

### Méthode 2: Avec npm directement

```bash
# PREPROD
npm run deploy:preprod

# PRODUCTION
npm run deploy:prod
```

### URLs de vos APIs

Après le déploiement, vos APIs seront disponibles sur:
- **PREPROD**: `https://ugc-platform-api-preprod.votre-compte.workers.dev`
- **PRODUCTION**: `https://ugc-platform-api-prod.votre-compte.workers.dev`

---

## 🌐 Étape 4: Configurer le Frontend

### 1. Créer les fichiers d'environnement

**PREPROD** - `frontend/.env.preprod`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=votre-api-key-preprod
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ugc-platform-preprod.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ugc-platform-preprod
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ugc-platform-preprod.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

NEXT_PUBLIC_API_URL=https://ugc-platform-api-preprod.votre-compte.workers.dev/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
```

**PRODUCTION** - `frontend/.env.production`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=votre-api-key-prod
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ugc-platform-prod.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ugc-platform-prod
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ugc-platform-prod.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=987654321
NEXT_PUBLIC_FIREBASE_APP_ID=1:987654321:web:fedcba

NEXT_PUBLIC_API_URL=https://ugc-platform-api-prod.votre-compte.workers.dev/api
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
```

### 2. Déployer sur Cloudflare Pages

#### Via Dashboard Cloudflare (Recommandé)

1. Allez sur [dash.cloudflare.com](https://dash.cloudflare.com)
2. Pages → Create a project
3. Connectez votre repo GitHub
4. Configurez:
   - **Project name**: `ugc-platform-preprod`
   - **Production branch**: `preprod`
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/.next`
   - **Root directory**: `/`
   - **Environment variables**: Copiez depuis `.env.preprod`

5. Répétez pour PRODUCTION:
   - **Project name**: `ugc-platform-prod`
   - **Production branch**: `main`
   - **Environment variables**: Copiez depuis `.env.production`

#### Via CLI

```bash
# PREPROD
cd frontend
wrangler pages deploy .next --project-name=ugc-platform-preprod --branch=preprod

# PRODUCTION
wrangler pages deploy .next --project-name=ugc-platform-prod --branch=main
```

---

## 🔗 Étape 5: Configurer les domaines personnalisés

### Dans Cloudflare Dashboard

1. **Pages** → Votre projet → Custom domains
2. Ajoutez:
   - PREPROD: `preprod.votre-domaine.com`
   - PROD: `votre-domaine.com` ou `app.votre-domaine.com`

3. **Workers** → Votre worker → Triggers → Custom Domains
4. Ajoutez:
   - PREPROD API: `api-preprod.votre-domaine.com`
   - PROD API: `api.votre-domaine.com`

---

## 🔄 Étape 6: Configurer les Webhooks Stripe

### PREPROD
1. Dashboard Stripe (mode Test)
2. Developers → Webhooks → Add endpoint
3. URL: `https://api-preprod.votre-domaine.com/api/webhooks/stripe`
4. Events: Sélectionnez tous les events nécessaires
5. Copiez le Signing Secret et mettez à jour:
```bash
wrangler secret put STRIPE_WEBHOOK_SECRET --env preprod
```

### PRODUCTION
1. Dashboard Stripe (mode Live)
2. Developers → Webhooks → Add endpoint
3. URL: `https://api.votre-domaine.com/api/webhooks/stripe`
4. Events: Sélectionnez tous les events nécessaires
5. Copiez le Signing Secret et mettez à jour:
```bash
wrangler secret put STRIPE_WEBHOOK_SECRET --env production
```

---

## ✅ Étape 7: Vérification

### Checklist PREPROD

- [ ] Backend déployé et accessible
- [ ] Frontend déployé et accessible
- [ ] Connexion MongoDB fonctionne
- [ ] Authentification Firebase fonctionne
- [ ] Upload de fichiers R2 fonctionne
- [ ] Emails SendGrid fonctionnent
- [ ] Webhooks Stripe configurés
- [ ] Domaines personnalisés configurés

### Checklist PRODUCTION

- [ ] Backend déployé et accessible
- [ ] Frontend déployé et accessible
- [ ] Connexion MongoDB fonctionne
- [ ] Authentification Firebase fonctionne
- [ ] Upload de fichiers R2 fonctionne
- [ ] Emails SendGrid fonctionnent
- [ ] Webhooks Stripe configurés (LIVE)
- [ ] Domaines personnalisés configurés
- [ ] SSL/TLS actif
- [ ] Monitoring configuré

---

## 🔍 Étape 8: Tests

### Tester PREPROD

```bash
# Health check
curl https://api-preprod.votre-domaine.com/health

# Test authentification
curl https://preprod.votre-domaine.com
```

### Tester PRODUCTION

```bash
# Health check
curl https://api.votre-domaine.com/health

# Test authentification
curl https://votre-domaine.com
```

---

## 📊 Étape 9: Monitoring

### Cloudflare Analytics

1. Workers → Votre worker → Metrics
2. Pages → Votre projet → Analytics

### Logs en temps réel

```bash
# PREPROD
wrangler tail --env preprod

# PRODUCTION
wrangler tail --env production
```

---

## 🚨 Dépannage

### Erreur de connexion MongoDB

Vérifiez que la variable `MONGODB_URI` est correcte dans votre fichier `.env.preprod` ou `.env.production`.

```bash
# Vérifier que le fichier existe
ls -la backend/.env.preprod

# Redéployer après correction
cd backend
npm run deploy:preprod
```

### Erreur Firebase

- Vérifiez que les domaines sont autorisés dans Firebase Console
- Authentication → Settings → Authorized domains
- Ajoutez: `preprod.votre-domaine.com` et `votre-domaine.com`

### Erreur CORS

Vérifiez que `FRONTEND_URL` est correctement configuré dans les secrets du worker.

---

## 🔄 Workflow de déploiement continu

### Avec GitHub Actions

Créez `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches:
      - preprod
      - main

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Deploy to Cloudflare Workers
        run: |
          cd backend
          npm install
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            npx wrangler deploy --env production
          else
            npx wrangler deploy --env preprod
          fi
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Deploy to Cloudflare Pages
        run: |
          cd frontend
          npm install
          npm run build
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            npx wrangler pages deploy .next --project-name=ugc-platform-prod
          else
            npx wrangler pages deploy .next --project-name=ugc-platform-preprod
          fi
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## 📝 Commandes utiles

```bash
# Voir les logs en temps réel
wrangler tail --env preprod
wrangler tail --env production

# Rollback (redéployer une version précédente)
wrangler rollback --env production

# Lister les déploiements
wrangler deployments list --env production

# Tester localement avec les variables preprod
cd backend
npm run wrangler:preprod

# Redéployer rapidement
npm run deploy:preprod
npm run deploy:prod
```

---

## 💡 Avantages de cette approche

✅ **Simplicité**: Un seul fichier `.env` par environnement  
✅ **Rapidité**: Déploiement en une seule commande  
✅ **Versionnable**: Les fichiers `.example` peuvent être commités  
✅ **Sécurisé**: Les fichiers `.env.*` sont dans `.gitignore`  
✅ **Maintenable**: Facile de modifier une variable et redéployer  

## 🔒 Sécurité

**⚠️ IMPORTANT:**
- Ne commitez JAMAIS les fichiers `.env.preprod` et `.env.production` dans git
- Ces fichiers sont déjà dans `.gitignore`
- Utilisez des valeurs différentes pour preprod et production (surtout JWT_SECRET)
- Gardez vos fichiers `.env` en sécurité (backup chiffré)

## 🎉 Félicitations !

Votre application est maintenant déployée sur Cloudflare avec deux environnements distincts !

**URLs:**
- PREPROD Frontend: `https://preprod.votre-domaine.com`
- PREPROD API: `https://api-preprod.votre-domaine.com` ou `https://ugc-platform-api-preprod.votre-compte.workers.dev`
- PROD Frontend: `https://votre-domaine.com`
- PROD API: `https://api.votre-domaine.com` ou `https://ugc-platform-api-prod.votre-compte.workers.dev`

## 📚 Ressources supplémentaires

- [Documentation Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Guide backend/README.md](../backend/README.md)
