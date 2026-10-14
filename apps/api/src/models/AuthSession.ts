import { Schema, model, Document, Types } from 'mongoose';

export interface IAuthSession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  familyId: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const authSessionSchema = new Schema<IAuthSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID reference is required'],
      index: true,
    },
    // Store only cryptographic hash (SHA-256) of refresh token; raw token is never persisted
    refreshTokenHash: {
      type: String,
      required: [true, 'Refresh token hash is required'],
      unique: true,
      trim: true,
      minlength: [64, 'SHA-256 hash must be 64 characters'],
      maxlength: [64, 'SHA-256 hash must be 64 characters'],
    },
    familyId: {
      type: String,
      required: [true, 'Token family identifier is required'],
      index: true,
    },
    userAgent: {
      type: String,
      maxlength: [255, 'User agent cannot exceed 255 characters'],
    },
    ipAddress: {
      type: String,
      maxlength: [45, 'IP address cannot exceed 45 characters'],
    },
    expiresAt: {
      type: Date,
      required: [true, 'Session expiry date is required'],
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'auth_sessions',
  }
);

// Automatic TTL eviction when session expires
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSession = model<IAuthSession>('AuthSession', authSessionSchema);
