import { Schema, model, Document, Types } from 'mongoose';

export interface ISponsoredBanner extends Document {
  _id: Types.ObjectId;
  title: string;
  imageUrl: string;
  destinationUrl?: string;
  sponsorName: string;
  ctaText?: string;
  targetCategory?: string;
  active: boolean;
  displayOrder: number;
  clicksCount: number;
  impressionsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const sponsoredBannerSchema = new Schema<ISponsoredBanner>(
  {
    title: {
      type: String,
      required: [true, 'Banner title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    destinationUrl: {
      type: String,
      trim: true,
      default: '',
    },
    ctaText: {
      type: String,
      trim: true,
      default: 'Explore',
    },
    targetCategory: {
      type: String,
      trim: true,
      default: 'ALL',
      index: true,
    },
    sponsorName: {
      type: String,
      required: [true, 'Sponsor name is required'],
      trim: true,
      default: 'AdPayOn Partner',
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    clicksCount: {
      type: Number,
      default: 0,
    },
    impressionsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'sponsored_banners',
  }
);

export const SponsoredBanner = model<ISponsoredBanner>('SponsoredBanner', sponsoredBannerSchema);

