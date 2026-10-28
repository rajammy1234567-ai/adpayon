import mongoose, { Document, Schema, Types } from 'mongoose';

export type ExternalLinkSessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'REJECTED';

export interface IExternalLinkSession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  targetUrl: string;
  category: string;
  requiredDurationSeconds: number;
  startedAt: Date;
  linkLaunched: boolean;
  linkLaunchedAt?: Date;
  launchFailure: boolean;
  launchFailureReason?: string;
  status: ExternalLinkSessionStatus;
  completedAt?: Date;
  rewardGranted: boolean;
  rejectionReason?: string;
  accumulatedAwaySeconds: number;
  activeIntervalStartedAt?: Date;
  isAway: boolean;
  lastReturnedAt?: Date;
  currentAttemptId?: string;
  attemptStartedAt?: Date;
  lastAttemptDurationSeconds?: number;
  attemptStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'RETURNED_EARLY' | 'DURATION_MET';
  eligible: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const externalLinkSessionSchema = new Schema<IExternalLinkSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TaskAssignment',
      required: true,
      index: true,
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    requiredDurationSeconds: {
      type: Number,
      required: true,
      min: 1,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    linkLaunched: {
      type: Boolean,
      default: false,
    },
    linkLaunchedAt: {
      type: Date,
    },
    launchFailure: {
      type: Boolean,
      default: false,
    },
    launchFailureReason: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'REJECTED'],
      default: 'ACTIVE',
      index: true,
    },
    completedAt: {
      type: Date,
    },
    rewardGranted: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    accumulatedAwaySeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    activeIntervalStartedAt: {
      type: Date,
    },
    isAway: {
      type: Boolean,
      default: false,
    },
    lastReturnedAt: {
      type: Date,
    },
    currentAttemptId: {
      type: String,
      trim: true,
      index: true,
    },
    attemptStartedAt: {
      type: Date,
    },
    lastAttemptDurationSeconds: {
      type: Number,
      default: 0,
    },
    attemptStatus: {
      type: String,
      enum: ['NOT_STARTED', 'IN_PROGRESS', 'RETURNED_EARLY', 'DURATION_MET'],
      default: 'NOT_STARTED',
    },
    eligible: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'external_link_sessions',
  }
);

externalLinkSessionSchema.index({ userId: 1, taskId: 1, status: 1 });
externalLinkSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ExternalLinkSession =
  mongoose.models.ExternalLinkSession ||
  mongoose.model<IExternalLinkSession>('ExternalLinkSession', externalLinkSessionSchema);
