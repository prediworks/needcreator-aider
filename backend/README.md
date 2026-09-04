# UGC Platform - Backend API

Backend API agnostique du déploiement pour la plateforme UGC.

## 🚀 Déploiement flexible

Ce backend peut être déployé sur :
- **Node.js classique** (VPS, Heroku, etc.)
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
2. Remplir les variables d'environnement

```bash
cp .env.example .env
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

## 📚 Structure

```
src/
├── config/          # Configuration centralisée
├── db/              # Connexion MongoDB
├── models/          # Modèles Mongoose
├── routes/          # Routes Express (à créer)
├── controllers/     # Logique métier (à créer)
├── middleware/      # Middleware custom (à créer)
├── services/        # Services (Stripe, Storage, etc.) (à créer)
├── utils/           # Utilitaires
└── index.js         # Point d'entrée
```

## 🔐 Sécurité

- Helmet.js pour headers HTTP sécurisés
- Rate limiting
- CORS configuré
- Validation des données avec Joi
- Firebase Auth pour l'authentification

## 📊 Base de données

MongoDB Atlas avec Mongoose ODM.

Collections principales :
- `users` - Créateurs et marques
- `campaigns` - Campagnes UGC
- `deliveries` - Livrables et paiements
- `reviews` - Avis bidirectionnels

## 🎯 Prochaines étapes

1. Créer les routes API
2. Implémenter les controllers
3. Ajouter les services (Stripe, Storage)
4. Créer les middleware d'authentification
5. Ajouter les tests unitaires
6. Créer les adaptateurs de déploiement
