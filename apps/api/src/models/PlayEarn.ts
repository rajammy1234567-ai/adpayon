import { Schema, model, Document, Types } from 'mongoose';

export type PlayEarnActivityType = 'SPIN_WHEEL' | 'SCRATCH_CARD' | 'NUMBER_PUZZLE' | 'QUIZ';

export interface IPlayEarnAttempt extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  activityType: PlayEarnActivityType;
  date: string; // YYYY-MM-DD
  attemptNumber: number;
  pointsAwarded: number;
  usdValue: number;
  status: 'COMPLETED' | 'PENDING_REVIEW' | 'REJECTED';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const playEarnAttemptSchema = new Schema<IPlayEarnAttempt>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    activityType: {
      type: String,
      enum: ['SPIN_WHEEL', 'SCRATCH_CARD', 'NUMBER_PUZZLE', 'QUIZ'],
      required: [true, 'Activity type is required'],
      index: true,
    },
    date: {
      type: String,
      required: [true, 'Date string (YYYY-MM-DD) is required'],
      trim: true,
      index: true,
    },
    attemptNumber: {
      type: Number,
      required: [true, 'Attempt number is required'],
      min: 1,
    },
    pointsAwarded: {
      type: Number,
      required: [true, 'Points awarded is required'],
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Points must be an integer',
      },
    },
    usdValue: {
      type: Number,
      required: [true, 'USD value is required'],
      min: 0,
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING_REVIEW', 'REJECTED'],
      default: 'COMPLETED',
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'play_earn_attempts',
  }
);

// Unique index: prevent replay or concurrent limit bypass
playEarnAttemptSchema.index(
  { userId: 1, activityType: 1, date: 1, attemptNumber: 1 },
  { unique: true }
);

export const PlayEarnAttempt = model<IPlayEarnAttempt>('PlayEarnAttempt', playEarnAttemptSchema);

export interface IPlayEarnQuizItem {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  rewardPoints: number;
}

export interface IPlayEarnConfig extends Document {
  _id: Types.ObjectId;
  activityType: PlayEarnActivityType;
  title: string;
  description: string;
  dailyLimit: number;
  minPoints: number;
  maxPoints: number;
  enabled: boolean;
  spinSegments?: number[];
  quizQuestions?: IPlayEarnQuizItem[];
  puzzleConfig?: {
    rewardPoints: number;
    timeLimitSeconds: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const playEarnConfigSchema = new Schema<IPlayEarnConfig>(
  {
    activityType: {
      type: String,
      enum: ['SPIN_WHEEL', 'SCRATCH_CARD', 'NUMBER_PUZZLE', 'QUIZ'],
      required: true,
      unique: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    dailyLimit: { type: Number, default: 3, min: 1 },
    minPoints: { type: Number, default: 5, min: 0 },
    maxPoints: { type: Number, default: 100, min: 1 },
    enabled: { type: Boolean, default: true },
    spinSegments: { type: [Number], default: [5, 10, 15, 20, 25, 50, 100] },
    quizQuestions: [
      {
        id: { type: String, required: true },
        question: { type: String, required: true },
        options: { type: [String], required: true },
        correctOptionIndex: { type: Number, required: true },
        rewardPoints: { type: Number, default: 20 },
      },
    ],
    puzzleConfig: {
      rewardPoints: { type: Number, default: 25 },
      timeLimitSeconds: { type: Number, default: 120 },
    },
  },
  {
    timestamps: true,
    collection: 'play_earn_configs',
  }
);

export const PlayEarnConfig = model<IPlayEarnConfig>('PlayEarnConfig', playEarnConfigSchema);

