import { Schema, model, Document, Types } from 'mongoose';

export type TaskCategory =
  | 'IN_APP_ACTION'
  | 'PARTNER_WEBHOOK'
  | 'SURVEY'
  | 'MANUAL_VERIFY'
  | 'APP_INSTALL'
  | 'VIDEO_WATCH'
  | 'ARTICLE_READ'
  | 'YOUTUBE_LEARNING'
  | 'APP_TESTING';
export type VerificationMethod = 'FIRST_PARTY_ACTION' | 'AUTHENTICATED_WEBHOOK' | 'MANUAL_REVIEW';
export type TaskStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'EXHAUSTED' | 'ARCHIVED';

export interface IAppInstallConfig {
  appName: string;
  packageName: string;
  platform: 'ANDROID' | 'IOS' | 'CROSS_PLATFORM';
  storeUrl: string;
  attributionMethod: 'SIGNED_POSTBACK' | 'MANUAL_REVIEW' | 'IN_APP_FEEDBACK' | 'PARTNER_CALLBACK' | 'USAGE_STATS' | 'CLIENT_PACKAGE_PRESENCE';
  conversionEvent: 'INSTALL' | 'FIRST_OPEN' | 'REGISTER' | 'IN_APP_PURCHASE' | 'INSTALL_ONLY';
  testingSteps?: string;
  feedbackQuestion?: string;
  requiredTestingSeconds?: number;
  completionCode?: string;
}

export type VideoCompletionPolicy = 'FULL_VIDEO' | 'MINIMUM_DURATION';

export interface IVideoWatchConfig {
  videoUrl: string;
  videoDurationSeconds: number;
  requiredWatchSeconds: number;
  allowSeeking: boolean;
  sessionTimeoutSeconds: number;
  completionPolicy?: VideoCompletionPolicy;
  comprehensionQuiz?: IArticleReadComprehensionQuiz;
}

export interface IArticleReadComprehensionQuiz {
  question: string;
  options: string[];
  correctOptionIndex: number;
}

export interface IArticleReadConfig {
  articleTitle: string;
  articleContent: string;
  sourceUrl?: string;
  minReadDurationSeconds: number;
  minScrollPercentage: number;
  comprehensionQuiz?: IArticleReadComprehensionQuiz;
}

export interface IYouTubeLearningConfig {
  youtubeUrl: string;
  videoId: string;
  videoTitle?: string;
  requiredDurationSeconds: number;
  instructions?: string;
  comprehensionQuiz?: IArticleReadComprehensionQuiz;
  educationalNotice?: string;
}

export interface ITaskTargeting {
  minAncestryDepth?: number;
  kycRequired?: boolean;
  allowedStates?: string[];
  assignedUserIds?: Types.ObjectId[];
  userGroups?: string[];
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
  appInstallConfig?: IAppInstallConfig;
  videoWatchConfig?: IVideoWatchConfig;
  articleReadConfig?: IArticleReadConfig;
  youtubeLearningConfig?: IYouTubeLearningConfig;
  expiresAt?: Date;
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
      enum: [
        'IN_APP_ACTION',
        'PARTNER_WEBHOOK',
        'SURVEY',
        'MANUAL_VERIFY',
        'APP_INSTALL',
        'VIDEO_WATCH',
        'ARTICLE_READ',
        'YOUTUBE_LEARNING',
        'APP_TESTING',
      ],
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
      assignedUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
      userGroups: { type: [String], default: [] },
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
    appInstallConfig: {
      type: {
        appName: { type: String, trim: true, maxlength: 100 },
        packageName: { type: String, trim: true, maxlength: 150 },
        platform: { type: String, enum: ['ANDROID', 'IOS', 'CROSS_PLATFORM'] },
        storeUrl: { type: String, trim: true, maxlength: 500 },
        attributionMethod: {
          type: String,
          enum: ['SIGNED_POSTBACK', 'MANUAL_REVIEW', 'IN_APP_FEEDBACK', 'PARTNER_CALLBACK', 'USAGE_STATS', 'CLIENT_PACKAGE_PRESENCE'],
        },
        conversionEvent: { type: String, enum: ['INSTALL', 'FIRST_OPEN', 'REGISTER', 'IN_APP_PURCHASE', 'INSTALL_ONLY'] },
        testingSteps: { type: String, trim: true, maxlength: 2000 },
        feedbackQuestion: { type: String, trim: true, maxlength: 500 },
        requiredTestingSeconds: { type: Number, min: 0 },
        completionCode: { type: String, trim: true, maxlength: 100 },
      },
      required: false,
      _id: false,
    },
    youtubeLearningConfig: {
      type: {
        youtubeUrl: { type: String, trim: true, maxlength: 500 },
        videoId: { type: String, trim: true, maxlength: 64 },
        videoTitle: { type: String, trim: true, maxlength: 200 },
        requiredDurationSeconds: { type: Number, min: 5 },
        instructions: { type: String, trim: true, maxlength: 2000 },
        educationalNotice: { type: String, trim: true, maxlength: 500 },
        comprehensionQuiz: {
          type: {
            question: { type: String, trim: true, maxlength: 300 },
            options: { type: [String] },
            correctOptionIndex: { type: Number, min: 0 },
          },
          required: false,
          _id: false,
        },
      },
      required: false,
      _id: false,
    },
    videoWatchConfig: {
      type: {
        videoUrl: { type: String, trim: true, maxlength: 500 },
        videoDurationSeconds: { type: Number, min: 5 },
        requiredWatchSeconds: { type: Number, min: 5 },
        allowSeeking: { type: Boolean, default: false },
        sessionTimeoutSeconds: { type: Number, min: 30, default: 1800 },
        completionPolicy: {
          type: String,
          enum: ['FULL_VIDEO', 'MINIMUM_DURATION'],
          default: 'FULL_VIDEO',
        },
        comprehensionQuiz: {
          type: {
            question: { type: String, trim: true, maxlength: 300 },
            options: { type: [String] },
            correctOptionIndex: { type: Number, min: 0 },
          },
          required: false,
          _id: false,
        },
      },
      required: false,
      _id: false,
    },
    articleReadConfig: {
      type: {
        articleTitle: { type: String, trim: true, maxlength: 200 },
        articleContent: { type: String, maxlength: 50000 },
        sourceUrl: { type: String, trim: true, maxlength: 500 },
        minReadDurationSeconds: { type: Number, min: 5 },
        minScrollPercentage: { type: Number, min: 1, max: 100, default: 80 },
        comprehensionQuiz: {
          type: {
            question: { type: String, trim: true, maxlength: 300 },
            options: { type: [String] },
            correctOptionIndex: { type: Number, min: 0 },
          },
          required: false,
          _id: false,
        },
      },
      required: false,
      _id: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin creator reference is required'],
    },
    expiresAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: 'tasks',
  }
);

taskSchema.index({ status: 1, createdAt: -1 });
taskSchema.index({ status: 1, expiresAt: 1 });
taskSchema.index({ campaignId: 1, status: 1 });
taskSchema.index({ category: 1, status: 1 });
taskSchema.index({ 'targeting.kycRequired': 1 });

export const Task = model<ITask>('Task', taskSchema);
