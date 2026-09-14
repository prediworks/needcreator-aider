import mongoose from 'mongoose';

/**
 * Devis d'un créateur pour un client hors plateforme : devis + projet de contrat en PDF, lien public
 * pour que le client accepte et paie via NeedCreator (mission classique créée) ou soit marqué « payé en direct ».
 */
const externalQuoteSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, unique: true, index: true },
  client: {
    companyName: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    siret: String,
    address: String,
  },
  mission: {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 3000 },
    videoType: { type: String, default: 'testimonial' },
    deliverables: { type: Number, default: 1, min: 1, max: 20 },
    duration: { type: Number, default: 30 },
    platforms: [String],
    requirements: [String],
  },
  quote: {
    price: { type: Number, required: true, min: 0 }, // HT
    vatRate: { type: Number, default: 0 },
    estimatedDeliveryDays: { type: Number, default: 7 },
    revisions: { type: Number, default: 1 },
    rights: {
      duration: { type: String, enum: ['6m', '1y', '2y', '3y', 'unlimited'], default: '1y' },
      supports: [{ type: String, enum: ['social_organic', 'paid_ads', 'website', 'email', 'marketplace', 'tv', 'other'] }],
      territories: { type: String, default: 'France' },
      exclusivity: { type: Boolean, default: false },
      exclusivityMonths: Number,
    },
    terms: String,
    validUntil: Date,
  },
  status: { type: String, enum: ['draft', 'sent', 'accepted_needcreator', 'accepted_direct', 'declined', 'expired'], default: 'draft', index: true },
  pdf: { quoteUrl: String, contractUrl: String, number: String, generatedAt: Date },
  sentAt: Date,
  acceptedAt: Date,
  declinedAt: Date,
  declineReason: String,
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Delivery' },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const ExternalQuote = mongoose.models.ExternalQuote || mongoose.model('ExternalQuote', externalQuoteSchema);
export default ExternalQuote;
