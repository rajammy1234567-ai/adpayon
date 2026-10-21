import mongoose, { Document, Schema, Types } from 'mongoose';

export type VideoSessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'REJECTED';

export interface IVideoPlaybackInterval {
  startWallClock: Date;
  endWallClock: Date;
  startPos: number;
  endPos: number;
  watchDelta: number;
}

import { VideoCompletionPolicy } from './Task';

export interface ITimelineCoverageSegment {
  start: number;
  end: number;
}

export interface IVideoPlaybackSession extends Document {
  _id: Types.ObjectId;
  sessionId: string;
  userId: Types.ObjectId;
  taskId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  status: VideoSessionStatus;
  videoUrl: string;
  videoDuration: number;
  requiredWatchSeconds: number;
  allowSeeking: boolean;
  completionPolicy: VideoCompletionPolicy;
  timelineCoverageSeconds: number;
  maxPlaybackPositionSeconds: number;
  playbackEnded: boolean;
  playbackEndedAt?: Date;
  minWatchPercentage?: number;
  accumulatedWatchSeconds: number;
  lastPlaybackPositionSeconds: number;
  lastProgressAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  rewardGranted: boolean;
  rejectionReason?: string;
  progressEventsCount: number;
  intervals: IVideoPlaybackInterval[];
  coveredSegments: ITimelineCoverageSegment[];
  createdAt: Date;
  updatedAt: Date;
}

const videoPlaybackIntervalSchema = new Schema<IVideoPlaybackInterval>(
  {
    startWallClock: { type: Date, required: true },
    endWallClock: { type: Date, required: true },
    startPos: { type: Number, required: true },
    endPos: { type: Number, required: true },
    watchDelta: { type: Number, required: true },
  },
  { _id: false }
);

const videoPlaybackSessionSchema = new Schema<IVideoPlaybackSession>(
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
    videoUrl: {
      type: String,
      required: true,
    },
    videoDuration: {
      type: Number,
      required: true,
    },
    requiredWatchSeconds: {
      type: Number,
      required: true,
    },
    allowSeeking: {
      type: Boolean,
      default: false,
    },
    completionPolicy: {
      type: String,
      enum: ['FULL_VIDEO', 'MINIMUM_DURATION'],
      default: 'FULL_VIDEO',
    },
    timelineCoverageSeconds: {
      type: Number,
      default: 0,
    },
    maxPlaybackPositionSeconds: {
      type: Number,
      default: 0,
    },
    playbackEnded: {
      type: Boolean,
      default: false,
    },
    playbackEndedAt: {
      type: Date,
    },
    minWatchPercentage: {
      type: Number,
      default: 0,
    },
    accumulatedWatchSeconds: {
      type: Number,
      default: 0,
    },
    lastPlaybackPositionSeconds: {
      type: Number,
      default: 0,
    },
    coveredSegments: {
      type: [{ start: { type: Number }, end: { type: Number } }],
      default: [],
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
    progressEventsCount: {
      type: Number,
      default: 0,
    },
    intervals: {
      type: [videoPlaybackIntervalSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for lookup and assignment session integrity
videoPlaybackSessionSchema.index({ userId: 1, taskId: 1, assignmentId: 1 });
videoPlaybackSessionSchema.index({ taskId: 1, status: 1 });

export const VideoPlaybackSession = mongoose.model<IVideoPlaybackSession>(
  'VideoPlaybackSession',
  videoPlaybackSessionSchema
);
