import { Schema, model, Document, Types } from 'mongoose';

export type OtpPurpose = 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET';

export interface IOTPChallenge extends Document {
  _id: Types.ObjectId;
  mobile: string;
  purpose: OtpPurpose;
  otpHash: string;
  attempts: number;
  consumed: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const otpChallengeSchema = new Schema<IOTPChallenge>(
  {
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      match: [/^\+?[1-9]\d{9,14}$/, 'Invalid mobile phone number format'],
    },
    purpose: {
      type: String,
      enum: ['REGISTRATION', 'LOGIN', 'PASSWORD_RESET'],
      required: [true, 'OTP purpose is required'],
    },
    // Store HMAC-SHA256 hash of the OTP; raw OTP is never persisted
    otpHash: {
      type: String,
      required: [true, 'OTP hash is required'],
      trim: true,
      minlength: [64, 'HMAC-SHA256 hash must be 64 characters'],
      maxlength: [64, 'HMAC-SHA256 hash must be 64 characters'],
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration time is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'otp_challenges',
  }
);

otpChallengeSchema.index({ mobile: 1, purpose: 1 });
// Automatic TTL cleanup when OTP challenge expires
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OTPChallenge = model<IOTPChallenge>('OTPChallenge', otpChallengeSchema);
