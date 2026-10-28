import { Schema, model, Document, Types } from 'mongoose';

export type EvidenceType = 'WEBHOOK_PAYLOAD' | 'FIRST_PARTY_TELEMETRY' | 'ADMIN_OVERRIDE' | 'EXTERNAL_LINK_ELAPSED' | 'CLIENT_REPORTED_PACKAGE_PRESENCE';

export interface IVerificationEvidence extends Document {
  _id: Types.ObjectId;
  assignmentId: Types.ObjectId;
  taskId: Types.ObjectId;
  userId: Types.ObjectId;
  evidenceType: EvidenceType;
  signatureVerified: boolean;
  externalTransactionId?: string; // Partner conversion / transaction tracking ID
  rawPayload: Record<string, unknown>;
  headers?: Record<string, string>;
  ipAddress?: string;
  evaluatedAt: Date;
  createdAt: Date;
}

const verificationEvidenceSchema = new Schema<IVerificationEvidence>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TaskAssignment',
      required: [true, 'Assignment reference is required'],
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task reference is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    evidenceType: {
      type: String,
      enum: ['WEBHOOK_PAYLOAD', 'FIRST_PARTY_TELEMETRY', 'ADMIN_OVERRIDE', 'EXTERNAL_LINK_ELAPSED', 'CLIENT_REPORTED_PACKAGE_PRESENCE'],
      required: [true, 'Evidence type is required'],
    },
    signatureVerified: {
      type: Boolean,
      default: false,
    },
    externalTransactionId: {
      type: String,
      trim: true,
      maxlength: [128, 'External transaction ID cannot exceed 128 characters'],
    },
    rawPayload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    headers: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, 'IP address cannot exceed 45 characters'],
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'verification_evidence',
  }
);

verificationEvidenceSchema.index({ assignmentId: 1 });
verificationEvidenceSchema.index({ externalTransactionId: 1 }, { sparse: true });
verificationEvidenceSchema.index({ evaluatedAt: -1 });

export const VerificationEvidence = model<IVerificationEvidence>(
  'VerificationEvidence',
  verificationEvidenceSchema
);
