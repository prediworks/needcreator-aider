#!/bin/bash

# Script de déploiement PREPROD avec variables depuis fichier

set -e

echo "🚀 Déploiement PREPROD..."

# Vérifier que le fichier .env.preprod existe
if [ ! -f .env.preprod ]; then
    echo "❌ Erreur: Le fichier .env.preprod n'existe pas"
    echo "Copiez .env.preprod.example vers .env.preprod et configurez les variables"
    exit 1
fi

# Charger les variables et construire les arguments pour wrangler
echo "📦 Chargement des variables d'environnement..."

# Créer un fichier temporaire pour les variables
TEMP_VARS=$(mktemp)

# Lire le fichier .env.preprod et formater pour wrangler
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
done < .env.preprod

# Construire la commande wrangler avec toutes les variables
WRANGLER_CMD="npx wrangler deploy --env preprod"
while read -r var_arg; do
    WRANGLER_CMD="$WRANGLER_CMD $var_arg"
done < "$TEMP_VARS"

# Nettoyer le fichier temporaire
rm "$TEMP_VARS"

# Déployer
echo "📦 Déploiement sur Cloudflare Workers (preprod)..."
eval $WRANGLER_CMD

echo ""
echo "✅ Déploiement PREPROD terminé!"
echo "🌐 Votre API est disponible sur:"
echo "   https://ugc-platform-api-preprod.votre-compte.workers.dev"
echo ""
echo "💡 Pour voir les logs en temps réel:"
echo "   npx wrangler tail --env preprod"
