import { Schema, model, Document, Types } from 'mongoose';
import { CategoryStatus } from '@adpayon/shared';

export interface ICategory extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  bannerUrl?: string;
  displayOrder: number;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [100, 'Slug cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    icon: {
      type: String,
      trim: true,
      default: 'grid',
    },
    bannerUrl: {
      type: String,
      trim: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'PAUSED'],
      default: 'DRAFT',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'categories',
  }
);

categorySchema.index({ status: 1, displayOrder: 1 });

export const Category = model<ICategory>('Category', categorySchema);

