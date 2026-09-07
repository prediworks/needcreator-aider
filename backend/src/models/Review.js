import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true,
  },
  
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  revieweeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  
  comment: {
    type: String,
    maxlength: 500,
  },
  
  criteria: {
    communication: {
      type: Number,
      min: 1,
      max: 5,
    },
    quality: {
      type: Number,
      min: 1,
      max: 5,
    },
    timeliness: {
      type: Number,
      min: 1,
      max: 5,
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5,
    },
  },
  
  response: {
    comment: String,
    respondedAt: Date,
  },
  
  isPublic: {
    type: Boolean,
    default: true,
  },
  
  helpful: {
    type: Number,
    default: 0,
  },
  
}, {
  timestamps: true,
});

// Indexes
reviewSchema.index({ revieweeId: 1, createdAt: -1 });
reviewSchema.index({ campaignId: 1, reviewerId: 1, revieweeId: 1 }, { unique: true });

// Statics
reviewSchema.statics.calculateAverageRating = async function(userId) {
  const result = await this.aggregate([
    { $match: { revieweeId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        avgCommunication: { $avg: '$criteria.communication' },
        avgQuality: { $avg: '$criteria.quality' },
        avgTimeliness: { $avg: '$criteria.timeliness' },
        avgProfessionalism: { $avg: '$criteria.professionalism' },
      }
    }
  ]);
  
  return result[0] || {
    avgRating: 0,
    totalReviews: 0,
    avgCommunication: 0,
    avgQuality: 0,
    avgTimeliness: 0,
    avgProfessionalism: 0,
  };
};

export default mongoose.model('Review', reviewSchema);
