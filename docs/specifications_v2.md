# Spécifications Fonctionnelles - Plateforme UGC
## Version 2.0 - Simplifiée et Optimisée

---

## 1. VISION & POSITIONNEMENT

### 1.1 Proposition de valeur unique
**"La plateforme UGC la plus simple et transparente du marché"**

**Différenciateurs clés :**
1. **Matching IA intelligent** - Pas de recherche manuelle fastidieuse
2. **Tarification transparente** - Prix affichés dès la navigation
3. **Paiement sécurisé moderne** - Via Stripe Connect (pas de séquestre)
4. **Validation automatique** - Pas de blocage si la marque ne répond pas
5. **Portfolio vidéo interactif** - Aperçu immédiat du style des créateurs
6. **Analytics temps réel** - Dashboard de performance pour les marques

### 1.2 Personas cibles

**Marques (Annonceurs) :**
- PME e-commerce (budget 500-5000€/mois)
- Startups tech (besoin de contenu authentique)
- Agences marketing (gestion multi-clients)

**Créateurs :**
- Micro-créateurs (1K-50K followers)
- Créateurs UGC professionnels
- Influenceurs cherchant revenus complémentaires

---

## 2. ARCHITECTURE SIMPLIFIÉE

### 2.1 Stack technique
- **Backend** : Node.js + Express
- **Base de données** : MongoDB Atlas
- **Authentification** : Firebase Auth
- **Paiements** : Stripe Connect
- **Storage** : Cloudflare R2 ou Firebase Storage
- **Hosting** : Cloudflare Pages / Firebase Hosting
- **CDN** : Cloudflare

### 2.2 Collections MongoDB principales

```javascript
// Users (créateurs + marques)
{
  _id: ObjectId,
  email: String,
  role: "creator" | "brand",
  profile: {
    name: String,
    avatar: String,
    bio: String,
    // Spécifique créateur
    portfolio: [{ videoUrl, thumbnail, title, stats }],
    niches: [String],
    pricing: { minPrice: Number, avgPrice: Number },
    stats: { completedJobs, rating, responseTime },
    // Spécifique marque
    companyName: String,
    website: String,
    industry: String
  },
  stripeAccountId: String, // Pour les créateurs
  stripeCustomerId: String, // Pour les marques
  createdAt: Date,
  updatedAt: Date
}

// Campaigns (missions)
{
  _id: ObjectId,
  brandId: ObjectId,
  title: String,
  description: String,
  brief: {
    videoType: String, // "testimonial", "unboxing", "demo", etc.
    duration: Number, // secondes
    deliverables: Number, // nombre de vidéos
    requirements: [String],
    examples: [String] // URLs de références
  },
  budget: {
    total: Number,
    perVideo: Number
  },
  status: "draft" | "active" | "completed" | "cancelled",
  matching: {
    niches: [String],
    minRating: Number,
    preferredCreators: [ObjectId]
  },
  timeline: {
    publishedAt: Date,
    deadline: Date,
    estimatedDelivery: Date
  },
  applications: [{
    creatorId: ObjectId,
    appliedAt: Date,
    status: "pending" | "accepted" | "rejected",
    proposal: String,
    price: Number
  }],
  selectedCreator: ObjectId,
  createdAt: Date,
  updatedAt: Date
}

// Deliveries (livrables)
{
  _id: ObjectId,
  campaignId: ObjectId,
  creatorId: ObjectId,
  brandId: ObjectId,
  files: [{
    url: String,
    type: "video" | "image",
    thumbnail: String,
    uploadedAt: Date
  }],
  status: "pending" | "submitted" | "revision_requested" | "approved" | "auto_approved",
  revisions: [{
    requestedAt: Date,
    feedback: String,
    resolvedAt: Date
  }],
  payment: {
    amount: Number,
    stripePaymentIntentId: String,
    status: "pending" | "held" | "released",
    releasedAt: Date
  },
  autoApprovalDate: Date, // 7 jours après soumission
  createdAt: Date,
  updatedAt: Date
}

// Reviews (bidirectionnel)
{
  _id: ObjectId,
  campaignId: ObjectId,
  reviewerId: ObjectId, // Qui donne l'avis
  revieweeId: ObjectId, // Qui reçoit l'avis
  rating: Number, // 1-5
  comment: String,
  criteria: {
    communication: Number,
    quality: Number,
    timeliness: Number,
    professionalism: Number
  },
  createdAt: Date
}
```

