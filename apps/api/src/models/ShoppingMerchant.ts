import { Schema, model, Document, Types } from 'mongoose';

export interface IShoppingMerchant extends Document {
  _id: Types.ObjectId;
  name: string;
  logoUrl: string;
  description: string;
  destinationUrl: string;
  cashbackTerms: string;
  featuredBadge?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const shoppingMerchantSchema = new Schema<IShoppingMerchant>(
  {
    name: {
      type: String,
      required: [true, 'Merchant name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    logoUrl: {
      type: String,
      required: [true, 'Logo URL is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    destinationUrl: {
      type: String,
      required: [true, 'Destination URL is required'],
      trim: true,
    },
    cashbackTerms: {
      type: String,
      required: [true, 'Cashback terms is required'],
      trim: true,
      maxlength: [500, 'Terms cannot exceed 500 characters'],
    },
    featuredBadge: {
      type: String,
      trim: true,
      maxlength: [50, 'Badge cannot exceed 50 characters'],
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'shopping_merchants',
  }
);

export const ShoppingMerchant = model<IShoppingMerchant>('ShoppingMerchant', shoppingMerchantSchema);

