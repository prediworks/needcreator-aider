# Configuration Stripe

Stripe gère quatre choses dans NeedCreator :

1. **Paiement des missions** : la marque saisit sa carte à la sélection du créateur ; le montant est autorisé (bloqué), puis prélevé à la validation de la livraison.
2. **Virement aux créateurs** via Stripe Connect (comptes Express).
3. **Abonnement Pro** des marques (Stripe Checkout et portail client).
4. **Options payantes** : pack vidéo prête à diffuser, frais de plateforme des campagnes gifting.

## 1. Clés API

Dashboard → Developers → API keys :

- `sk_test_…` → `STRIPE_SECRET_KEY` dans `backend/.env`
- `pk_test_…` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` dans `frontend/.env.local`

En production, utilisez les clés `sk_live_` / `pk_live_`.

## 2. Stripe Connect (obligatoire pour payer les créateurs)

Dashboard → Connect → Get started → « Platform or marketplace ». Sans cette activation, les marques sont bien débitées mais les virements aux créateurs échouent avec le message « You can only create new accounts if you've signed up for Connect ». Dans ce cas la livraison est marquée « encaissée, virement en attente » et le virement part automatiquement dès que le créateur a connecté son compte.

Le créateur connecte son compte depuis son profil (« Recevoir mes paiements ») : NeedCreator crée un compte Express et le renvoie vers l'onboarding Stripe.

## 3. Abonnement Pro

- Le produit et le prix (79 €/mois, `lookup_key` `needcreator_pro_monthly`) sont créés automatiquement au premier clic sur « Souscrire ». Pour utiliser un prix existant, renseignez `STRIPE_PRO_PRICE_ID`.
- L'essai de 14 jours offert à l'inscription est géré par NeedCreator, sans carte ni objet Stripe.
- **Portail client** (bouton « Gérer mon abonnement ») : activez-le une fois dans Dashboard → Settings → Billing → Customer portal, sinon le bouton renvoie une erreur.

## 4. Webhooks

URL à déclarer : `https://<votre-api>/api/webhooks/stripe`. Secret de signature → `STRIPE_WEBHOOK_SECRET`.

Événements à cocher :

| Événement | Utilisation |
|---|---|
| `payment_intent.amount_capturable_updated` | carte confirmée : le montant de la mission est bloqué (filet de sécurité si la marque ferme la page) |
| `payment_intent.payment_failed` | paiement refusé |
| `account.updated` | statut du compte Connect du créateur (virements activés) |
| `transfer.created`, `transfer.reversed`, `transfer.updated` | suivi des virements aux créateurs |
| `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` | abonnement Pro |

Les webhooks ne sont pas indispensables pour tester : la confirmation de carte et le retour de Checkout resynchronisent l'état directement.

### En local

Le serveur n'est pas joignable par Stripe. Deux options :

```bash
# Option 1 : Stripe CLI (recommandé)
stripe login
stripe listen --forward-to localhost:3002/api/webhooks/stripe
# copiez le whsec_... affiché dans STRIPE_WEBHOOK_SECRET

# Option 2 : ngrok
ngrok http 3002
# déclarez https://xxxx.ngrok-free.app/api/webhooks/stripe dans le dashboard (mode test)
```

## 5. Flux de paiement d'une mission

| Étape | Ce qui se passe côté Stripe |
|---|---|
| La marque accepte un devis | PaymentIntent créé avec capture manuelle (`payment_method_types: card`) |
| Écran de carte sur la page livraison | `confirmCardPayment` côté navigateur, puis `/confirm-payment` vérifie le statut `requires_capture` → montant bloqué |
| Campagne multi-créateurs | une seule saisie de carte (SetupIntent) puis confirmation de chaque PaymentIntent avec la carte enregistrée |
| Approbation (manuelle ou automatique à J+7) | capture du paiement, puis transfert au créateur (montant − commission) si son compte Connect est prêt |
| Gifting | seuls les frais de plateforme (5 € par vidéo) sont autorisés puis capturés ; rien n'est reversé |
| Pack prêt à diffuser | PaymentIntent à capture immédiate, traitement lancé après confirmation |

En développement, `STRIPE_AUTO_CONFIRM_TEST=true` confirme automatiquement les paiements avec une carte de test, sans écran de saisie (utile pour des tests rapides ; ignoré en production).

## 6. Tester

Cartes de test : `4242 4242 4242 4242` (succès), `4000 0000 0000 0002` (refusée), `4000 0027 6000 3184` (3D Secure). Date future, CVC quelconque.

Le test automatique `cd backend && npm run test:e2e -- --clean` couvre l'ensemble : autorisation, confirmation, capture, paiement groupé, gifting, pack vidéo, session Checkout de l'abonnement, onboarding Connect.

Dans le dashboard : Payments (PaymentIntents), Connect → Accounts et Transfers, Billing → Subscriptions, Developers → Webhooks → Events.

## 7. Avant la production

- [ ] Clés live dans `backend/.env` et `frontend/.env.local`
- [ ] Stripe Connect activé et compte plateforme vérifié
- [ ] Webhook déclaré avec l'URL de production et son secret live
- [ ] Portail client activé
- [ ] `STRIPE_AUTO_CONFIRM_TEST` absent ou `false`
- [ ] Un virement réel testé vers un créateur ayant terminé son onboarding
