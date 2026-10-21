import { Schema, model, Document, Types } from 'mongoose';
import { VerificationMethod } from './Task';

export type CompletionStatus = 'VERIFIED' | 'REJECTED' | 'FLAGGED';

export interface ITaskCompletion extends Document {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  campaignId: Types.ObjectId;
  userId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  clickId: string;
  rewardPoints: number; // Promotional points credited
  status: CompletionStatus;
  verificationMethod: VerificationMethod;
  evidenceId?: Types.ObjectId;
  completedAt: Date;
  rejectionReason?: string;
  adminReviewNotes?: string;
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskCompletionSchema = new Schema<ITaskCompletion>(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task reference is required'],
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign reference is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TaskAssignment',
      required: [true, 'Assignment reference is required'],
    },
    clickId: {
      type: String,
      required: [true, 'Click ID is required'],
      unique: true,
      trim: true,
    },
    rewardPoints: {
      type: Number,
      required: [true, 'Reward points is required'],
      min: [1, 'Reward points must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Reward points must be an integer',
      },
    },
    status: {
      type: String,
      enum: ['VERIFIED', 'REJECTED', 'FLAGGED'],
      default: 'VERIFIED',
    },
    verificationMethod: {
      type: String,
      enum: ['FIRST_PARTY_ACTION', 'AUTHENTICATED_WEBHOOK', 'MANUAL_REVIEW'],
      required: [true, 'Verification method is required'],
    },
    evidenceId: {
      type: Schema.Types.ObjectId,
      ref: 'VerificationEvidence',
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
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
  },
  {
    timestamps: true,
    collection: 'task_completions',
  }
);

taskCompletionSchema.index({ taskId: 1, userId: 1, clickId: 1 }, { unique: true });
taskCompletionSchema.index({ userId: 1, createdAt: -1 });
taskCompletionSchema.index({ userId: 1, completedAt: -1 });
taskCompletionSchema.index({ taskId: 1, userId: 1, completedAt: -1 });
taskCompletionSchema.index({ campaignId: 1, createdAt: -1 });
taskCompletionSchema.index({ status: 1, createdAt: -1 });

export const TaskCompletion = model<ITaskCompletion>('TaskCompletion', taskCompletionSchema);
