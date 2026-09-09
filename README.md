# UGC Platform - Plateforme de création de contenu UGC

Une plateforme complète pour connecter les marques avec des créateurs de contenu UGC (User Generated Content).

## 🚀 Fonctionnalités

**Marques** : campagnes rémunérées ou gifting, brief assisté par IA, budget facultatif, devis des créateurs (prix, droits, conditions), annuaire de créateurs avec filtres, invitations, messagerie, sélection multi-créateurs avec paiement groupé, envoi de produit avec suivi, validation des livraisons (2 révisions, auto-approbation à J+7), pack vidéo prête à diffuser, statistiques de performance, publication Shopify, abonnement Pro (essai 14 jours).

**Créateurs** : portfolio vidéo, réseaux sociaux et réalisations, badges (Nouveau / Confirmé / Expert / Ambassadeur), avant-première des campagnes, devis modifiables, livraison par fichier ou par lien, paiements Stripe Connect, page revenus avec export CSV, parrainage.

**Plateforme** : vérification des marques (SIRET au registre national), limites progressives, coordonnées masquées avant sélection, signalements, administration (validations, réglages, supervision), emails transactionnels, tâches planifiées.

## 📋 Prérequis

- Node.js 20+
- MongoDB Atlas, Firebase Auth, Stripe (avec Connect), Cloudflare R2, un serveur SMTP
- Optionnels : une clé d'API IA (Anthropic, OpenAI, Groq, Novita…), une application Shopify

Configuration détaillée : [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md) · Stripe : [docs/STRIPE_SETUP.md](docs/STRIPE_SETUP.md) · Mise en ligne : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · Feuille de route : [docs/ROADMAP.md](docs/ROADMAP.md)

## 🧪 Vérifier et tester

```bash
cd backend && npm run check:env          # services externes OK ?
cd backend && npm run test:e2e -- --clean # tous les flux métier via l'API
npm run test:ui                           # parcours dans un vrai navigateur (racine)
```

Guide pas à pas : [docs/GUIDE-TEST.md](docs/GUIDE-TEST.md). Idées d'évolution : [docs/PROPOSITIONS-fonctionnalites.md](docs/PROPOSITIONS-fonctionnalites.md).

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
cp .env.local.example .env.local
# Configurer les variables d'environnement dans .env.local
npm run dev
```

## 🔧 Configuration

- `backend/.env` (copie de `backend/.env.example`) : MongoDB, Firebase, Stripe, Cloudflare R2, SMTP, règles métier, abonnement Pro, limites, IA, Shopify. `PORT=3002`.
- `frontend/.env.local` (copie de `frontend/.env.local.example`) : Firebase, `NEXT_PUBLIC_API_URL` (port 3002), clé publique Stripe.
- `cd backend && npm run check:env` vérifie que tout est joignable.

Liste commentée de chaque variable : [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md).

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

1. **Marque** vérifie son entreprise (SIRET) et publie une campagne (budget facultatif, brief IA)
2. **Créateurs** envoient un devis (prix, droits, conditions) ; la marque peut aussi les inviter
3. **Marque** accepte un ou plusieurs devis et saisit sa carte (montant bloqué, non prélevé)
4. **Créateur** livre les vidéos (fichiers ou liens)
5. **Marque** valide ou demande des révisions (max 2) ; auto-approbation après 7 jours
6. Paiement prélevé et viré au créateur (la marque paie le prix du devis, le créateur reçoit 90 %) ; avis mutuels

## 🚀 Déploiement

Le backend est un serveur Node.js classique (ffmpeg, tâches planifiées, uploads volumineux) : il n'est pas compatible avec les plateformes serverless. Recommandé : backend sur un VPS (PM2 + Nginx) ou Railway/Render, frontend sur Vercel. Guide : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
cd backend && npm run test:e2e -- --clean   # 56 étapes via l'API (backend démarré sur 3002)
npm run test:ui                             # parcours navigateur (backend + frontend démarrés)
cd frontend && npx tsc --noEmit             # vérification TypeScript
```

Détail : [docs/GUIDE-TEST.md](docs/GUIDE-TEST.md).

## 📄 Licence

MIT

## 👥 Support

Pour toute question ou problème, ouvrez une issue sur GitHub.
