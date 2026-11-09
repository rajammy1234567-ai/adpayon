import { Schema, model, Document, Types } from 'mongoose';

export type WithdrawalStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'PROCESSING'
  | 'PAID'
  | 'REJECTED'
  | 'REVERSED';

export type PayoutMode = 'UPI' | 'BANK_TRANSFER' | 'BANK_ACCOUNT' | 'USDT_WALLET' | 'USD_ACCOUNT';

export interface IWithdrawalRequest extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amountPaise: number;
  pointsAmount?: number;
  usdAmount?: number;
  feePaise: number;
  netAmountPaise: number;
  payoutMode: PayoutMode;
  currency?: 'INR' | 'USD';
  payoutMinor?: number;
  paisePerUsd?: number;
  policyVersion?: number;
  beneficiaryDetails: {
    usdAccount?: string;
    upiId?: string;
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    usdtAddress?: string;
    network?: 'BEP20';
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
      min: [0, 'Amount must be non-negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer',
      },
    },
    pointsAmount: {
      type: Number,
      min: [1, 'Points must be at least 1'],
      validate: {
        validator: (v: any) => v == null || Number.isInteger(v),
        message: 'Points must be an integer',
      },
    },
    usdAmount: {
      type: Number,
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
      enum: ['UPI', 'BANK_TRANSFER', 'BANK_ACCOUNT', 'USDT_WALLET', 'USD_ACCOUNT'],
      required: [true, 'Payout mode is required'],
    },
    currency: { type: String, enum: ['INR', 'USD'], default: 'USD' },
    payoutMinor: { type: Number, validate: (v: any) => v == null || Number.isSafeInteger(v) },
    paisePerUsd: Number,
    policyVersion: Number,
    beneficiaryDetails: {
      usdAccount: { type: String, trim: true, maxlength: 500 },
      upiId: { type: String, trim: true },
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true, uppercase: true },
      bankName: { type: String, trim: true },
      usdtAddress: { type: String, trim: true },
      network: { type: String, enum: ['BEP20'] },
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
      maxlength: [1000, 'Review notes cannot exceed 1000 characters'],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    payoutReference: {
      type: String,
      trim: true,
      maxlength: [200, 'Payout reference cannot exceed 200 characters'],
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Failure reason cannot exceed 500 characters'],
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
  }
);

// Indexes for common query patterns
withdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 });

export const WithdrawalRequest = model<IWithdrawalRequest>(
  'WithdrawalRequest',
  withdrawalRequestSchema
);