---

## 3. PARCOURS UTILISATEURS SIMPLIFIÉS

### 3.1 Parcours Marque

**A. Inscription (2 min)**
1. Email + mot de passe (Firebase Auth)
2. Nom entreprise + site web
3. Secteur d'activité (dropdown)
4. ✅ Compte créé → Dashboard

**B. Création de campagne (5 min)**
1. **Étape 1** : Titre + description courte
2. **Étape 2** : Type de vidéo (sélection visuelle avec exemples)
3. **Étape 3** : Brief détaillé (template pré-rempli)
4. **Étape 4** : Budget (suggestion automatique basée sur le marché)
5. **Étape 5** : Matching (niches + critères optionnels)
6. ✅ Publication → Notifications aux créateurs matchés

**C. Sélection créateur (1 min)**
1. Réception des candidatures (avec vidéos portfolio)
2. Tri par score de matching IA
3. Clic sur "Accepter" → Paiement Stripe
4. ✅ Créateur notifié + paiement en attente

**D. Réception & validation (2 min)**
1. Notification de livraison
2. Prévisualisation vidéos
3. Options :
   - ✅ Approuver → Paiement libéré au créateur
   - 🔄 Demander révision (max 2)
   - ⏱️ Pas de réponse sous 7j → Approbation auto

**E. Review (1 min)**
1. Noter le créateur (1-5 étoiles)
2. Commentaire optionnel
3. ✅ Campagne terminée

### 3.2 Parcours Créateur

**A. Inscription (3 min)**
1. Email + mot de passe
2. Nom + bio + photo
3. Niches (multi-sélection)
4. **Upload portfolio** (3-5 vidéos minimum)
5. Tarification (prix min suggéré)
6. Connexion Stripe (pour recevoir paiements)
7. ✅ Profil en attente de validation (24h)

**B. Découverte campagnes**
1. Feed personnalisé (matching IA)
2. Filtres : budget, deadline, type
3. Clic sur campagne → Détails complets

**C. Candidature (2 min)**
1. Proposition personnalisée (optionnel)
2. Prix proposé (pré-rempli avec tarif habituel)
3. ✅ Candidature envoyée

**D. Production (variable)**
1. Notification d'acceptation
2. Accès au brief complet + fichiers marque
3. Upload des livrables
4. ✅ Soumission → Attente validation

**E. Révisions (si demandées)**
1. Notification avec feedback
2. Upload nouvelle version
3. ✅ Re-soumission

**F. Paiement & Review**
1. Notification d'approbation
2. Paiement automatique sur compte Stripe
3. Noter la marque
4. ✅ Mission terminée

---

## 4. FONCTIONNALITÉS CLÉS

### 4.1 Matching IA (Différenciateur #1)

**Algorithme de scoring :**
```javascript
matchScore = (
  nicheMatch * 0.3 +        // Correspondance niches
  budgetFit * 0.25 +         // Budget dans la fourchette créateur
  ratingScore * 0.2 +        // Note moyenne créateur
  portfolioRelevance * 0.15 + // Similarité vidéos portfolio
  responseTime * 0.1         // Réactivité historique
) * 100
```

**Affichage :**
- Score affiché pour chaque créateur (ex: "Match 87%")
- Explication du score au survol
- Tri automatique par score décroissant

### 4.2 Paiement moderne (Différenciateur #2)

**Flow Stripe Connect :**
1. Marque paie → Stripe capture le montant
2. Montant en attente (hold) pendant production
3. Validation marque → Transfer au créateur (- 10% commission plateforme)
4. Auto-validation après 7j → Transfer automatique

**Avantages vs séquestre :**
- ✅ Pas de licence bancaire nécessaire
- ✅ Gestion automatique des litiges par Stripe
- ✅ Conformité légale garantie
- ✅ Paiements internationaux faciles

