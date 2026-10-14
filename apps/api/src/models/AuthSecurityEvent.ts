import { Schema, model, Document, Types } from 'mongoose';

export type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'TOKEN_REUSE_DETECTED'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'OTP_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_RESET';

export interface IAuthSecurityEvent extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  eventType: AuthEventType;
  mobile: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const authSecurityEventSchema = new Schema<IAuthSecurityEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required'],
      enum: [
        'LOGIN_SUCCESS',
        'LOGIN_FAILURE',
        'TOKEN_REUSE_DETECTED',
        'OTP_SENT',
        'OTP_VERIFIED',
        'OTP_FAILED',
        'LOGOUT',
        'PASSWORD_RESET',
      ],
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, 'IP address cannot exceed 45 characters'],
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [255, 'User agent cannot exceed 255 characters'],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'auth_security_events',
  }
);

authSecurityEventSchema.index({ mobile: 1, createdAt: -1 });
authSecurityEventSchema.index({ eventType: 1, createdAt: -1 });
// 90-day retention policy (90 * 24 * 60 * 60 = 7,776,000 seconds)
authSecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const AuthSecurityEvent = model<IAuthSecurityEvent>(
  'AuthSecurityEvent',
  authSecurityEventSchema
);
