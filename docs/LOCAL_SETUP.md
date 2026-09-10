# Configuration locale

Ce guide décrit la configuration complète pour faire tourner NeedCreator sur votre machine ou votre serveur de développement. Pour tester ensuite les parcours, voir [GUIDE-TEST.md](./GUIDE-TEST.md).

## 1. Prérequis

- Node.js 20 ou plus (le projet est testé avec Node 22)
- Git
- Comptes : MongoDB Atlas, Firebase, Stripe, Cloudflare R2, un serveur SMTP (OVH, Brevo, Gmail pro…)

## 2. Installation

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 3. Ports

| Service | Port | Commande |
|---|---|---|
| Backend (API) | **3002** | `cd backend && npm run dev` |
| Frontend | **3000** | `cd frontend && npm run dev` |

Le port 3001 est réservé à un autre service sur le serveur : ne l'utilisez pas.

## 4. Services externes

### MongoDB Atlas (obligatoire)

1. Créez un cluster gratuit (M0) sur https://www.mongodb.com/cloud/atlas.
2. Database Access → créez un utilisateur.
3. Network Access → autorisez votre IP (ou `0.0.0.0/0` pour un serveur de développement).
4. Connect → copiez la chaîne de connexion dans `MONGODB_URI`.

### Firebase Auth (obligatoire)

1. Créez un projet sur https://console.firebase.google.com.
2. Authentication → Sign-in method → activez **Email/Password** (et Google si vous avez un nom de domaine : Google refuse les adresses IP).
3. Project settings → General → copiez les clés publiques dans `frontend/.env.local`.
4. Project settings → Service accounts → Generate new private key → copiez `project_id`, `private_key`, `client_email` dans `backend/.env`.
5. Les emails de confirmation d'adresse et de mot de passe oublié sont envoyés par le SMTP de NeedCreator (`FROM_EMAIL`), pas par Firebase : aucune configuration de modèle ni de domaine d'envoi n'est nécessaire côté Firebase. Le lien contenu dans l'email reste un lien Firebase.
6. Authentication → Settings → Authorized domains : ajoutez le domaine du site pour que ces liens ramènent vers l'application (sans cela, Firebase affiche sa propre page de confirmation).

### Stripe (obligatoire)

Voir [STRIPE_SETUP.md](./STRIPE_SETUP.md) : clés test, activation de Stripe Connect, webhooks, abonnement Pro, portail client.

### Cloudflare R2 (obligatoire pour les vidéos)

