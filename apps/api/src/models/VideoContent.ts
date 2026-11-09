import { Schema, model, Document, Types } from 'mongoose';

export interface IVideoContent extends Document {
  _id: Types.ObjectId;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  category: string;
  durationSeconds: number;
  instructions: string[];
  rewardPoints: number;
  usdValue: number;
  isRewardBearing: boolean;
  isPublished: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const videoContentSchema = new Schema<IVideoContent>(
  {
    title: {
      type: String,
      required: [true, 'Video title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    thumbnailUrl: {
      type: String,
      required: [true, 'Thumbnail URL is required'],
      trim: true,
    },
    videoUrl: {
      type: String,
      required: [true, 'Video URL is required'],
      trim: true,
    },
    category: {
      type: String,
      default: 'General',
      trim: true,
    },
    durationSeconds: {
      type: Number,
      default: 60,
      min: 0,
    },
    instructions: {
      type: [String],
      default: [],
    },
    rewardPoints: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Reward points must be an integer',
      },
    },
    usdValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    isRewardBearing: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'video_contents',
  }
);

export const VideoContent = model<IVideoContent>('VideoContent', videoContentSchema);

