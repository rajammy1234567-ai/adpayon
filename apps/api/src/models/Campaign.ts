import { Schema, model, Document, Types } from 'mongoose';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

export interface ICampaign extends Document {
  _id: Types.ObjectId;
  name: string;
  advertiserName: string;
  description?: string;
  status: CampaignStatus;
  isSandbox: boolean; // Sandbox-only QA campaign classification
  advertiserBudgetPaise: number; // Monetary accounting metadata (integer paise)
  spentBudgetPaise: number;
  authorizedAgreementRef: string; // Contract/Agreement tracking reference
  webhookSecret: string; // High-entropy key for HMAC-SHA256 signature verification
  startDate?: Date;
  endDate?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      maxlength: [120, 'Campaign name cannot exceed 120 characters'],
    },
    advertiserName: {
      type: String,
      required: [true, 'Advertiser name is required'],
      trim: true,
      maxlength: [120, 'Advertiser name cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    isSandbox: {
      type: Boolean,
      default: false,
    },
    advertiserBudgetPaise: {
      type: Number,
      required: [true, 'Advertiser budget is required'],
      min: [0, 'Advertiser budget must be non-negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Advertiser budget must be an integer (in paise)',
      },
    },
    spentBudgetPaise: {
      type: Number,
      default: 0,
      min: [0, 'Spent budget must be non-negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Spent budget must be an integer (in paise)',
      },
    },
    authorizedAgreementRef: {
      type: String,
      required: [true, 'Authorized agreement reference is required'],
      trim: true,
      maxlength: [100, 'Agreement reference cannot exceed 100 characters'],
    },
    webhookSecret: {
      type: String,
      required: [true, 'Webhook secret is required for partner verification'],
      select: false, // Hidden by default for security
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin creator reference is required'],
    },
  },
  {
    timestamps: true,
    collection: 'campaigns',
  }
);

campaignSchema.index({ status: 1, createdAt: -1 });
campaignSchema.index({ isSandbox: 1, status: 1 });
campaignSchema.index({ advertiserName: 1 });
campaignSchema.index({ createdAt: -1 });

export const Campaign = model<ICampaign>('Campaign', campaignSchema);
