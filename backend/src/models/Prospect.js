import mongoose from 'mongoose';

export const PROSPECT_STATUSES = ['to_contact', 'contacted', 'replied', 'quote_sent', 'won', 'lost'];

/** Suivi de prospection du créateur : marques contactées hors plateforme, relances à date, devis liés */
const prospectSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  company: { type: String, required: true, trim: true, maxlength: 120 },
  contactName: { type: String, trim: true, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, maxlength: 200 },
  phone: { type: String, trim: true, maxlength: 40 },
  website: { type: String, trim: true, maxlength: 300 },
  source: { type: String, trim: true, maxlength: 120 }, // Instagram, salon, bouche-à-oreille…
  status: { type: String, enum: PROSPECT_STATUSES, default: 'to_contact', index: true },
  nextFollowUpAt: Date,
  lastContactAt: Date,
  followUpNotifiedAt: Date,
  notes: [{ text: { type: String, maxlength: 2000 }, at: { type: Date, default: Date.now }, _id: false }],
  externalQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalQuote' },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // si la marque s'est inscrite sur NeedCreator
}, { timestamps: true });

prospectSchema.index({ creatorId: 1, nextFollowUpAt: 1 });

const Prospect = mongoose.models.Prospect || mongoose.model('Prospect', prospectSchema);
export default Prospect;
