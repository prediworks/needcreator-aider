import mongoose from 'mongoose';

/**
 * Brief généré depuis une URL produit (page publique, sans compte).
 * Conservé 30 jours pour être repris à l'inscription de la marque (`/register?role=brand&brief=<id>`) ou par une marque connectée.
 */
const productBriefSchema = new mongoose.Schema({
  url: { type: String, required: true },
  domain: String,
  ip: String,
  product: {
    name: String,
    brand: String,
    description: String,
    price: Number,
    currency: String,
    image: String,
  },
  analysis: {
    positioning: String,
    audience: String,
    niche: String,
    angles: [{ title: String, hook: String, why: String }],
    videoType: String,
    duration: Number,
    deliverables: Number,
    platforms: [String],
  },
  brief: {
    title: String,
    description: String,
    requirements: [String],
    dos: [String],
    donts: [String],
    hashtags: [String],
  },
  budget: { low: Number, mid: Number, high: Number, perVideoMid: Number },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 86400000), index: { expires: 0 } },
}, { timestamps: true });

productBriefSchema.index({ ip: 1, createdAt: -1 });

export default mongoose.model('ProductBrief', productBriefSchema);
