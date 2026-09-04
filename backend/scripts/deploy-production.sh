#!/bin/bash

# Script de déploiement PRODUCTION avec variables depuis fichier

set -e

echo "🚀 Déploiement PRODUCTION..."

# Vérifier que le fichier .env.production existe
if [ ! -f .env.production ]; then
    echo "❌ Erreur: Le fichier .env.production n'existe pas"
    echo "Copiez .env.production.example vers .env.production et configurez les variables"
    exit 1
fi

# Demander confirmation
echo "⚠️  ATTENTION: Vous êtes sur le point de déployer en PRODUCTION!"
read -p "Êtes-vous sûr de vouloir continuer? (tapez 'yes' pour confirmer): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Déploiement annulé"
    exit 0
fi

# Charger les variables et construire les arguments pour wrangler
echo "📦 Chargement des variables d'environnement..."

# Créer un fichier temporaire pour les variables
TEMP_VARS=$(mktemp)

# Lire le fichier .env.production et formater pour wrangler
while IFS='=' read -r key value; do
    # Ignorer les commentaires et lignes vides
    if [[ ! $key =~ ^# ]] && [[ -n $key ]]; then
        # Nettoyer la clé et la valeur
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)
        # Enlever les guillemets autour de la valeur si présents
        value=$(echo "$value" | sed 's/^"//;s/"$//')
        echo "--var $key:$value" >> "$TEMP_VARS"
    fi
done < .env.production

# Construire la commande wrangler avec toutes les variables
WRANGLER_CMD="npx wrangler deploy --env production"
while read -r var_arg; do
    WRANGLER_CMD="$WRANGLER_CMD $var_arg"
done < "$TEMP_VARS"

# Nettoyer le fichier temporaire
rm "$TEMP_VARS"

# Déployer
echo "📦 Déploiement sur Cloudflare Workers (production)..."
eval $WRANGLER_CMD

echo ""
echo "✅ Déploiement PRODUCTION terminé!"
echo "🌐 Votre API est disponible sur:"
echo "   https://ugc-platform-api-prod.votre-compte.workers.dev"
echo ""
echo "💡 Pour voir les logs en temps réel:"
echo "   npx wrangler tail --env production"
echo ""
echo "⚠️  N'oubliez pas de:"
echo "   1. Configurer les webhooks Stripe avec la nouvelle URL"
echo "   2. Mettre à jour NEXT_PUBLIC_API_URL dans le frontend"
echo "   3. Tester le workflow complet"
