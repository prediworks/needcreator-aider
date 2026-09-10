#!/usr/bin/env bash
# =============================================================================
# Installation complète de NeedCreator sur un VPS Ubuntu 22.04 / 24.04 neuf
#
# Usage (en root, sur le serveur) :
#   apt-get install -y screen
#   wget https://raw.githubusercontent.com/prediworks/needcreator-aider/main/scripts/vps-setup.sh
#   nano vps-setup.sh        # remplir la section CONFIGURATION
#   screen -S setup          # le script survit à une coupure SSH ; reprendre avec : screen -r setup
#   bash vps-setup.sh
#
# Journal : /var/log/vps-setup.log
#
# Le script peut être relancé sans casser ce qui est déjà installé.
# À la fin, il reste deux étapes manuelles : remplir les fichiers .env,
# puis relancer `bash vps-setup.sh --finish` pour builder et démarrer.
# =============================================================================
set -euo pipefail

# ----------------------------- CONFIGURATION ---------------------------------
APP_DOMAIN="needcreator.com"            # site + application (Next.js), domaine canonique pour le SEO
APP_REDIRECT_DOMAINS="www.needcreator.com app.needcreator.com"   # redirigés (301) vers APP_DOMAIN ; vide = aucun
API_DOMAIN="api.needcreator.com"        # backend (Express)
LETSENCRYPT_EMAIL="contact@needcreator.com"
REPO_URL="https://github.com/prediworks/needcreator-aider.git"
DEPLOY_USER="needcreator"                # utilisateur non-root qui fait tourner l'app
SSH_PORT="22"                            # changez-le (ex. 2222) pour réduire le bruit
ADMIN_SSH_PUBKEY=""                      # votre clé publique SSH (obligatoire pour désactiver le mot de passe)
KEEP_ROOT_PASSWORD="true"                # "true" = root garde sa connexion par mot de passe (config root inchangée)
CLOUDFLARE_ONLY="true"                  # "true" = n'accepter le web (80/443) que depuis Cloudflare
# -----------------------------------------------------------------------------

