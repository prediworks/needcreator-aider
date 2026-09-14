import mongoose from 'mongoose';

/** Revenus du créateur hors NeedCreator (clients directs, autres plateformes) pour le suivi des seuils micro-entreprise */
const externalIncomeSchema = new mongoose.Schema({
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, required: true, trim: true, maxlength: 200 },
  client: { type: String, trim: true, maxlength: 120 },
  amountHT: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  source: { type: String, enum: ['manual', 'quote'], default: 'manual' },
  externalQuoteId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalQuote' },
  notes: String,
}, { timestamps: true });

externalIncomeSchema.index({ creatorId: 1, date: -1 });

const ExternalIncome = mongoose.models.ExternalIncome || mongoose.model('ExternalIncome', externalIncomeSchema);
export default ExternalIncome;
