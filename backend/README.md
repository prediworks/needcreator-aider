# UGC Platform - Backend API

Backend API complet pour la plateforme UGC avec déploiement flexible.

## 🚀 Déploiement flexible

Ce backend peut être déployé sur :
- **Node.js classique** (VPS, Heroku, Railway, etc.)
- **Cloudflare Workers** (avec adaptateur)
- **Firebase Functions**
- **Scaleway Functions**
- **Vercel/Netlify Functions**

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

1. Copier `.env.example` vers `.env`
2. Remplir les variables d'environnement requises

```bash
cp .env.example .env
```

### Variables d'environnement essentielles

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Storage (Cloudflare R2)
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_ACCESS_KEY_ID=...
CLOUDFLARE_SECRET_ACCESS_KEY=...
CLOUDFLARE_BUCKET_NAME=ugc-platform
CLOUDFLARE_PUBLIC_URL=https://...

# Email (SendGrid)
SENDGRID_API_KEY=SG.xxx
FROM_EMAIL=noreply@ugc-platform.com

# Security
JWT_SECRET=your-super-secret-key
```

## 🏃 Développement

```bash
npm run dev
```

Le serveur démarre sur `http://localhost:3000`

## 🧪 Tests

```bash
npm test
```

## 📚 Structure complète

```
src/
├── config/          # Configuration centralisée
│   └── index.js
├── db/              # Connexion MongoDB
│   └── connection.js
├── models/          # Modèles Mongoose
│   ├── User.js
│   ├── Campaign.js
│   ├── Delivery.js
│   └── Review.js
├── routes/          # Routes Express
│   ├── auth.js
│   ├── campaigns.js
│   ├── deliveries.js
│   ├── reviews.js
│   ├── admin.js
│   ├── portfolio.js
│   └── webhooks.js
├── controllers/     # Logique métier
│   ├── auth.js
│   ├── campaigns.js
│   ├── deliveries.js
│   ├── reviews.js
│   ├── admin.js
│   ├── portfolio.js
│   └── webhooks.js
├── middleware/      # Middleware custom
│   ├── auth.js
│   └── validate.js
├── services/        # Services externes
│   ├── stripe.js
│   ├── storage.js
│   └── email.js
├── jobs/            # Cron jobs
│   └── autoApproval.js
├── utils/           # Utilitaires
│   └── logger.js
└── index.js         # Point d'entrée
```

## 🔐 Sécurité

- **Helmet.js** : Headers HTTP sécurisés
- **Rate limiting** : Protection contre les abus
- **CORS** : Configuré pour le frontend
- **Validation** : Joi pour valider les données
- **Firebase Auth** : Authentification sécurisée
- **Stripe** : Paiements sécurisés avec Connect

## 📊 Base de données

MongoDB Atlas avec Mongoose ODM.

### Collections principales

#### Users
- Créateurs et marques
- Profils avec portfolio
- Stats et ratings
- Comptes Stripe

#### Campaigns
- Missions UGC
- Brief détaillé
- Applications créateurs
- Matching par niches

#### Deliveries
- Livrables vidéo
- Gestion des révisions
- Paiements Stripe
- Auto-approbation après 7j

#### Reviews
- Avis bidirectionnels
- Critères détaillés
- Réponses possibles

## 🛣️ API Endpoints

### Authentication
```
POST   /api/auth/register/creator    - Inscription créateur
POST   /api/auth/register/brand      - Inscription marque
GET    /api/auth/profile             - Profil utilisateur
PATCH  /api/auth/profile             - Mise à jour profil
```

### Campaigns
```
POST   /api/campaigns                - Créer campagne
GET    /api/campaigns                - Liste campagnes
GET    /api/campaigns/:id            - Détail campagne
PATCH  /api/campaigns/:id            - Modifier campagne
DELETE /api/campaigns/:id            - Annuler campagne
POST   /api/campaigns/:id/publish    - Publier campagne
POST   /api/campaigns/:id/apply      - Candidater (créateur)
POST   /api/campaigns/:id/select/:creatorId - Sélectionner créateur
```

### Deliveries
```
POST   /api/deliveries/campaign/:id  - Créer delivery
GET    /api/deliveries               - Liste deliveries
GET    /api/deliveries/:id           - Détail delivery
POST   /api/deliveries/:id/upload    - Upload fichiers
POST   /api/deliveries/:id/submit    - Soumettre delivery
POST   /api/deliveries/:id/approve   - Approuver delivery
POST   /api/deliveries/:id/revision  - Demander révision
```

### Reviews
```
POST   /api/reviews/campaign/:id     - Créer review
GET    /api/reviews/user/:id         - Reviews d'un utilisateur
POST   /api/reviews/:id/respond      - Répondre à un review
```

### Portfolio
```
POST   /api/portfolio/upload         - Upload vidéo portfolio
DELETE /api/portfolio/:videoId       - Supprimer vidéo
GET    /api/portfolio/creator/:id    - Portfolio public
```

### Admin
```
GET    /api/admin/stats              - Stats dashboard
GET    /api/admin/creators/pending   - Créateurs en attente
POST   /api/admin/creators/:id/approve - Approuver créateur
POST   /api/admin/creators/:id/reject  - Rejeter créateur
GET    /api/admin/users              - Liste utilisateurs
POST   /api/admin/users/:id/suspend  - Suspendre utilisateur
POST   /api/admin/users/:id/reactivate - Réactiver utilisateur
```

