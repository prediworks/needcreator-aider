# Configuration Cloudflare Full Stack

## 🎯 Vue d'ensemble

Ce guide vous accompagne pour déployer l'application sur Cloudflare avec deux environnements distincts.

---

## 📦 Étape 1: Créer les buckets R2

```bash
# Bucket PREPROD
wrangler r2 bucket create ugc-platform-preprod

# Bucket PROD
wrangler r2 bucket create ugc-platform-prod
```

---

## 🔐 Étape 2: Configurer les secrets PREPROD

Exécutez ces commandes une par une et entrez les valeurs demandées:

```bash
# MongoDB Atlas (cluster preprod)
wrangler secret put MONGODB_URI --env preprod
# Entrer: mongodb+srv://username:password@cluster-preprod.xxxxx.mongodb.net/ugc-platform?retryWrites=true&w=majority

# Firebase (projet preprod)
wrangler secret put FIREBASE_PROJECT_ID --env preprod
# Entrer: ugc-platform-preprod

wrangler secret put FIREBASE_PRIVATE_KEY --env preprod
# Entrer: la clé privée du Service Account (avec \n)

wrangler secret put FIREBASE_CLIENT_EMAIL --env preprod
# Entrer: firebase-adminsdk-xxxxx@ugc-platform-preprod.iam.gserviceaccount.com

# Stripe (clés TEST)
wrangler secret put STRIPE_SECRET_KEY --env preprod
# Entrer: sk_test_xxxxx

wrangler secret put STRIPE_WEBHOOK_SECRET --env preprod
# Entrer: whsec_xxxxx (test)

# SendGrid
wrangler secret put SENDGRID_API_KEY --env preprod
# Entrer: SG.xxxxx

wrangler secret put FROM_EMAIL --env preprod
# Entrer: noreply@preprod.votre-domaine.com

# Cloudflare R2 (preprod)
wrangler secret put CLOUDFLARE_ACCOUNT_ID --env preprod
# Entrer: votre account ID Cloudflare

wrangler secret put CLOUDFLARE_ACCESS_KEY_ID --env preprod
# Entrer: R2 Access Key ID

wrangler secret put CLOUDFLARE_SECRET_ACCESS_KEY --env preprod
# Entrer: R2 Secret Access Key

wrangler secret put CLOUDFLARE_BUCKET_NAME --env preprod
# Entrer: ugc-platform-preprod

wrangler secret put CLOUDFLARE_PUBLIC_URL --env preprod
# Entrer: https://preprod-files.votre-domaine.com

# Frontend URL
wrangler secret put FRONTEND_URL --env preprod
# Entrer: https://preprod.votre-domaine.com

# JWT Secret
wrangler secret put JWT_SECRET --env preprod
# Entrer: un secret aléatoire fort (générez avec: openssl rand -base64 32)
```

---

## 🔐 Étape 3: Configurer les secrets PRODUCTION

```bash
# MongoDB Atlas (cluster prod)
wrangler secret put MONGODB_URI --env production
# Entrer: mongodb+srv://username:password@cluster-prod.xxxxx.mongodb.net/ugc-platform?retryWrites=true&w=majority

# Firebase (projet prod)
wrangler secret put FIREBASE_PROJECT_ID --env production
# Entrer: ugc-platform-prod

wrangler secret put FIREBASE_PRIVATE_KEY --env production
# Entrer: la clé privée du Service Account (avec \n)

wrangler secret put FIREBASE_CLIENT_EMAIL --env production
# Entrer: firebase-adminsdk-xxxxx@ugc-platform-prod.iam.gserviceaccount.com

# Stripe (clés LIVE)
wrangler secret put STRIPE_SECRET_KEY --env production
# Entrer: sk_live_xxxxx

wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# Entrer: whsec_xxxxx (live)

# SendGrid
wrangler secret put SENDGRID_API_KEY --env production
# Entrer: SG.xxxxx

wrangler secret put FROM_EMAIL --env production
# Entrer: noreply@votre-domaine.com

# Cloudflare R2 (prod)
wrangler secret put CLOUDFLARE_ACCOUNT_ID --env production
wrangler secret put CLOUDFLARE_ACCESS_KEY_ID --env production
wrangler secret put CLOUDFLARE_SECRET_ACCESS_KEY --env production

wrangler secret put CLOUDFLARE_BUCKET_NAME --env production
# Entrer: ugc-platform-prod

wrangler secret put CLOUDFLARE_PUBLIC_URL --env production
# Entrer: https://files.votre-domaine.com

# Frontend URL
wrangler secret put FRONTEND_URL --env production
# Entrer: https://votre-domaine.com

# JWT Secret
wrangler secret put JWT_SECRET --env production
# Entrer: un secret aléatoire fort DIFFÉRENT de preprod
```

---

## 🚀 Étape 4: Déployer le Backend

### Déployer PREPROD

```bash
cd backend
wrangler deploy --env preprod
```

Votre API sera disponible sur: `https://ugc-platform-api-preprod.votre-compte.workers.dev`

### Déployer PRODUCTION

```bash
cd backend
wrangler deploy --env production
```

Votre API sera disponible sur: `https://ugc-platform-api-prod.votre-compte.workers.dev`

---

## 🌐 Étape 5: Configurer le Frontend

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

## 🔗 Étape 6: Configurer les domaines personnalisés

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

## 🔄 Étape 7: Configurer les Webhooks Stripe

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

## ✅ Étape 8: Vérification

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

## 🔍 Étape 9: Tests

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

## 📊 Étape 10: Monitoring

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

```bash
# Vérifier le secret
wrangler secret list --env preprod

# Mettre à jour si nécessaire
wrangler secret put MONGODB_URI --env preprod
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
# Lister les secrets
wrangler secret list --env preprod
wrangler secret list --env production

# Supprimer un secret
wrangler secret delete SECRET_NAME --env preprod

# Voir les logs
wrangler tail --env preprod
wrangler tail --env production

# Rollback (redéployer une version précédente)
wrangler rollback --env production

# Tester localement
wrangler dev --env preprod
```

---

## 🎉 Félicitations !

Votre application est maintenant déployée sur Cloudflare avec deux environnements distincts !

**URLs:**
- PREPROD Frontend: `https://preprod.votre-domaine.com`
- PREPROD API: `https://api-preprod.votre-domaine.com`
- PROD Frontend: `https://votre-domaine.com`
- PROD API: `https://api.votre-domaine.com`
