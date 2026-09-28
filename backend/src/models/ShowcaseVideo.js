import mongoose from 'mongoose';

/**
 * Vidéo vitrine : un créateur tourne une vidéo pour un produit d'une marque prospectée avant toute demande de sa part.
 * Un devis client (ExternalQuote) est créé d'office ; la marque voit la vidéo en filigrane sur la page du devis et l'achète en un clic.
 */
const showcaseSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalQuote', index: true },
  brandName: { type: String, required: true, trim: true, maxlength: 120 },
  productName: { type: String, required: true, trim: true, maxlength: 120 },
  note: { type: String, trim: true, maxlength: 400 }, // ce que montre la vidéo, pour la marque
  videoUrl: { type: String, required: true },   // original (jamais exposé à la marque avant achat)
  previewUrl: String,                             // version filigranée, montrée à la marque
  playableUrl: String,                            // version H.264 sans filigrane (créateur et admin)
  sourceCodec: String,
  watermarkedAt: Date,
  watermarkError: String,
  watermarkAttempts: { type: Number, default: 0 },
  duration: Number,
  price: { type: Number, required: true, min: 0 }, // HT
  status: { type: String, enum: ['ready', 'sent', 'accepted', 'declined', 'withdrawn'], default: 'ready', index: true },
  sentAt: Date,
  sentVia: String, // email, instagram, mailing
  viewedAt: Date,
  acceptedAt: Date,
}, { timestamps: true });
showcaseSchema.index({ leadId: 1, status: 1 });

const ShowcaseVideo = mongoose.models.ShowcaseVideo || mongoose.model('ShowcaseVideo', showcaseSchema);
export default ShowcaseVideo;
