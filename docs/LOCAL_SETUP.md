# Guide de configuration locale

## 🚀 Démarrage rapide (5 minutes)

### 1. Prérequis

- Node.js 18+ installé
- Git installé
- Un éditeur de code (VS Code recommandé)

### 2. Installation

```bash
# Cloner le repo (si pas déjà fait)
git clone <your-repo-url>
cd ugc-platform

# Installer les dépendances backend
cd backend
npm install

# Installer les dépendances frontend
cd ../frontend
npm install
```

### 3. Configuration minimale pour tester

#### MongoDB Atlas (OBLIGATOIRE)

1. Allez sur https://www.mongodb.com/cloud/atlas
2. Créez un compte gratuit
3. Créez un cluster M0 (gratuit)
4. Database Access → Add New Database User
   - Username: `ugcuser`
   - Password: générez un mot de passe fort
5. Network Access → Add IP Address → Allow Access from Anywhere (`0.0.0.0/0`)
6. Clusters → Connect → Connect your application
7. Copiez la connection string

#### Firebase (OBLIGATOIRE)

1. Allez sur https://console.firebase.google.com
2. Créez un nouveau projet
3. Authentication → Get Started → Email/Password → Enable
4. Authentication → Sign-in method → Google → Enable
5. Project Settings → General → Copiez les clés publiques
6. Project Settings → Service Accounts → Generate new private key

#### Stripe (OBLIGATOIRE)

1. Allez sur https://stripe.com
2. Créez un compte
3. Activez le mode Test
4. Developers → API keys → Copiez les clés TEST
5. Connect → Get started (activez Stripe Connect)

#### SendGrid (OPTIONNEL pour commencer)

1. Allez sur https://sendgrid.com
2. Créez un compte gratuit
3. Settings → API Keys → Create API Key

#### Cloudflare R2 (OPTIONNEL pour commencer)

Vous pouvez commencer sans R2. Les uploads de fichiers ne fonctionneront pas mais le reste de l'app oui.

> **Ports utilisés** : backend sur **3002**, frontend sur **3000** (le port 3001 est réservé à un autre service).

### 4. Configurer les fichiers .env

**Backend** (`backend/.env`) :

```env
NODE_ENV=development
PORT=3002

# MongoDB (remplacez avec votre connection string)
MONGODB_URI=mongodb+srv://ugcuser:VOTRE_PASSWORD@cluster0.xxxxx.mongodb.net/ugc-platform-dev?retryWrites=true&w=majority

# Firebase (remplacez avec vos credentials)
FIREBASE_PROJECT_ID=votre-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nVOTRE_CLE_PRIVEE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@votre-project.iam.gserviceaccount.com

# Stripe (clés TEST)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PLATFORM_FEE_PERCENT=10

# SendGrid (optionnel)
SENDGRID_API_KEY=SG.xxxxx
FROM_EMAIL=noreply@localhost

# Cloudflare R2 (optionnel)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_ACCESS_KEY_ID=
CLOUDFLARE_SECRET_ACCESS_KEY=
CLOUDFLARE_BUCKET_NAME=
CLOUDFLARE_PUBLIC_URL=

# Frontend URL (plusieurs origines possibles, séparées par des virgules)
FRONTEND_URL=http://localhost:3000,http://95.111.238.135:3000

# Email via SMTP (recommandé) — sinon SendGrid est utilisé
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@votre-domaine.fr
SMTP_PASS=xxxxx
FROM_EMAIL=noreply@votre-domaine.fr

# Optionnel
MIN_CREATOR_VIDEOS=3        # vidéos de portfolio requises pour candidater
JOBS_INTERVAL_MINUTES=60    # fréquence des tâches planifiées (auto-approbation, rappels)

# Security
JWT_SECRET=dev-secret-change-me
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

STORAGE_PROVIDER=cloudflare
```

**Frontend** (`frontend/.env.local`) :