1. Cloudflare → R2 → créez un bucket.
2. R2 → Manage R2 API tokens → créez un token avec lecture/écriture sur ce bucket → `CLOUDFLARE_ACCESS_KEY_ID` et `CLOUDFLARE_SECRET_ACCESS_KEY`.
3. `CLOUDFLARE_ACCOUNT_ID` est visible dans l'URL du dashboard.
4. **CORS du bucket** (obligatoire pour l'envoi des vidéos, qui part directement du navigateur vers R2) : `cd backend && npm run r2:cors` applique les origines de `FRONTEND_URL`. À relancer si `FRONTEND_URL` change.
5. `CLOUDFLARE_PUBLIC_URL` :
   - en développement, laissez l'URL de l'API privée (`https://<account>.r2.cloudflarestorage.com/<bucket>`) : les vidéos sont servies par des liens signés valables 1 h ;
   - pour la production, activez un domaine public sur le bucket (Settings → Public access) et mettez cette URL, pour des liens permanents (nécessaire pour Shopify et le partage).

### Email (obligatoire pour les notifications)

Un serveur SMTP suffit (`SMTP_*` + `FROM_EMAIL`). SendGrid n'est utilisé qu'en repli si `SMTP_HOST` est absent.

### Services optionnels

| Service | Sert à | Variables |
|---|---|---|
| Fournisseur IA (Anthropic, OpenAI, Groq, Novita…) | Brief assisté par IA | `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` — détails dans `backend/config/prompts/README.md` |
| OpenAI | Sous-titres automatiques du pack vidéo | `OPENAI_API_KEY` |
| Shopify | Import produit, publication des vidéos sur la fiche produit | `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (application créée sur partners.shopify.com) |
| Cloudflare Turnstile | Anti-robot sur le formulaire d'inscription | `TURNSTILE_SECRET_KEY` (backend) et `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (frontend). Création : dash.cloudflare.com → Turnstile → Add site (mode « Managed »). Clés de test : `1x00000000000000000000AA` / `1x0000000000000000000000000000000AA` |

## 5. Fichiers de configuration

Copiez les exemples, puis remplissez :

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

### `backend/.env` : variables

| Groupe | Variables | Notes |
|---|---|---|
| Serveur | `NODE_ENV`, `PORT=3002`, `FRONTEND_URL` | `FRONTEND_URL` accepte plusieurs adresses séparées par des virgules (ex. `http://localhost:3000,http://95.111.238.135:3000`) ; la première sert dans les emails |
| Base | `MONGODB_URI` | |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` | la clé privée entre guillemets, avec les `\n` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLATFORM_FEE_PERCENT=10`, `STRIPE_PRO_PRICE_ID` (facultatif) | clés `sk_test_` en développement |
| Stockage | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_KEY_ID`, `CLOUDFLARE_SECRET_ACCESS_KEY`, `CLOUDFLARE_BUCKET_NAME`, `CLOUDFLARE_PUBLIC_URL` | |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` | `FROM_EMAIL` doit être une adresse autorisée par votre SMTP |
| Sécurité | `JWT_SECRET`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | mettez `RATE_LIMIT_MAX_REQUESTS=5000` en développement |
| Règles métier | `MIN_CREATOR_VIDEOS=3`, `JOBS_INTERVAL_MINUTES=60`, `EARLY_ACCESS_HOURS=24`, `BADGE_*` | |
| Abonnement Pro | `PRO_PRICE_EUR=79`, `PRO_TRIAL_DAYS=14`, `PRO_FEE_PERCENT=10`, `AI_BRIEF_FREE_QUOTA=3` | |
| Limites nouvelles marques | `LIMIT_NEW_BRAND_OPEN_CAMPAIGNS=2`, `LIMIT_NEW_BRAND_INVITES_PER_DAY=5`, `LIMIT_NEW_BRAND_MESSAGES_PER_DAY=20` | s'appliquent tant qu'aucune campagne n'est terminée |
| Gifting | `GIFTING_MIN_PRODUCT_VALUE=30`, `GIFTING_MAX_DELIVERABLES=2`, `GIFTING_MAX_PER_MONTH=2`, `GIFTING_FEE_PER_VIDEO=5` | |
| Parrainage | `REFERRAL_BRAND_FEE_PERCENT=5`, `REFERRAL_REFERRER_FEE_PERCENT=5`, `REFERRAL_CREATOR_BONUS=10` | |
| Vérification des marques | `BUSINESS_REGISTRY_CHECK=true` | contrôle au registre national des entreprises ; modifiable aussi dans Admin → Réglages |
| Email confirmé | `REQUIRE_EMAIL_VERIFICATION=true` | lien de confirmation envoyé par Firebase à l'inscription ; sans confirmation, pas de publication ni de devis |
| Documents légaux | `LEGAL_TERMS_VERSION=2026-09-09` | date de la version des CGU ; la changer redemande l'acceptation à tous les utilisateurs connectés |
| Anti-robot | `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile sur l'inscription ; vide = désactivé. Clé de site côté frontend : `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| Pack vidéo | `READY_PACK_PRICE=15`, `AI_TRANSCRIPTION_MODEL=whisper-1` | 0 = inclus |
| IA | `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY` | |
| Shopify | `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`, `SHOPIFY_APP_URL` | |
| Tests | `STRIPE_AUTO_CONFIRM_TEST=false` | `true` = paiements confirmés sans écran de carte (jamais en production) |

### `frontend/.env.local` : variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3002/api        # ou http://<ip-du-serveur>:3002/api
NEXT_PUBLIC_SITE_URL=https://needcreator.com          # adresse publique (SEO)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=                      # facultatif, voir ci-dessus
```

Le fichier `.env` n'est pas rechargé à chaud : redémarrez le backend après une modification.

## 6. Vérifier la configuration

```bash
cd backend && npm run check:env
```

Chaque ligne doit être ✅ (MongoDB, Stripe, Stripe Connect, Firebase, SMTP, R2 accès, écriture et CORS). Seule « R2 URL publique » peut rester ❌ en développement.

## 7. Démarrer et tester

```bash
cd backend && npm run dev      # terminal 1
cd frontend && npm run dev     # terminal 2
```

Puis http://localhost:3000. Tests automatiques :

```bash
cd backend && npm run test:e2e -- --clean   # tous les flux via l'API (backend démarré)
npm run test:ui                             # parcours dans un navigateur (racine, backend + frontend démarrés ; une fois : npm install && npx playwright install chromium)
```

## 8. Compte administrateur

Créez un compte marque dans l'application, puis :

```bash
cd backend && npm run make-admin -- email@du.compte
```

Reconnectez-vous : le menu « Administration » apparaît (validation des créateurs, vérification des marques, vidéos Ambassadeur, signalements, réglages).

## 9. Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| `Missing required environment variables` au démarrage | `MONGODB_URI`, `FIREBASE_PROJECT_ID`, `STRIPE_SECRET_KEY` ou `JWT_SECRET` absent | complétez `backend/.env` |
| Erreur CORS dans le navigateur | l'adresse du frontend n'est pas dans `FRONTEND_URL` | ajoutez-la, séparée par une virgule, redémarrez |
| `EADDRINUSE` sur 3002 ou 3000 | un serveur tourne déjà | `lsof -i :3002` puis `kill <PID>` |
| Google login refusé | domaine non autorisé dans Firebase | utilisez email/mot de passe, ou un nom de domaine (une IP ne peut pas être autorisée) |
| Emails non reçus | `FROM_EMAIL` non autorisé par le SMTP, ou `FROM_EMAIL` défini deux fois | vérifiez `npm run check:env` |
| Vidéo illisible | lien signé expiré (1 h) | rechargez la page |
