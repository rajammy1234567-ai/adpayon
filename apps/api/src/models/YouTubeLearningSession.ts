import mongoose, { Document, Schema, Types } from 'mongoose';

export type YouTubeSessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'REJECTED';

export interface IYouTubeLearningSession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  status: YouTubeSessionStatus;
  videoId: string;
  youtubeUrl: string;
  videoTitle?: string;
  requiredDurationSeconds: number;
  accumulatedSeconds: number;
  hasQuiz: boolean;
  quizQuestion?: string;
  quizOptions?: string[];
  quizCorrectOptionIndex?: number;
  quizAnswered: boolean;
  quizAnswerCorrect: boolean;
  quizAttempts: number;
  lastProgressAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  rewardGranted: boolean;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const youTubeLearningSessionSchema = new Schema<IYouTubeLearningSession>(
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
    videoId: {
      type: String,
      required: true,
      trim: true,
    },
    youtubeUrl: {
      type: String,
      required: true,
      trim: true,
    },
    videoTitle: {
      type: String,
      trim: true,
    },
    requiredDurationSeconds: {
      type: Number,
      required: true,
      min: 5,
    },
    accumulatedSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    hasQuiz: {
      type: Boolean,
      default: false,
    },
    quizQuestion: {
      type: String,
      trim: true,
    },
    quizOptions: {
      type: [String],
      default: [],
    },
    quizCorrectOptionIndex: {
      type: Number,
      min: 0,
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
    lastProgressAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
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
  },
  {
    timestamps: true,
    collection: 'youtube_learning_sessions',
  }
);

youTubeLearningSessionSchema.index({ userId: 1, taskId: 1, status: 1 });
youTubeLearningSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const YouTubeLearningSession =
  mongoose.models.YouTubeLearningSession ||
  mongoose.model<IYouTubeLearningSession>('YouTubeLearningSession', youTubeLearningSessionSchema);
