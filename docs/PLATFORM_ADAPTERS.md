# Adaptateurs de Plateforme

Ce guide explique comment adapter le backend pour différentes plateformes serverless.

## 🎯 Backend actuel

Le backend est une **application Express classique** qui fonctionne directement sur:
- Railway
- Render
- Heroku
- VPS classique

Pour les plateformes serverless, des adaptations sont nécessaires.

---

## 🔥 Firebase Functions

### 1. Installer les dépendances

```bash
cd backend
npm install firebase-functions firebase-admin
```

### 2. Créer l'adapter

Créer `backend/src/firebase.js`:

```javascript
import functions from 'firebase-functions';
import app from './index.js';

// Export Express app as Firebase Function
export const api = functions
  .region('europe-west1')
  .runWith({
    timeoutSeconds: 60,
    memory: '1GB',
  })
  .https.onRequest(app);
```

### 3. Configuration

`firebase.json`:
```json
{
  "functions": {
    "source": "backend",
    "runtime": "nodejs18",
    "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run lint"]
  }
}
```

### 4. Déployer

```bash
firebase deploy --only functions
```

**URL finale**: `https://europe-west1-PROJECT_ID.cloudfunctions.net/api`

---

## ⚡ Cloudflare Workers

### 1. Installer Hono (alternative à Express pour Workers)

```bash
cd backend
npm install hono @hono/node-server
```

### 2. Créer l'adapter

Créer `backend/src/worker.js`:

```javascript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// Middleware
app.use('/*', cors());

// Import routes
import authRoutes from './routes/auth.js';
import campaignRoutes from './routes/campaigns.js';
// ... autres routes

// Mount routes
app.route('/api/auth', authRoutes);
app.route('/api/campaigns', campaignRoutes);
// ... autres routes

export default app;
```

### 3. Configuration

`wrangler.toml`:
```toml
name = "ugc-platform-api"
main = "src/worker.js"
compatibility_date = "2024-01-01"
node_compat = true

[vars]
NODE_ENV = "production"
```

### 4. Déployer

```bash
wrangler deploy
```

**Note**: Cloudflare Workers a des limitations (pas de fs, pas de child_process, etc.)

---

## ▲ Vercel Serverless Functions

### 1. Configuration

Créer `backend/vercel.json`:

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
  ]
}
```

### 2. Adapter l'export

Modifier `backend/src/index.js` - ajouter à la fin:

```javascript
// Export for Vercel
export default app;
```

### 3. Déployer

```bash
cd backend
vercel
```

**URL finale**: `https://your-project.vercel.app`

---

## 🇫🇷 Scaleway Functions

### 1. Configuration

Créer `backend/serverless.yml`:

```yaml
service: ugc-platform-api

provider:
  name: scaleway
  runtime: node18
  region: fr-par

functions:
  api:
    handler: src/handler.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
```

### 2. Créer le handler

Créer `backend/src/handler.js`:

```javascript
import serverless from 'serverless-http';
import app from './index.js';

export const handler = serverless(app);
```

### 3. Installer la dépendance

```bash
npm install serverless-http
```

### 4. Déployer

```bash
scw functions deploy
```

---

## 📊 Comparaison des plateformes

| Plateforme | Cold Start | Coût | Limites | Complexité |
|------------|-----------|------|---------|------------|
| Railway | ❌ Aucun | 💰 $5/mois | Aucune | ⭐ Facile |
| Render | ❌ Aucun | 💰 Gratuit puis $7/mois | Aucune | ⭐ Facile |
| Vercel | ✅ ~1s | 💰 Gratuit puis $20/mois | 10s timeout | ⭐⭐ Moyen |
| Firebase | ✅ ~2s | 💰 Gratuit puis usage | 60s timeout | ⭐⭐ Moyen |
| Cloudflare | ✅ ~50ms | 💰 Gratuit puis $5/mois | 30s timeout, pas de Node complet | ⭐⭐⭐ Difficile |
| Scaleway | ✅ ~1s | 💰 Gratuit puis usage | 15min timeout | ⭐⭐ Moyen |

## 💡 Recommandation

**Pour commencer rapidement**: Utilisez **Railway** ou **Render**
- Pas d'adaptation nécessaire
- Pas de cold starts
- Déploiement en 2 minutes

**Pour scale**: Utilisez **Vercel** ou **Cloudflare**
- Performance mondiale
- Scaling automatique
- Coûts optimisés

**Pour conformité EU**: Utilisez **Scaleway**
- Données en France
- RGPD natif
- Support français