### Webhooks
```
POST   /api/webhooks/stripe          - Webhooks Stripe
```

## ⏰ Cron Jobs

### Auto-approbation
- **Fréquence** : Quotidien à 2h du matin
- **Fonction** : Approuve automatiquement les deliveries après 7 jours
- **Paiement** : Transfer automatique au créateur

### Rappels
- **Fréquence** : Quotidien à 2h du matin
- **Fonction** : Envoie des rappels aux marques (J+3 et J+6)

## 📧 Emails automatiques

- Welcome créateur/marque
- Approbation créateur
- Nouvelle campagne (matching)
- Candidature reçue
- Candidature acceptée
- Livraison soumise
- Livraison approuvée
- Révision demandée
- Rappels auto-approbation
- Notification auto-approbation

## 💳 Paiements Stripe

### Flow complet
1. **Création delivery** : Payment Intent créé (hold)
2. **Soumission** : Paiement en attente
3. **Approbation** : Capture + Transfer au créateur (- 10% commission)
4. **Auto-approbation** : Après 7 jours si pas de réponse

### Webhooks gérés
- `account.updated` : Vérification compte créateur
- `payment_intent.succeeded` : Confirmation paiement
- `payment_intent.payment_failed` : Échec paiement
- `transfer.created` : Transfer créé
- `transfer.failed` : Échec transfer

## 📦 Stockage (Cloudflare R2)

- Upload vidéos portfolio
- Upload livrables
- Génération URLs signées
- Suppression fichiers

## 🎯 Fonctionnalités MVP complètes

✅ **Authentification** : Firebase Auth + JWT  
✅ **Inscription** : Créateurs + Marques  
✅ **Profils** : Complets avec portfolio  
✅ **Campagnes** : CRUD + Publication + Matching  
✅ **Candidatures** : Créateurs → Campagnes  
✅ **Sélection** : Marques → Créateurs  
✅ **Deliveries** : Upload + Soumission + Révisions  
✅ **Paiements** : Stripe Connect + Auto-approbation  
✅ **Reviews** : Bidirectionnels avec critères  
✅ **Admin** : Dashboard + Approbation créateurs  
✅ **Emails** : Notifications automatiques  
✅ **Webhooks** : Stripe events  
✅ **Cron Jobs** : Auto-approbation + Rappels  
✅ **Storage** : Cloudflare R2  

## 🚀 Déploiement

### Node.js classique
```bash
npm start
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Variables d'environnement production
- Activer `NODE_ENV=production`
- Configurer les URLs de production
- Activer les logs fichiers
- Configurer les webhooks Stripe

## 📝 Logs

- **Console** : Développement (colorisé)
- **Fichiers** : Production
  - `logs/error.log` : Erreurs uniquement
  - `logs/combined.log` : Tous les logs

## 🔧 Maintenance

### Backup MongoDB
```bash
mongodump --uri="mongodb+srv://..." --out=backup/
```

### Monitoring
- Logs Winston
- Sentry (à configurer)
- Stripe Dashboard

## 📖 Documentation API

Swagger/OpenAPI à venir dans Phase 2.

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 License

MIT

## 👥 Support

- Email : support@ugc-platform.com
- Documentation : https://docs.ugc-platform.com
# Backend API - UGC Platform

API backend pour la plateforme UGC.

## 🚀 Déploiement sur Cloudflare Workers

### Configuration initiale

1. **Copiez les fichiers d'exemple:**
```bash
cp .env.preprod.example .env.preprod
cp .env.production.example .env.production
```

2. **Configurez les variables d'environnement:**

Éditez `.env.preprod` et `.env.production` avec vos vraies valeurs.

**Générer un JWT secret:**
```bash
openssl rand -base64 32
```

3. **Rendez les scripts exécutables:**
```bash
chmod +x scripts/deploy-preprod.sh
chmod +x scripts/deploy-production.sh
```

### Déploiement

**PREPROD:**
```bash
npm run deploy:preprod
# ou
./scripts/deploy-preprod.sh
```

**PRODUCTION:**
```bash
npm run deploy:prod
# ou
./scripts/deploy-production.sh
```

### Développement local

**Avec Node.js classique:**
```bash
npm run dev
```

**Avec Wrangler (simule Cloudflare Workers):**
```bash
npm run wrangler:preprod
```

### Commandes utiles

```bash
# Voir les logs en temps réel
npx wrangler tail --env preprod
npx wrangler tail --env production

# Rollback vers une version précédente
npx wrangler rollback --env production

# Lister les déploiements
npx wrangler deployments list --env production
```

## 📝 Variables d'environnement

Toutes les variables sont définies dans:
- `.env.preprod` pour l'environnement de préproduction
- `.env.production` pour l'environnement de production

**⚠️ Important:** Ces fichiers contiennent des secrets et ne doivent JAMAIS être commités dans git.

## 🔒 Sécurité

- Les fichiers `.env.preprod` et `.env.production` sont dans `.gitignore`
- Utilisez des valeurs différentes pour preprod et production
- Ne partagez jamais vos secrets dans Slack, email, etc.
- Utilisez des JWT secrets forts et uniques

## 📚 Documentation

Voir [docs/CLOUDFLARE_SETUP.md](../docs/CLOUDFLARE_SETUP.md) pour le guide complet de déploiement.
