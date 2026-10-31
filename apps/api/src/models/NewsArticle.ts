import { Schema, model, Document, Types } from 'mongoose';

export interface INewsArticle extends Document {
  _id: Types.ObjectId;
  title: string;
  summary: string;
  source: string;
  url: string;
  category: string;
  isPublished: boolean;
  priority: number;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const newsArticleSchema = new Schema<INewsArticle>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: 300,
    },
    summary: {
      type: String,
      required: [true, 'Summary is required'],
      trim: true,
      maxlength: 1000,
    },
    source: {
      type: String,
      required: [true, 'Source is required'],
      trim: true,
      maxlength: 100,
    },
    url: {
      type: String,
      required: [true, 'URL is required'],
      trim: true,
    },
    category: {
      type: String,
      default: 'announcement',
      trim: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

newsArticleSchema.index({ isPublished: 1, publishedAt: -1 });

export const NewsArticle = model<INewsArticle>('NewsArticle', newsArticleSchema);