APP_DIR="/home/${DEPLOY_USER}/dev/needcreator-aider"
BACKEND_PORT=3002
FRONTEND_PORT=3000

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m!!  $*\033[0m"; }

[[ $EUID -eq 0 ]] || { echo "Lancez ce script en root (sudo bash vps-setup.sh)"; exit 1; }

# Journal complet dans /var/log/vps-setup.log (utile si la session SSH tombe)
exec > >(tee -a /var/log/vps-setup.log) 2>&1
echo "=== $(date) : lancement $0 ${1:-} ==="

# =============================================================================
# --finish : build + démarrage, une fois les .env remplis
# =============================================================================
if [[ -n "${1:-}" && "${1:-}" != "--finish" ]]; then
  echo "Option inconnue : '$1'. Usage : bash vps-setup.sh   ou   bash vps-setup.sh --finish"; exit 1
fi
if [[ "${1:-}" == "--finish" ]]; then
  log "Mise à jour du dépôt"
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" checkout -- backend/package-lock.json frontend/package-lock.json 2>/dev/null || true
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" pull --ff-only || warn "git pull impossible : vérifiez les modifications locales dans $APP_DIR"

  log "Installation des dépendances"
  for d in backend frontend; do
    sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR/$d && (npm ci $([[ $d == backend ]] && echo --omit=dev) || npm install $([[ $d == backend ]] && echo --omit=dev))"
  done

  log "Vérification des fichiers .env"
  [[ -f "$APP_DIR/backend/.env" ]] || { echo "Manque $APP_DIR/backend/.env"; exit 1; }
  [[ -f "$APP_DIR/frontend/.env.local" ]] || { echo "Manque $APP_DIR/frontend/.env.local"; exit 1; }

  log "Backend : vérification de la configuration (npm run check:env)"
  sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR/backend && npm run check:env" || warn "check:env signale des erreurs, corrigez backend/.env"

  log "Bucket R2 : autorisation des envois directs depuis le site (CORS)"
  sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR/backend && npm run r2:cors" || warn "CORS R2 non appliqué : les envois de vidéos échoueront. Relancez : npm run r2:cors"

  log "Frontend : build de production"
  sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR/frontend && npm run build"

  log "Démarrage avec PM2"
  sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR && pm2 delete needcreator-api needcreator-web >/dev/null 2>&1 || true"
  sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR/backend && NODE_ENV=production PORT=$BACKEND_PORT pm2 start src/index.js --name needcreator-api"
  sudo -u "$DEPLOY_USER" bash -c "cd $APP_DIR/frontend && PORT=$FRONTEND_PORT pm2 start npm --name needcreator-web -- start"
  sudo -u "$DEPLOY_USER" pm2 save
  log "Terminé. Vérifiez : https://$APP_DOMAIN et https://$API_DOMAIN/health"
  exit 0
fi

# =============================================================================
# 1. Système à jour + mises à jour de sécurité automatiques
# =============================================================================
log "Mise à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl git ufw fail2ban nginx unattended-upgrades apt-listchanges \
  ca-certificates gnupg lsb-release logrotate htop

log "Mises à jour de sécurité automatiques"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
sed -i 's|^//\s*"${distro_id}:${distro_codename}-security";|        "${distro_id}:${distro_codename}-security";|' /etc/apt/apt.conf.d/50unattended-upgrades
sed -i 's|^//Unattended-Upgrade::Automatic-Reboot "false";|Unattended-Upgrade::Automatic-Reboot "true";|' /etc/apt/apt.conf.d/50unattended-upgrades
sed -i 's|^//Unattended-Upgrade::Automatic-Reboot-Time "02:00";|Unattended-Upgrade::Automatic-Reboot-Time "04:30";|' /etc/apt/apt.conf.d/50unattended-upgrades

# =============================================================================
# 2. Swap (les builds Next.js consomment de la mémoire)
# =============================================================================
if [[ ! -f /swapfile ]]; then
  log "Création d'un swap de 2 Go"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# =============================================================================
# 3. Utilisateur de déploiement (non-root)
# =============================================================================
if ! id "$DEPLOY_USER" &>/dev/null; then
  log "Création de l'utilisateur $DEPLOY_USER"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
if [[ -z "$ADMIN_SSH_PUBKEY" && "$KEEP_ROOT_PASSWORD" != "true" ]] && ! passwd -S "$DEPLOY_USER" | grep -q " P "; then
  log "Mot de passe pour $DEPLOY_USER (root ne pourra plus se connecter par mot de passe)"
  passwd "$DEPLOY_USER"
fi
if [[ -n "$ADMIN_SSH_PUBKEY" ]]; then
  for u in root "$DEPLOY_USER"; do
    h=$(eval echo "~$u"); mkdir -p "$h/.ssh"; chmod 700 "$h/.ssh"
    grep -qF "$ADMIN_SSH_PUBKEY" "$h/.ssh/authorized_keys" 2>/dev/null || echo "$ADMIN_SSH_PUBKEY" >> "$h/.ssh/authorized_keys"
    chmod 600 "$h/.ssh/authorized_keys"; chown -R "$u:$u" "$h/.ssh"
  done
fi

# =============================================================================
# 4. SSH durci
# =============================================================================
log "Durcissement SSH (port $SSH_PORT)"
mkdir -p /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-hardening.conf <<EOF
Port $SSH_PORT
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
if [[ "$KEEP_ROOT_PASSWORD" != "true" ]]; then
  echo "PermitRootLogin prohibit-password" >> /etc/ssh/sshd_config.d/99-hardening.conf
fi
if [[ -n "$ADMIN_SSH_PUBKEY" && "$KEEP_ROOT_PASSWORD" != "true" ]]; then
  echo "PasswordAuthentication no" >> /etc/ssh/sshd_config.d/99-hardening.conf
else
  warn "Authentification par mot de passe conservée (protégée par Fail2ban et UFW). Utilisez un mot de passe long."
fi
sshd -t
# Ubuntu 24.04 : SSH est piloté par ssh.socket, qui doit être rechargé pour prendre le nouveau port
systemctl daemon-reload
if systemctl is-enabled ssh.socket >/dev/null 2>&1; then
  systemctl restart ssh.socket || true
fi
systemctl reload ssh || systemctl restart ssh

# =============================================================================
# 5. Pare-feu UFW
# =============================================================================
log "Pare-feu UFW"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw limit "$SSH_PORT"/tcp comment 'SSH (limité)'
if [[ "$SSH_PORT" != "22" ]]; then
  # On garde le port 22 ouvert tant que le nouveau port n'est pas confirmé
  ufw limit 22/tcp comment 'SSH ancien port (à supprimer : ufw delete limit 22/tcp)'
  warn "Port 22 laissé ouvert. Une fois connecté sur $SSH_PORT : ufw delete limit 22/tcp"
fi
if [[ "$CLOUDFLARE_ONLY" == "true" ]]; then
  log "Web autorisé uniquement depuis les IP Cloudflare"
  for ip in $(curl -fsSL https://www.cloudflare.com/ips-v4) $(curl -fsSL https://www.cloudflare.com/ips-v6); do
    ufw allow from "$ip" to any port 80,443 proto tcp comment 'Cloudflare' >/dev/null
  done
  # Rafraîchir la liste chaque semaine
  cat >/etc/cron.weekly/cloudflare-ips <<'EOF'
#!/bin/bash
for ip in $(curl -fsSL https://www.cloudflare.com/ips-v4) $(curl -fsSL https://www.cloudflare.com/ips-v6); do
  ufw allow from "$ip" to any port 80,443 proto tcp comment 'Cloudflare' >/dev/null
done
EOF
  chmod +x /etc/cron.weekly/cloudflare-ips
else
  ufw allow 80/tcp comment 'HTTP'
  ufw allow 443/tcp comment 'HTTPS'
fi
ufw --force enable
ufw status verbose

# =============================================================================
# 6. Fail2ban (SSH + Nginx)
# =============================================================================
log "Fail2ban"
cat >/etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
banaction = ufw

[sshd]
enabled = true
port    = $SSH_PORT
maxretry = 3
bantime = 24h

[nginx-http-auth]
enabled = true

[nginx-botsearch]
enabled = true
logpath = /var/log/nginx/access.log

[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# =============================================================================
# 7. Node.js 20 + PM2
# =============================================================================
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1)" != "v22" ]]; then
  log "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
command -v pm2 >/dev/null || { log "Installation de PM2"; npm install -g pm2 >/dev/null; }
log "PM2 au démarrage du serveur"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" >/dev/null
sudo -u "$DEPLOY_USER" pm2 install pm2-logrotate >/dev/null 2>&1 || true

# =============================================================================
# 8. Code de l'application
# =============================================================================
if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Clonage du dépôt"
  sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$APP_DIR"
else
  log "Mise à jour du dépôt"
  # Les lockfiles peuvent avoir été réécrits par npm install : on reprend ceux du dépôt
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" checkout -- backend/package-lock.json frontend/package-lock.json 2>/dev/null || true
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" pull --ff-only
fi
log "Installation des dépendances"
npm_install() { # npm ci si un package-lock.json existe, sinon npm install
  local dir="$1"; shift
  if [[ -f "$dir/package-lock.json" ]]; then
    sudo -u "$DEPLOY_USER" bash -c "cd $dir && npm ci $*" || {
      warn "npm ci a échoué (lockfile désynchronisé) : repli sur npm install"
      sudo -u "$DEPLOY_USER" bash -c "cd $dir && npm install $*"
    }
  else
    sudo -u "$DEPLOY_USER" bash -c "cd $dir && npm install $*"
  fi
}
npm_install "$APP_DIR/backend" --omit=dev
npm_install "$APP_DIR/frontend"
[[ -f "$APP_DIR/backend/.env" ]] || sudo -u "$DEPLOY_USER" cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
[[ -f "$APP_DIR/frontend/.env.local" ]] || sudo -u "$DEPLOY_USER" cp "$APP_DIR/frontend/.env.local.example" "$APP_DIR/frontend/.env.local"
chmod 600 "$APP_DIR/backend/.env" "$APP_DIR/frontend/.env.local"

# =============================================================================
# 9. Nginx (reverse proxy + limitation de débit + en-têtes de sécurité)
# =============================================================================
log "Configuration Nginx"
cat >/etc/nginx/conf.d/needcreator-common.conf <<'EOF'
limit_req_zone $binary_remote_addr zone=api_general:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=api_auth:10m rate=5r/m;
limit_conn_zone $binary_remote_addr zone=per_ip:10m;
server_tokens off;
EOF

if [[ "$CLOUDFLARE_ONLY" == "true" ]]; then
  # Voir la vraie IP du visiteur derrière Cloudflare
  { for ip in $(curl -fsSL https://www.cloudflare.com/ips-v4) $(curl -fsSL https://www.cloudflare.com/ips-v6); do echo "set_real_ip_from $ip;"; done
    echo "real_ip_header CF-Connecting-IP;"; } >/etc/nginx/conf.d/cloudflare-realip.conf
fi

cat >/etc/nginx/sites-available/needcreator-api <<EOF
server {
    listen 80;
    server_name $API_DOMAIN;
    client_max_body_size 550M;
    limit_conn per_ip 20;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/auth/ {
        limit_req zone=api_auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        include /etc/nginx/snippets/needcreator-proxy.conf;
    }
    location / {
        limit_req zone=api_general burst=40 nodelay;
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        include /etc/nginx/snippets/needcreator-proxy.conf;
    }
}
EOF

cat >/etc/nginx/sites-available/needcreator-web <<EOF
server {
    listen 80;
    server_name $APP_DOMAIN;
    limit_conn per_ip 30;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /_next/static/ {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        include /etc/nginx/snippets/needcreator-proxy.conf;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location / {
        limit_req zone=api_general burst=60 nodelay;
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        include /etc/nginx/snippets/needcreator-proxy.conf;
    }
}
EOF

if [[ -n "$APP_REDIRECT_DOMAINS" ]]; then
  cat >/etc/nginx/sites-available/needcreator-redirect <<EOF
server {
    listen 80;
    server_name $APP_REDIRECT_DOMAINS;
    return 301 https://$APP_DOMAIN\$request_uri;
}
EOF
  ln -sf /etc/nginx/sites-available/needcreator-redirect /etc/nginx/sites-enabled/needcreator-redirect
else
  rm -f /etc/nginx/sites-enabled/needcreator-redirect
fi

mkdir -p /etc/nginx/snippets
cat >/etc/nginx/snippets/needcreator-proxy.conf <<'EOF'
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_request_buffering off;
EOF

ln -sf /etc/nginx/sites-available/needcreator-api /etc/nginx/sites-enabled/needcreator-api
ln -sf /etc/nginx/sites-available/needcreator-web /etc/nginx/sites-enabled/needcreator-web
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

# =============================================================================
# 10. HTTPS Let's Encrypt (le DNS doit déjà pointer vers ce serveur)
# =============================================================================
log "Certificats HTTPS"
apt-get install -y -qq certbot python3-certbot-nginx
CERT_DOMAINS=(-d "$APP_DOMAIN" -d "$API_DOMAIN")
for d in $APP_REDIRECT_DOMAINS; do CERT_DOMAINS+=(-d "$d"); done
if certbot --nginx --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect --expand \
     "${CERT_DOMAINS[@]}"; then
  # HSTS une fois le HTTPS en place
  for f in needcreator-api needcreator-web; do
    grep -q Strict-Transport-Security /etc/nginx/sites-available/$f || \
      sed -i '/listen 443 ssl/a\    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' /etc/nginx/sites-available/$f
  done
  nginx -t && systemctl reload nginx
else
  warn "Certbot a échoué : vérifiez que $APP_DOMAIN et $API_DOMAIN pointent vers ce serveur (si Cloudflare est en proxy, mettez le mode SSL sur « Full (strict) » après obtention du certificat, ou passez temporairement en « DNS only »)."
fi

# =============================================================================
# Fin
# =============================================================================
cat <<EOF

=====================================================================
 Installation terminée. Étapes restantes :

 0. Connexion SSH : port $SSH_PORT. Root inchangé si KEEP_ROOT_PASSWORD=true, sinon utilisez $DEPLOY_USER (sudo).

 1. Remplir les secrets (en tant que $DEPLOY_USER) :
      nano $APP_DIR/backend/.env
        NODE_ENV=production, PORT=$BACKEND_PORT
        FRONTEND_URL=https://$APP_DOMAIN
        LEGAL_TERMS_VERSION (date des CGU), TURNSTILE_SECRET_KEY
        clés Stripe live, STRIPE_WEBHOOK_SECRET, JWT_SECRET fort,
        RATE_LIMIT_MAX_REQUESTS=300, CLOUDFLARE_PUBLIC_URL (domaine public R2)
      nano $APP_DIR/frontend/.env.local
        NEXT_PUBLIC_API_URL=https://$API_DOMAIN/api, NEXT_PUBLIC_SITE_URL=https://$APP_DOMAIN, clé Stripe pk_live_

 2. Builder et démarrer :
      bash vps-setup.sh --finish

 3. Créer le compte admin :
      sudo -u $DEPLOY_USER bash -c "cd $APP_DIR/backend && npm run make-admin -- votre@email"

 4. Stripe : webhook sur https://$API_DOMAIN/api/webhooks/stripe
    Firebase : ajouter $APP_DOMAIN aux domaines autorisés
    Cloudflare (si utilisé) : nuage orange sur app et api, SSL « Full (strict) »,
      Security → Bots → Bot Fight Mode, WAF → règle de limitation sur /api/auth

 Mise à jour ultérieure :
      sudo -u $DEPLOY_USER git -C $APP_DIR pull && bash vps-setup.sh --finish

 Commandes utiles : pm2 logs, pm2 status, fail2ban-client status sshd, ufw status
=====================================================================
EOF
