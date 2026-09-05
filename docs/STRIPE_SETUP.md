# Configuration Stripe

Guide complet pour configurer Stripe avec Stripe Connect pour la plateforme UGC.

## 🎯 Vue d'ensemble

L'application utilise :
- **Stripe Connect** pour les paiements aux créateurs
- **Payment Intents** avec capture manuelle (hold & release)
- **Webhooks** pour les notifications d'événements

## 📋 Prérequis

1. Compte Stripe créé sur [stripe.com](https://stripe.com)
2. Stripe Connect activé

## 🔧 Configuration initiale

### 1. Activer Stripe Connect

1. Allez sur [Stripe Dashboard](https://dashboard.stripe.com)
2. **Connect** → **Get started**
3. Choisissez **Platform or marketplace**
4. Suivez les étapes de configuration

### 2. Récupérer les clés API

#### Mode TEST (développement)

1. Dashboard → **Developers** → **API keys**
2. Copiez :
   - **Publishable key** (commence par `pk_test_...`)
   - **Secret key** (commence par `sk_test_...`)

#### Mode LIVE (production)

1. Activez le mode LIVE (toggle en haut à droite)
2. Dashboard → **Developers** → **API keys**
3. Copiez :
   - **Publishable key** (commence par `pk_live_...`)
   - **Secret key** (commence par `sk_live_...`)

### 3. Configuration des variables d'environnement

**Backend** (`backend/.env`) :
```env
# Stripe (clés TEST pour développement)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PLATFORM_FEE_PERCENT=10
```

**Frontend** (`frontend/.env.local`) :
```env
# Stripe (clé publique TEST)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
```

## 🔔 Configuration des Webhooks

### Événements nécessaires

L'application écoute ces 6 événements Stripe :

| Événement | Description | Utilisation |
|-----------|-------------|-------------|
| `account.updated` | Compte Connect mis à jour | Vérification du statut du compte créateur |
| `payment_intent.succeeded` | Paiement réussi | Confirmation du paiement de la marque |
| `payment_intent.payment_failed` | Paiement échoué | Notification d'échec de paiement |
| `transfer.created` | Transfert créé | Confirmation du transfert au créateur |
| `transfer.reversed` | Transfert inversé | Notification d'annulation/remboursement |
| `transfer.updated` | Transfert mis à jour | Mise à jour du statut du transfert |

### Configuration en développement (avec ngrok)

1. **Installer ngrok** :
```bash
npm install -g ngrok
```

2. **Démarrer votre backend** :
```bash
cd backend
npm run dev
```

3. **Exposer votre serveur local** (dans un autre terminal) :
```bash
ngrok http 3000
```

Ngrok affichera une URL comme : `https://abc123.ngrok-free.app`

4. **Configurer le webhook dans Stripe** :
   - Allez sur [Stripe Dashboard](https://dashboard.stripe.com/test/webhooks)
   - Cliquez sur **Add endpoint**
   - **Endpoint URL** : `https://abc123.ngrok-free.app/api/webhooks/stripe`
   - **Events to send** : Sélectionnez ces 6 événements :
     - ✅ `account.updated`
     - ✅ `payment_intent.succeeded`
     - ✅ `payment_intent.payment_failed`
     - ✅ `transfer.created`
     - ✅ `transfer.reversed`
     - ✅ `transfer.updated`
   - Cliquez sur **Add endpoint**
   - Copiez le **Signing secret** (commence par `whsec_...`)
   - Ajoutez-le dans `backend/.env` :
     ```env
     STRIPE_WEBHOOK_SECRET=whsec_xxxxx
     ```

### Configuration en production

1. **Configurer le webhook** :
   - Allez sur [Stripe Dashboard](https://dashboard.stripe.com/webhooks) (mode LIVE)
   - Cliquez sur **Add endpoint**
   - **Endpoint URL** : `https://api.votre-domaine.com/api/webhooks/stripe`
   - **Events to send** : Sélectionnez les mêmes 6 événements
   - Cliquez sur **Add endpoint**
   - Copiez le **Signing secret**
   - Ajoutez-le dans vos variables d'environnement de production

## 💳 Workflow de paiement

### 1. Création de la livraison (Delivery)

Quand une marque sélectionne un créateur :

```javascript
// Le backend crée un Payment Intent avec capture manuelle
const paymentIntent = await stripe.paymentIntents.create({
  amount: 30000, // 300€ en centimes
  currency: 'eur',
  customer: brandStripeCustomerId,
  capture_method: 'manual', // HOLD le paiement
  metadata: {
    campaignId: '...',
    deliveryId: '...',
  },
});
```

**État** : Paiement en attente (held)

### 2. Soumission de la livraison

Le créateur upload les vidéos et soumet la livraison.

**État** : En attente de validation (7 jours pour approuver)

### 3. Approbation (manuelle ou automatique)

#### Option A : Approbation manuelle par la marque

```javascript
// Capture le paiement et transfert au créateur
await stripe.paymentIntents.capture(paymentIntentId);

const transfer = await stripe.transfers.create({
  amount: 27000, // 270€ (300€ - 10% commission)
  currency: 'eur',
  destination: creatorStripeAccountId,
});
```

#### Option B : Auto-approbation après 7 jours

Si la marque ne réagit pas, le système approuve automatiquement.

**État** : Paiement effectué, créateur payé

### 4. Révision (optionnel)

La marque peut demander jusqu'à 2 révisions.

**État** : Révision demandée, paiement toujours en attente

## 🧪 Tester les paiements

### Cartes de test Stripe

Utilisez ces numéros de carte en mode TEST :

| Carte | Numéro | Résultat |
|-------|--------|----------|
| Visa réussie | `4242 4242 4242 4242` | Paiement réussi |
| Visa échouée | `4000 0000 0000 0002` | Paiement refusé |
| 3D Secure | `4000 0027 6000 3184` | Nécessite authentification |

- **Date d'expiration** : N'importe quelle date future (ex: 12/34)
- **CVC** : N'importe quel 3 chiffres (ex: 123)
- **Code postal** : N'importe lequel

### Tester le workflow complet

1. **Créer un compte marque** (mode TEST)
2. **Créer une campagne**
3. **Créer un compte créateur** (mode TEST)
4. **Candidater à la campagne**
5. **Sélectionner le créateur** (en tant que marque)
   - Un Payment Intent sera créé
6. **Soumettre une livraison** (en tant que créateur)
7. **Approuver la livraison** (en tant que marque)
   - Le paiement sera capturé
   - Le transfert sera effectué

### Vérifier dans Stripe Dashboard

- **Payments** → Voir les Payment Intents
- **Connect** → **Transfers** → Voir les transferts aux créateurs
- **Webhooks** → Voir les événements reçus

## 🔒 Sécurité

### Vérification des webhooks

Le code vérifie automatiquement la signature des webhooks :

```javascript
const signature = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  req.body,
  signature,
  webhookSecret
);
```

**⚠️ Important** : Ne jamais désactiver cette vérification en production !

### Gestion des secrets

- ✅ Les clés secrètes sont dans `.env` (jamais commitées)
- ✅ Les clés publiques peuvent être exposées (frontend)
- ✅ Le webhook secret doit rester confidentiel

## 📊 Monitoring

### Dashboard Stripe

Surveillez :
- **Payments** : Tous les paiements
- **Connect** → **Accounts** : Comptes créateurs
- **Connect** → **Transfers** : Transferts effectués
- **Webhooks** : Événements reçus et erreurs

### Logs de l'application

Les webhooks sont loggés dans :
```
backend/logs/combined.log
```

Recherchez :
```bash
grep "Stripe webhook" backend/logs/combined.log
```

## 🐛 Dépannage

### Webhook non reçu

1. Vérifiez que ngrok est actif (en dev)
2. Vérifiez l'URL du webhook dans Stripe Dashboard
3. Vérifiez les logs Stripe : Dashboard → **Webhooks** → Votre endpoint → **Events**

### Erreur de signature

```
Error: No signatures found matching the expected signature for payload
```

**Solution** : Vérifiez que `STRIPE_WEBHOOK_SECRET` correspond au secret du webhook dans Stripe Dashboard

### Transfert échoué

Vérifiez que :
- Le compte créateur est complètement vérifié (Stripe Connect onboarding terminé)
- Le compte a les capacités `transfers` activées
- Le montant est suffisant (minimum 1€)

## 📚 Ressources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe API Reference](https://stripe.com/docs/api)

## 🎯 Checklist de production

Avant de passer en production :

- [ ] Clés LIVE configurées (pas TEST)
- [ ] Webhook configuré avec l'URL de production
- [ ] Webhook secret LIVE configuré
- [ ] Stripe Connect activé et vérifié
- [ ] Commission plateforme configurée (10%)
- [ ] Tests de paiement effectués
- [ ] Monitoring configuré
- [ ] Gestion des erreurs testée