```env
# Firebase (clés publiques)
NEXT_PUBLIC_FIREBASE_API_KEY=votre-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=votre-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=votre-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# API Backend
NEXT_PUBLIC_API_URL=http://localhost:3002/api

# Stripe (clé publique TEST)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
```

### 5. Démarrer l'application

**Terminal 1 - Backend** :
```bash
cd backend
npm run dev
```

Vous devriez voir :
```
🚀 Server running on port 3002 in development mode
📊 Health check: http://localhost:3002/health
🌐 CORS autorisé pour : http://localhost:3000, ...
```

**Terminal 2 - Frontend** :
```bash
cd frontend
npm run dev
```

Vous devriez voir :
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
```

### 6. Tester l'application

Voir le guide détaillé : [GUIDE-TEST.md](./GUIDE-TEST.md) (vérification de la configuration, test automatique de tous les flux, parcours manuels, compte admin).

1. Ouvrez http://localhost:3000
2. Cliquez sur "S'inscrire"
3. Créez un compte créateur ou marque
4. Explorez l'application !

### 7. Tester les fonctionnalités

#### Test complet du workflow :

**En tant que Marque** :
1. Inscrivez-vous comme marque
2. Créez une campagne
3. Publiez la campagne

**En tant que Créateur** :
1. Inscrivez-vous comme créateur (utilisez un autre email)
2. Complétez votre profil
3. Ajoutez des vidéos au portfolio (si R2 configuré)
4. Candidatez à une campagne
5. Attendez la sélection

**Retour en tant que Marque** :
1. Sélectionnez le créateur
2. Attendez la livraison

**Retour en tant que Créateur** :
1. Uploadez les livrables
2. Soumettez la livraison

**Retour en tant que Marque** :
1. Approuvez ou demandez une révision

## 🐛 Dépannage

### Erreur MongoDB

```
MongoServerError: bad auth
```

**Solution** : Vérifiez votre username/password dans la connection string

### Erreur Firebase

```
Error: Firebase auth failed
```

**Solution** : 
1. Vérifiez que Authentication est activé
2. Vérifiez que `localhost` est dans les domaines autorisés (Firebase Console → Authentication → Settings → Authorized domains)

### Erreur CORS

```
Access to fetch blocked by CORS policy
```

**Solution** : Vérifiez que l'adresse du frontend figure dans `FRONTEND_URL` de `backend/.env` (plusieurs adresses possibles, séparées par des virgules)

### Port déjà utilisé

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution** :
```bash
# Trouver le processus
lsof -i :3000

# Tuer le processus
kill -9 <PID>
```

## 📝 Commandes utiles

```bash
# Backend
cd backend
npm run dev          # Démarrer en mode développement
npm run check:env    # Vérifier MongoDB, Stripe, Firebase, email, R2
npm run test:e2e -- --clean   # Tester tous les flux via l'API (backend démarré)
npm run make-admin -- email@exemple.com   # Donner le rôle admin à un compte existant

# Test navigateur (racine du projet, backend + frontend démarrés)
npm install && npx playwright install chromium   # une seule fois
npm run test:ui

# Frontend
cd frontend
npm run dev          # Démarrer en mode développement
npm run build        # Build de production
npm run lint         # Vérifier le code

# Base de données
# Voir les données dans MongoDB Compass
# Connection string: votre MONGODB_URI
```

## 🎯 Prochaines étapes

Une fois que tout fonctionne en local :

1. Testez toutes les fonctionnalités
2. Configurez Cloudflare R2 pour les uploads
3. Configurez SendGrid pour les emails
4. Configurez les webhooks Stripe (utilisez ngrok pour tester en local)
5. Préparez le déploiement en production

## 🔐 Sécurité

**⚠️ IMPORTANT** :
- Ne commitez JAMAIS les fichiers `.env` dans git
- Utilisez des clés TEST Stripe en développement
- Changez tous les secrets avant le déploiement en production
