import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'USER' | 'ADMIN' | 'SUPPORT' | 'FINANCE_AUDITOR';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface IUser extends Document {
  _id: Types.ObjectId;
  mobile: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  referralCode: string;
  sponsorId?: Types.ObjectId | null;
  ancestors: Types.ObjectId[];
  directReferralsCount: number;
  metadata?: {
    language?: 'hi' | 'en';
    kycStatus?: 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  };
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      match: [/^\+?[1-9]\d{9,14}$/, 'Invalid mobile phone number format'],
    },
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Security: Never return password hash in default queries
    },
    role: {
      type: String,
      enum: ['USER', 'ADMIN', 'SUPPORT', 'FINANCE_AUDITOR'],
      default: 'USER',
    },
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED'],
      default: 'PENDING_VERIFICATION',
    },
    referralCode: {
      type: String,
      required: [true, 'Referral code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [30, 'Referral code cannot exceed 30 characters'],
    },
    sponsorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
      index: true,
    },
    ancestors: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      immutable: true,
      index: true,
    },
    directReferralsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    metadata: {
      language: { type: String, enum: ['hi', 'en'], default: 'en' },
      kycStatus: {
        type: String,
        enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED'],
        default: 'NOT_SUBMITTED',
      },
    },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Compound indexes for unilevel referral tree performance
userSchema.index({ sponsorId: 1, createdAt: -1 });
userSchema.index({ ancestors: 1, createdAt: -1 });
userSchema.index({ sponsorId: 1, status: 1 });

export const User = model<IUser>('User', userSchema);

