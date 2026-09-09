# Déploiement

## Ce que le backend a besoin

Le backend est une application **Node.js/Express classique** qui doit tourner en continu. Elle utilise des capacités incompatibles avec les plateformes « serverless » (Cloudflare Workers, Vercel Functions, Firebase Functions, Scaleway Functions) :

- **ffmpeg** embarqué (`ffmpeg-static`) et fichiers temporaires pour le pack vidéo ;
- **tâches planifiées** en mémoire (auto-approbation à J+7, rappels, fin d'avant-première) ;
- **traitements en arrière-plan** après réponse HTTP ;
- **uploads de vidéos** jusqu'à 500 Mo.

Les anciens fichiers de déploiement serverless (Wrangler, Vercel Functions, Serverless Framework, Netlify) ont été retirés du dépôt.

## Architecture recommandée

| Composant | Choix recommandé | Alternatives |
|---|---|---|
| Backend | **VPS** (Ubuntu, 2 vCPU / 4 Go, ex. Scaleway, OVH, Hetzner) avec Node 22, PM2 et Nginx | Railway, Render (offres « web service » Node classiques) |
| Frontend | **Vercel** (Next.js natif) | Cloudflare Pages, ou le même VPS avec `next start` derrière Nginx |
| Base de données | MongoDB Atlas (sauvegardes automatiques) | |
| Vidéos | Cloudflare R2 avec domaine public activé | |
| Emails | SMTP (OVH, Brevo…) | |

Pour une exigence de données hébergées en France : VPS Scaleway ou OVH pour le backend et le frontend, MongoDB Atlas région Paris, R2 région EU.

## 1. Backend sur un VPS

### Installation automatique (recommandé)

Le script `scripts/vps-setup.sh` installe tout sur un Ubuntu 22.04/24.04 neuf. Le site est servi sur le domaine racine (`needcreator.com`, canonique pour le référencement) et `www` / `app` y sont redirigés. Il installe : mises à jour de sécurité automatiques, utilisateur non-root, SSH durci, pare-feu UFW, Fail2ban, Node 22, PM2, Nginx avec limitation de débit, HTTPS Let's Encrypt, clonage et installation du backend et du frontend. Option `CLOUDFLARE_ONLY=true` pour n'accepter le trafic web que via le proxy Cloudflare (protection DDoS, Bot Fight Mode, WAF).

```bash
apt-get install -y screen
wget https://raw.githubusercontent.com/prediworks/needcreator-aider/main/scripts/vps-setup.sh
nano vps-setup.sh            # section CONFIGURATION : domaines, email, clé SSH
screen -S setup              # protège l'installation d'une coupure SSH (reprise : screen -r setup)
bash vps-setup.sh            # installation (journal : /var/log/vps-setup.log)
# remplir backend/.env et frontend/.env.local, puis :
sudo bash vps-setup.sh --finish
```

### Installation manuelle

```bash
# Sur le serveur
sudo apt update && sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pm2

git clone https://github.com/prediworks/needcreator-aider.git
cd needcreator-aider/backend
npm ci
cp .env.example .env   # puis remplir avec les valeurs de production
npm run check:env      # tout doit être ✅

pm2 start src/index.js --name needcreator-api
pm2 save && pm2 startup
```

Nginx (reverse proxy vers le port 3002, uploads jusqu'à 500 Mo) :

```nginx
server {
  server_name api.needcreator.com;
  client_max_body_size 550M;
  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
  }
}
```

Puis `sudo certbot --nginx -d api.needcreator.com` pour le HTTPS.

Variables de production à adapter dans `backend/.env` :

- `NODE_ENV=production`, `PORT=3002`
- `FRONTEND_URL=https://app.needcreator.com`
- clés Stripe **live**, `STRIPE_WEBHOOK_SECRET` du webhook de production
- `CLOUDFLARE_PUBLIC_URL` = domaine public du bucket
- `JWT_SECRET` fort et unique (`openssl rand -base64 32`)
- `RATE_LIMIT_MAX_REQUESTS=300`
- `STRIPE_AUTO_CONFIRM_TEST` absent
- `SHOPIFY_APP_URL=https://api.needcreator.com` si Shopify est utilisé

Mise à jour : `git pull && npm ci && pm2 restart needcreator-api`.

## 2. Frontend sur Vercel

1. Importez le dépôt sur vercel.com, **Root Directory** : `frontend`.
2. Variables d'environnement : celles de `frontend/.env.local.example`, avec `NEXT_PUBLIC_API_URL=https://api.needcreator.com/api` et la clé Stripe `pk_live_`.
3. Ajoutez votre domaine (`app.needcreator.com`).
4. Firebase → Authentication → Settings → Authorized domains : ajoutez ce domaine (nécessaire pour Google login).

Alternative sur le VPS : `cd frontend && npm ci && npm run build && pm2 start "npm start" --name needcreator-web` derrière Nginx.

## 3. Après la mise en ligne

- [ ] Webhook Stripe déclaré sur `https://api.needcreator.com/api/webhooks/stripe` (événements listés dans [STRIPE_SETUP.md](./STRIPE_SETUP.md)) et secret live dans `.env`
- [ ] Portail client Stripe activé
- [ ] Domaine public R2 actif et `CLOUDFLARE_PUBLIC_URL` mis à jour
- [ ] `npm run check:env` sur le serveur : tout ✅
- [ ] Compte admin créé (`npm run make-admin -- email`)
- [ ] Turnstile : site créé sur Cloudflare pour `needcreator.com`, clés dans `frontend/.env.local` et `backend/.env`
- [ ] Mentions légales : compléter `frontend/src/lib/legal.ts` (raison sociale, SIREN, adresse, hébergeur, directeur de publication)
- [ ] SEO : `NEXT_PUBLIC_SITE_URL=https://needcreator.com`, site déclaré dans Google Search Console (sitemap : `/sitemap.xml`)
- [ ] Sauvegardes MongoDB Atlas activées
- [ ] Monitoring : `pm2 logs needcreator-api`, et un outil externe (UptimeRobot sur `/health`, Sentry) recommandé
- [ ] Test complet en conditions réelles : inscription marque, vérification SIRET, campagne, sélection, carte, livraison, virement à un créateur

## 4. Intégration continue (optionnel)

Un workflow GitHub Actions peut lancer le type-check du frontend à chaque push, et le test de bout en bout contre un backend de préproduction. Exemple minimal :

```yaml
name: CI
on: [push]
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd frontend && npm ci && npx tsc --noEmit
```

Le test de bout en bout (`npm run test:e2e`) nécessite un backend démarré avec de vraies clés de test : à réserver à un environnement de préproduction plutôt qu'à un job public.