### 4.3 Validation automatique (Différenciateur #3)

**Règles :**
- Timer de 7 jours démarre à la soumission
- Email de rappel à J+3 et J+6
- Si pas de réponse à J+7 → Approbation auto + paiement
- Historique de réactivité affiché sur profil marque

**Bénéfices :**
- Évite les créateurs bloqués
- Incite les marques à être réactives
- Réduit le support client

### 4.4 Portfolio vidéo interactif (Différenciateur #4)

**Fonctionnalités :**
- Lecture vidéo inline (pas de téléchargement)
- Filtrage par type de contenu
- Stats par vidéo (vues, engagement si publique)
- Comparaison côte-à-côte de plusieurs créateurs

### 4.5 Analytics temps réel (Différenciateur #5)

**Dashboard marque :**
- Taux de réponse aux campagnes
- Temps moyen de livraison
- ROI estimé (si intégration analytics)
- Comparaison créateurs

**Dashboard créateur :**
- Taux d'acceptation candidatures
- Revenu mensuel
- Note moyenne évolution
- Temps de réponse moyen

---

## 5. RÈGLES MÉTIER SIMPLIFIÉES

### 5.1 États de campagne (3 au lieu de 10+)

```
draft → active → completed
         ↓
      cancelled
```

**Transitions :**
- `draft → active` : Publication par la marque
- `active → completed` : Livraison approuvée
- `active → cancelled` : Annulation avant sélection créateur
- `completed` : État final (avec review)

### 5.2 Gestion des révisions

**Limites :**
- Maximum 2 révisions par campagne
- Délai de 3 jours par révision
- Feedback obligatoire et détaillé

**Si dépassement :**
- Option 1 : Marque accepte en l'état
- Option 2 : Annulation avec remboursement partiel (50%)

### 5.3 Commission plateforme

**Tarification simple :**
- 10% sur chaque transaction
- Prélevé automatiquement lors du transfer Stripe
- Transparent dès l'affichage des prix

---

## 6. SÉCURITÉ & CONFORMITÉ

### 6.1 Authentification
- Firebase Auth (email/password + Google OAuth)
- JWT tokens pour API
- Rate limiting sur endpoints sensibles

### 6.2 Données personnelles (RGPD)
- Consentement explicite à l'inscription
- Export de données sur demande
- Suppression de compte (soft delete)
- Anonymisation après 2 ans d'inactivité

### 6.3 Contenu
- Modération manuelle des portfolios (validation initiale)
- Signalement de contenu inapproprié
- Watermark automatique sur vidéos preview

---

## 7. MVP - PHASE 1 (4-6 semaines)

### Fonctionnalités essentielles

**Marques :**
- ✅ Inscription + profil
- ✅ Création campagne (formulaire simple)
- ✅ Voir candidatures
- ✅ Sélectionner créateur + payer
- ✅ Valider livrables
- ✅ Laisser review

**Créateurs :**
- ✅ Inscription + portfolio (3 vidéos min)
- ✅ Voir campagnes matchées
- ✅ Candidater
- ✅ Upload livrables
- ✅ Recevoir paiement
- ✅ Laisser review

**Admin :**
- ✅ Dashboard simple
- ✅ Validation créateurs
- ✅ Gestion litiges basique

### Fonctionnalités reportées Phase 2

- ❌ Matching IA avancé (remplacé par filtres simples)
- ❌ Analytics détaillés
- ❌ Messagerie intégrée (email pour MVP)
- ❌ Multi-langues
- ❌ App mobile

---

## 8. DESIGN & UX

### 8.1 Principes
1. **Clarté** : Chaque page = 1 action principale
2. **Rapidité** : Max 3 clics pour toute action
3. **Confiance** : Afficher preuves sociales partout
4. **Mobile-first** : 60% du trafic attendu sur mobile

### 8.2 Palette de couleurs (inspirée des concurrents)
- **Primaire** : #05ddb2 (vert turquoise - confiance + créativité)
- **Secondaire** : #FF6B6B (corail - urgence + CTA)
- **Neutre** : #2D3748 (gris foncé - texte)
- **Fond** : #F7FAFC (gris très clair)

