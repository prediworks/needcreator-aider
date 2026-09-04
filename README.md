# UGC Platform - Plateforme de création de contenu UGC

Une plateforme complète pour connecter les marques avec des créateurs de contenu UGC (User Generated Content).

## 🚀 Fonctionnalités

### Pour les Marques
- ✅ Création et gestion de campagnes UGC
- ✅ Réception et évaluation des candidatures
- ✅ Sélection de créateurs
- ✅ Validation des livrables avec système de révisions
- ✅ Paiements sécurisés via Stripe
- ✅ Auto-approbation après 7 jours

### Pour les Créateurs
- ✅ Portfolio vidéo
- ✅ Candidature aux campagnes
- ✅ Upload de livrables
- ✅ Système de révisions (max 2)
- ✅ Paiements automatiques via Stripe Connect
- ✅ Système de notation et avis

### Fonctionnalités Techniques
- ✅ Authentification Firebase
- ✅ Paiements Stripe avec hold & transfer
- ✅ Upload de vidéos vers Cloudflare R2
- ✅ Emails automatiques via SendGrid
- ✅ Jobs planifiés (auto-approbation, rappels)
- ✅ Panel admin complet

## 📋 Prérequis

- Node.js 18+
- MongoDB
- Compte Firebase
- Compte Stripe
- Compte Cloudflare R2
- Compte SendGrid

## 🛠️ Installation

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Configurer les variables d'environnement dans .env
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Configurer les variables d'environnement dans .env.local
npm run dev
```

## 🔧 Configuration

### Variables d'environnement Backend

Voir `backend/.env.example` pour la liste complète des variables requises :
- MongoDB URI
- Firebase credentials
- Stripe keys
- Cloudflare R2 credentials
- SendGrid API key

### Variables d'environnement Frontend

Voir `frontend/.env.example` pour la configuration :
- Firebase config
- API URL
- Stripe publishable key

## 📚 Structure du Projet

```
.
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── controllers/     # Logique métier
│   │   ├── db/             # Connexion MongoDB
│   │   ├── jobs/           # Tâches planifiées
│   │   ├── middleware/     # Auth, validation
│   │   ├── models/         # Modèles Mongoose
│   │   ├── routes/         # Routes API
│   │   ├── services/       # Services (email, storage, stripe)
│   │   └── utils/          # Utilitaires
│   └── index.js            # Point d'entrée
│
└── frontend/
    ├── src/
    │   ├── app/            # Pages Next.js
    │   ├── components/     # Composants React
    │   ├── hooks/          # Hooks personnalisés
    │   ├── lib/            # Utilitaires
    │   └── store/          # State management
    └── public/             # Assets statiques
```

## 🔄 Workflow

1. **Marque** crée une campagne avec budget
2. **Créateurs** candidatent avec leur proposition
3. **Marque** sélectionne un créateur
4. **Créateur** livre le contenu
5. **Marque** valide ou demande des révisions (max 2)
6. Auto-approbation après 7 jours si pas de retour
7. Paiement automatique au créateur (avec commission plateforme de 10%)

## 🚀 Déploiement

### Backend
- Recommandé : Railway, Render, ou Scaleway
- Nécessite : MongoDB Atlas, variables d'environnement

### Frontend
- Recommandé : Vercel ou Netlify
- Configuration automatique pour Next.js

## 📝 API Documentation

### Endpoints principaux

**Auth**
- `POST /api/auth/register/creator` - Inscription créateur
- `POST /api/auth/register/brand` - Inscription marque
- `GET /api/auth/profile` - Profil utilisateur

**Campaigns**
- `GET /api/campaigns` - Liste des campagnes
- `POST /api/campaigns` - Créer une campagne
- `POST /api/campaigns/:id/publish` - Publier une campagne
- `POST /api/campaigns/:id/apply` - Candidater

**Deliveries**
- `GET /api/deliveries` - Liste des livraisons
- `POST /api/deliveries/:id/upload` - Upload fichiers
- `POST /api/deliveries/:id/submit` - Soumettre livraison
- `POST /api/deliveries/:id/approve` - Approuver
- `POST /api/deliveries/:id/revision` - Demander révision

**Portfolio**
- `POST /api/portfolio/upload` - Upload vidéo portfolio
- `DELETE /api/portfolio/:videoId` - Supprimer vidéo
- `GET /api/portfolio/creator/:id` - Portfolio public

## 🧪 Tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 📄 Licence

MIT

## 👥 Support

Pour toute question ou problème, ouvrez une issue sur GitHub.
