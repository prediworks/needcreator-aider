# Checklist de configuration

## Services (obligatoires)

- [ ] **MongoDB Atlas** : cluster créé, utilisateur créé, IP autorisée, `MONGODB_URI` renseignée
- [ ] **Firebase** : projet créé, Email/Password activé, clé de service dans `backend/.env`, clés publiques dans `frontend/.env.local`
- [ ] **Stripe** : clés test renseignées (backend et frontend), Stripe Connect activé, portail client activé
- [ ] **Cloudflare R2** : bucket créé, token d'accès, variables `CLOUDFLARE_*` renseignées
- [ ] **Email SMTP** : `SMTP_*` et `FROM_EMAIL` renseignés (adresse autorisée par le serveur)

## Services (optionnels)

- [ ] Fournisseur IA (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`) pour le brief IA
- [ ] `OPENAI_API_KEY` pour les sous-titres automatiques
- [ ] Application Shopify (`SHOPIFY_*`)
- [ ] Webhook Stripe (Stripe CLI en local, URL publique en production)

## Installation

- [ ] Node.js 20+ installé
- [ ] `cd backend && npm install`
- [ ] `cd frontend && npm install`
- [ ] `backend/.env` créé depuis `.env.example` (`PORT=3002`, `FRONTEND_URL` avec l'adresse du frontend)
- [ ] `frontend/.env.local` créé depuis `.env.local.example` (`NEXT_PUBLIC_API_URL` vers le port 3002)

## Vérification

- [ ] `cd backend && npm run check:env` : tout ✅ (sauf éventuellement « R2 URL publique »)
- [ ] Backend démarre (`npm run dev`, port 3002)
- [ ] Frontend démarre (`npm run dev`, port 3000)
- [ ] `cd backend && npm run test:e2e -- --clean` : toutes les étapes OK
- [ ] Compte admin créé (`npm run make-admin -- email`) et menu Administration visible

## Parcours manuel minimal

- [ ] Inscription marque → vérification d'entreprise (SIRET) → campagne publiée
- [ ] Inscription créateur → 3 vidéos → validation admin → devis envoyé
- [ ] Sélection → carte de test 4242 → livraison → approbation → avis

Guide détaillé : [GUIDE-TEST.md](./GUIDE-TEST.md).
