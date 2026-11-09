import { Schema, model, Types } from 'mongoose';

export interface IOfferSubmission {
  _id: Types.ObjectId;
  offerId: Types.ObjectId;
  userId: Types.ObjectId;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rewardPoints: number;
  notes?: string;
  proofFileId?: string;
  proofUrl?: string;
  completionCode?: string;
  reviewNotes?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IOfferSubmission>(
  {
    offerId: { type: Schema.Types.ObjectId, ref: 'Offer', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
    rewardPoints: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    notes: { type: String, maxlength: 2000 },
    proofFileId: { type: String, trim: true },
    proofUrl: { type: String, trim: true },
    completionCode: { type: String, maxlength: 200 },
    reviewNotes: { type: String, maxlength: 2000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

schema.index({ offerId: 1, userId: 1 }, { unique: true });
export const OfferSubmission = model<IOfferSubmission>('OfferSubmission', schema);
