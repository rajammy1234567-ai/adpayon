import { Schema, model, Document, Types } from 'mongoose';

export type WithdrawalStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'PROCESSING'
  | 'PAID'
  | 'REJECTED'
  | 'REVERSED';

export type PayoutMode = 'UPI' | 'BANK_TRANSFER';

export interface IWithdrawalRequest extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amountPaise: number;
  feePaise: number;
  netAmountPaise: number;
  payoutMode: PayoutMode;
  beneficiaryDetails: {
    upiId?: string;
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
  };
  status: WithdrawalStatus;
  adminReviewNotes?: string;
  reviewedBy?: Types.ObjectId;
  payoutReference?: string;
  failureReason?: string;
  processedAt?: Date;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const withdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    amountPaise: {
      type: Number,
      required: [true, 'Withdrawal amount in paise is required'],
      min: [5000, 'Minimum withdrawal amount is ₹50 (5000 paise)'],
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer',
      },
    },
    feePaise: {
      type: Number,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Fee must be an integer',
      },
    },
    netAmountPaise: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Net amount must be an integer',
      },
    },
    payoutMode: {
      type: String,
      enum: ['UPI', 'BANK_TRANSFER'],
      required: [true, 'Payout mode is required'],
    },
    beneficiaryDetails: {
      upiId: { type: String, trim: true },
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true, uppercase: true },
      bankName: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: [
        'REQUESTED',
        'UNDER_REVIEW',
        'PROCESSING',
        'PAID',
        'REJECTED',
        'REVERSED',
      ],
      default: 'REQUESTED',
      index: true,
    },
    adminReviewNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    payoutReference: {
      type: String,
      trim: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
    processedAt: {
      type: Date,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
  },
  {
    timestamps: true,
    collection: 'withdrawal_requests',
  }
);

withdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });

export const WithdrawalRequest = model<IWithdrawalRequest>(
  'WithdrawalRequest',
  withdrawalRequestSchema
);
