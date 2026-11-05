import { Schema, model, Types } from 'mongoose';

const schema = new Schema({
  offerId: { type: Schema.Types.ObjectId, ref: 'Offer', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  rewardPoints: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  notes: { type: String, maxlength: 2000 },
  proofUrl: String,
  completionCode: { type: String, maxlength: 200 },
  reviewNotes: { type: String, maxlength: 2000 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
}, { timestamps: true });
schema.index({ offerId: 1, userId: 1 }, { unique: true });
export const OfferSubmission = model('OfferSubmission', schema);
