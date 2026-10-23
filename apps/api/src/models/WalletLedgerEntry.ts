import { Schema, model, Document, Types } from 'mongoose';

export type LedgerEntryType =
  | 'TASK_REWARD'
  | 'REFERRAL_COMMISSION'
  | 'WITHDRAWAL_HOLD'
  | 'WITHDRAWAL_PAID'
  | 'WITHDRAWAL_REVERSED'
  | 'ADMIN_ADJUSTMENT';

export type LedgerEntryStatus = 'CONFIRMED' | 'PENDING' | 'REVERSED';

export interface IWalletLedgerEntry extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  entryType: LedgerEntryType;
  amountPaise: number; // Positive for credits, negative for debits / reservations
  pointsEquivalent: number;
  status: LedgerEntryStatus;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  referenceEntity?: string;
  referenceId?: Types.ObjectId;
  idempotencyKey?: string;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const walletLedgerEntrySchema = new Schema<IWalletLedgerEntry>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    entryType: {
      type: String,
      enum: [
        'TASK_REWARD',
        'REFERRAL_COMMISSION',
        'WITHDRAWAL_HOLD',
        'WITHDRAWAL_PAID',
        'WITHDRAWAL_REVERSED',
        'ADMIN_ADJUSTMENT',
      ],
      required: [true, 'Entry type is required'],
      index: true,
    },
    amountPaise: {
      type: Number,
      required: [true, 'Amount in paise is required'],
      validate: {
        validator: Number.isInteger,
        message: 'Amount in paise must be an integer',
      },
    },
    pointsEquivalent: {
      type: Number,
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Points equivalent must be an integer',
      },
    },
    status: {
      type: String,
      enum: ['CONFIRMED', 'PENDING', 'REVERSED'],
      default: 'CONFIRMED',
      index: true,
    },
    balanceBeforePaise: {
      type: Number,
      required: true,
      default: 0,
    },
    balanceAfterPaise: {
      type: Number,
      required: true,
      default: 0,
    },
    referenceEntity: {
      type: String,
      trim: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'wallet_ledger_entries',
  }
);

walletLedgerEntrySchema.index({ userId: 1, createdAt: -1 });
walletLedgerEntrySchema.index({ referenceEntity: 1, referenceId: 1 });

export const WalletLedgerEntry = model<IWalletLedgerEntry>(
  'WalletLedgerEntry',
  walletLedgerEntrySchema
);
