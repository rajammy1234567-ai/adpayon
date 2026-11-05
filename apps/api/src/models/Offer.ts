import { Schema, model, Document, Types } from 'mongoose';
import {
  OfferStatus,
  OfferContent,
  OfferTrainingLink,
  OfferFaq,
  OfferCompletionConditions,
  OfferActionType,
} from '@adpayon/shared';

export interface IOffer extends Document {
  _id: Types.ObjectId;
  content?: OfferContent;
  title: string;
  slug: string;
  categoryId: Types.ObjectId;
  description: string;
  rewardPoints: number;
  status: OfferStatus;
  displayOrder: number;
  expiresAt?: Date;
  bannerUrl?: string;
  images: string[];
  instructions: string[];
  additionalNotes?: string;
  trainingLinks: OfferTrainingLink[];
  faqs: OfferFaq[];
  completionConditions: OfferCompletionConditions;
  completionsCount: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const offerTrainingLinkSchema = new Schema<OfferTrainingLink>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000 },
    thumbnailUrl: { type: String, trim: true },
  },
  { _id: false }
);

const offerFaqSchema = new Schema<OfferFaq>(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

const offerCompletionConditionsSchema = new Schema<OfferCompletionConditions>(
  {
    dwellTimeSeconds: { type: Number, default: 0, min: 0 },
    actionType: {
      type: String,
      enum: [
        'EXTERNAL_LINK',
        'APP_INSTALL',
        'LEAD_SUBMISSION',
        'ARTICLE_READ',
        'VIDEO_WATCH',
        'FIRST_PARTY_ACTION',
        'SIGNUP_SUBMIT',
        'LINK_VISIT',
        'FORM_FILL',
        'PURCHASE',
        'CUSTOM',
      ],
      default: 'FIRST_PARTY_ACTION',
    },
    targetUrl: { type: String, trim: true },
    conditionDescription: { type: String, trim: true, maxlength: 500, default: '' },
    requiresProof: { type: Boolean, default: false },
    proofInstructions: { type: String, trim: true },
    completionCodeRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const offerSchema = new Schema<IOffer>(
  {
    content: {
      type: new Schema({
        logoUrl: String, benefits: [String], eligibility: [String], documents: [String],
        terms: [String], trackingNotes: [String], payoutNotes: [String], marketingMessage: String,
        marketingBanners: [{ _id: false, title: String, imageUrl: String }],
      }, { _id: false }),
      default: () => ({}),
    },
    title: {
      type: String,
      required: [true, 'Offer title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Offer slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [200, 'Slug cannot exceed 200 characters'],
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required'],
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Offer description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    rewardPoints: {
      type: Number,
      required: [true, 'Reward points are required'],
      min: [0, 'Reward points must be non-negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Reward points must be an integer',
      },
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'PAUSED', 'EXPIRED'],
      default: 'DRAFT',
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    bannerUrl: {
      type: String,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    instructions: {
      type: [String],
      default: [],
    },
    additionalNotes: {
      type: String,
      trim: true,
      maxlength: [3000, 'Additional notes cannot exceed 3000 characters'],
    },
    trainingLinks: {
      type: [offerTrainingLinkSchema],
      default: [],
    },
    faqs: {
      type: [offerFaqSchema],
      default: [],
    },
    completionConditions: {
      type: offerCompletionConditionsSchema,
      required: true,
    },
    completionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'offers',
  }
);

offerSchema.index({ categoryId: 1, status: 1, displayOrder: 1 });
offerSchema.index({ status: 1, expiresAt: 1 });

export const Offer = model<IOffer>('Offer', offerSchema);

