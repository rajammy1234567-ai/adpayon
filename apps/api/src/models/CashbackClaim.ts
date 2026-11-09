import { Schema, model, Document, Types } from 'mongoose';

export type CashbackClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ICashbackClaim extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  merchantId: Types.ObjectId;
  orderId: string;
  orderAmount: number;
  currency: string;
  claimedPoints: number;
  approvedPoints?: number;
  proofFileId?: string;
  proofUrl?: string;
  notes?: string;
  status: CashbackClaimStatus;
  rejectionReason?: string;
  adminReviewNotes?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cashbackClaimSchema = new Schema<ICashbackClaim>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: 'ShoppingMerchant',
      required: [true, 'Merchant reference is required'],
      index: true,
    },
    orderId: {
      type: String,
      required: [true, 'Order ID / Invoice number is required'],
      trim: true,
      maxlength: [100, 'Order ID cannot exceed 100 characters'],
    },
    orderAmount: {
      type: Number,
      required: [true, 'Order amount is required'],
      min: [0, 'Order amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'USD',
      trim: true,
    },
    claimedPoints: {
      type: Number,
      required: [true, 'Claimed points is required'],
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Claimed points must be an integer',
      },
    },
    approvedPoints: {
      type: Number,
      min: 0,
      validate: {
        validator: (v: number) => v === undefined || Number.isInteger(v),
        message: 'Approved points must be an integer',
      },
    },
    proofFileId: {
      type: String,
      trim: true,
    },
    proofUrl: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    adminReviewNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Admin review notes cannot exceed 1000 characters'],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'cashback_claims',
  }
);

// Prevent duplicate submission of identical order ID for same merchant
cashbackClaimSchema.index({ userId: 1, merchantId: 1, orderId: 1 }, { unique: true });

export const CashbackClaim = model<ICashbackClaim>('CashbackClaim', cashbackClaimSchema);