### 8.3 Pages clés
1. **Landing** : Hero + 3 bénéfices + CTA + témoignages
2. **Dashboard marque** : Campagnes actives + stats + CTA "Nouvelle campagne"
3. **Dashboard créateur** : Feed campagnes + stats + portfolio
4. **Profil créateur public** : Portfolio vidéo + stats + reviews
5. **Détail campagne** : Brief + budget + candidatures/créateur sélectionné

---

## 9. MÉTRIQUES DE SUCCÈS

### 9.1 Acquisition (3 premiers mois)
- 100 créateurs validés
- 20 marques actives
- 50 campagnes publiées

### 9.2 Engagement
- Taux de réponse campagnes > 30%
- Taux d'acceptation candidatures > 15%
- Temps moyen de livraison < 10 jours

### 9.3 Rétention
- 40% des marques lancent 2+ campagnes
- 60% des créateurs candidatent 2+ fois
- NPS > 50

### 9.4 Revenus
- GMV (Gross Merchandise Value) : 50K€ en 3 mois
- Commission plateforme : 5K€
- CAC (Customer Acquisition Cost) < 50€

---

## 10. ROADMAP

### Phase 1 - MVP (Semaines 1-6)
- Setup infrastructure (MongoDB Atlas, Firebase, Stripe)
- Auth + profils basiques
- CRUD campagnes
- Candidatures + sélection
- Upload + validation livrables
- Paiements Stripe Connect
- Reviews

### Phase 2 - Optimisation (Semaines 7-10)
- Matching IA v1
- Analytics dashboards
- Messagerie intégrée
- Notifications push
- Amélioration UX basée sur feedback

### Phase 3 - Scale (Semaines 11-16)
- Multi-langues (EN, ES)
- API publique
- Intégrations (Shopify, etc.)
- Programme de parrainage
- App mobile (React Native)

---

## 11. QUESTIONS OUVERTES & DÉCISIONS

### ✅ Décisions prises
1. **Pas de séquestre** → Stripe Connect
2. **Machine à états simplifiée** → 3 états principaux
3. **Validation auto** → 7 jours
4. **Commission** → 10% flat
5. **MVP first** → Pas de sur-engineering

### ❓ À décider
1. **Modération contenu** : Manuelle ou IA (ex: AWS Rekognition) ?
2. **Exclusivité créateurs** : Peuvent-ils être sur plusieurs plateformes ?
3. **Remboursements** : Politique en cas de litige non résolu ?
4. **Vérification marques** : KYC obligatoire ou optionnel ?
5. **Limites upload** : Taille max vidéo (500MB ? 1GB ?) ?

---

## 12. ANNEXES

### A. Comparaison concurrents

| Critère | YOO | Influee | Takema | **Notre plateforme** |
|---------|-----|---------|--------|---------------------|
| Transparence prix | ❌ | ✅ | ⚠️ | ✅✅ |
| Matching IA | ❌ | ⚠️ | ❌ | ✅ |
| Validation auto | ❌ | ❌ | ❌ | ✅ |
| Portfolio interactif | ⚠️ | ✅ | ⚠️ | ✅✅ |
| Analytics temps réel | ⚠️ | ✅ | ✅ | ✅ |
| Paiement moderne | ❌ | ✅ | ❌ | ✅ |

### B. Stack technique détaillée

**Backend :**
```
Node.js 20 LTS
Express 4.x
MongoDB 7.x (Atlas)
Mongoose ODM
```

**Frontend :**
```
React 18
Next.js 14 (SSR + SSG)
TailwindCSS
Shadcn/ui components
```

**Services tiers :**
```
Firebase Auth
Stripe Connect
Cloudflare R2 (storage)
SendGrid (emails)
Sentry (monitoring)
```

**DevOps :**
```
GitHub Actions (CI/CD)
Docker (containerisation)
Cloudflare Pages (hosting)
MongoDB Atlas (database)
```

---

**Document créé le** : 2026-09-04  
**Version** : 2.0  
**Auteur** : Équipe Produit  
**Prochaine révision** : Après feedback utilisateurs MVP
