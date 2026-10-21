import mongoose, { Document, Schema, Types } from 'mongoose';

export type ArticleSessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'REJECTED';

export interface IArticleReadingInterval {
  startWallClock: Date;
  endWallClock: Date;
  readDelta: number;
  scrollDepth: number;
}

export interface IArticleReadingSession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  status: ArticleSessionStatus;
  articleTitle: string;
  articleLengthCharacters: number;
  minReadDurationSeconds: number;
  minScrollPercentage: number;
  hasQuiz: boolean;
  quizQuestion?: string;
  quizOptions?: string[];
  quizCorrectOptionIndex?: number;
  quizAnswered: boolean;
  quizAnswerCorrect: boolean;
  quizAttempts: number;
  quizMaxAttempts: number;
  lastQuizAttemptAt?: Date;
  accumulatedReadSeconds: number;
  maxScrollPercentage: number;
  lastScrollPercentage: number;
  scrollEventsCount: number;
  lastProgressAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  rewardGranted: boolean;
  rejectionReason?: string;
  intervals: IArticleReadingInterval[];
  createdAt: Date;
  updatedAt: Date;
}

const articleReadingIntervalSchema = new Schema<IArticleReadingInterval>(
  {
    startWallClock: { type: Date, required: true },
    endWallClock: { type: Date, required: true },
    readDelta: { type: Number, required: true },
    scrollDepth: { type: Number, required: true },
  },
  { _id: false }
);

const articleReadingSessionSchema = new Schema<IArticleReadingSession>(
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
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'REJECTED'],
      default: 'ACTIVE',
      index: true,
    },
    articleTitle: {
      type: String,
      required: true,
    },
    articleLengthCharacters: {
      type: Number,
      required: true,
    },
    minReadDurationSeconds: {
      type: Number,
      required: true,
    },
    minScrollPercentage: {
      type: Number,
      required: true,
      default: 80,
    },
    hasQuiz: {
      type: Boolean,
      default: false,
    },
    quizQuestion: {
      type: String,
    },
    quizOptions: {
      type: [String],
    },
    quizCorrectOptionIndex: {
      type: Number,
    },
    quizAnswered: {
      type: Boolean,
      default: false,
    },
    quizAnswerCorrect: {
      type: Boolean,
      default: false,
    },
    quizAttempts: {
      type: Number,
      default: 0,
    },
    quizMaxAttempts: {
      type: Number,
      default: 3,
    },
    lastQuizAttemptAt: {
      type: Date,
    },
    accumulatedReadSeconds: {
      type: Number,
      default: 0,
    },
    maxScrollPercentage: {
      type: Number,
      default: 0,
    },
    lastScrollPercentage: {
      type: Number,
      default: 0,
    },
    scrollEventsCount: {
      type: Number,
      default: 0,
    },
    lastProgressAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    rewardGranted: {
      type: Boolean,
      default: false,
      index: true,
    },
    rejectionReason: {
      type: String,
    },
    intervals: {
      type: [articleReadingIntervalSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for lookup and assignment session integrity
articleReadingSessionSchema.index({ userId: 1, taskId: 1, assignmentId: 1 });
articleReadingSessionSchema.index({ taskId: 1, status: 1 });

export const ArticleReadingSession = mongoose.model<IArticleReadingSession>(
  'ArticleReadingSession',
  articleReadingSessionSchema
);
