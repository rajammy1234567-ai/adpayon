import { Schema, model, Document, Types } from 'mongoose';

export type TaskCategory = 'IN_APP_ACTION' | 'PARTNER_WEBHOOK' | 'SURVEY' | 'MANUAL_VERIFY';
export type VerificationMethod = 'FIRST_PARTY_ACTION' | 'AUTHENTICATED_WEBHOOK' | 'MANUAL_REVIEW';
export type TaskStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'EXHAUSTED' | 'ARCHIVED';

export interface ITaskTargeting {
  minAncestryDepth?: number;
  kycRequired?: boolean;
  allowedStates?: string[];
}

export interface ITask extends Document {
  _id: Types.ObjectId;
  campaignId: Types.ObjectId;
  title: string;
  description: string;
  category: TaskCategory;
  verificationMethod: VerificationMethod;
  rewardPoints: number; // Non-withdrawable promotional points
  status: TaskStatus;
  totalCap: number; // Maximum global completions allowed
  completionsCount: number;
  dailyCapPerUser: number;
  targeting: ITaskTargeting;
  dwellTimeSeconds: number; // For first-party engagement verification
  externalActionUrl?: string; // Redirect template for partner tasks
  instructions?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign reference is required'],
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [150, 'Task title cannot exceed 150 characters'],
    },
    description: {
      type: String,
      required: [true, 'Task description is required'],
      trim: true,
      maxlength: [1000, 'Task description cannot exceed 1000 characters'],
    },
    category: {
      type: String,
      enum: ['IN_APP_ACTION', 'PARTNER_WEBHOOK', 'SURVEY', 'MANUAL_VERIFY'],
      required: [true, 'Task category is required'],
    },
    verificationMethod: {
      type: String,
      enum: ['FIRST_PARTY_ACTION', 'AUTHENTICATED_WEBHOOK', 'MANUAL_REVIEW'],
      required: [true, 'Verification method is required'],
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
      enum: ['DRAFT', 'PUBLISHED', 'PAUSED', 'EXHAUSTED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    totalCap: {
      type: Number,
      required: [true, 'Total completion cap is required'],
      min: [1, 'Total cap must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Total cap must be an integer',
      },
    },
    completionsCount: {
      type: Number,
      default: 0,
      min: [0, 'Completions count cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Completions count must be an integer',
      },
    },
    dailyCapPerUser: {
      type: Number,
      default: 1,
      min: [1, 'Daily cap per user must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Daily cap must be an integer',
      },
    },
    targeting: {
      minAncestryDepth: { type: Number, default: 0, min: 0 },
      kycRequired: { type: Boolean, default: false },
      allowedStates: { type: [String], default: [] },
    },
    dwellTimeSeconds: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Dwell time seconds must be an integer',
      },
    },
    externalActionUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'External action URL cannot exceed 500 characters'],
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [2000, 'Instructions cannot exceed 2000 characters'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin creator reference is required'],
    },
  },
  {
    timestamps: true,
    collection: 'tasks',
  }
);

taskSchema.index({ status: 1, createdAt: -1 });
taskSchema.index({ campaignId: 1, status: 1 });
taskSchema.index({ category: 1, status: 1 });
taskSchema.index({ 'targeting.kycRequired': 1 });

export const Task = model<ITask>('Task', taskSchema);
