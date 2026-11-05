import { z } from 'zod';
import { Types } from 'mongoose';
export const httpUrl = z.string().trim().url().max(2048).refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Use an HTTP or HTTPS URL without embedded credentials');
const bulletList = z.array(z.string().trim().min(1).max(2000)).max(50).default([]);
export const offerContentSchema = z.object({
  logoUrl: httpUrl.optional().or(z.literal('')),
  benefits: bulletList, eligibility: bulletList, documents: bulletList, terms: bulletList,
  trackingNotes: bulletList, payoutNotes: bulletList,
  marketingMessage: z.string().trim().max(3000).optional(),
  marketingBanners: z.array(z.object({ title: z.string().trim().min(1).max(200), imageUrl: httpUrl })).max(20).default([]),
});
const offerTrainingLinkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: httpUrl,
  description: z.string().trim().max(1000).optional(),
  thumbnailUrl: httpUrl.optional().or(z.literal('')),
});

const offerFaqSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
});

const offerCompletionConditionsSchema = z.object({
  dwellTimeSeconds: z.coerce.number().int().min(0).default(0),
  actionType: z.enum([
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
  ]).default('FIRST_PARTY_ACTION'),
  targetUrl: httpUrl.optional().or(z.literal('')),
  conditionDescription: z.string().trim().max(500).optional().default(''),
  requiresProof: z.boolean().optional().default(false),
  proofInstructions: z.string().trim().optional().or(z.literal('')),
  completionCodeRequired: z.boolean().optional().default(false),
});

export const createOfferSchema = z.object({
  content: offerContentSchema.optional(),
  title: z.string().trim().min(2).max(200),
  slug: z.string().trim().max(200).optional(),
  categoryId: z.string().trim().refine((val) => Types.ObjectId.isValid(val), 'Invalid Category ID'),
  description: z.string().trim().min(5).max(2000),
  rewardPoints: z.coerce.number().int().min(0).max(100000000),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'EXPIRED']).default('DRAFT'),
  displayOrder: z.coerce.number().int().min(0).default(0),
  expiresAt: z.string().datetime().optional().nullable(),
  bannerUrl: httpUrl.optional().or(z.literal('')),
  images: z.array(httpUrl).default([]),
  instructions: z.array(z.string().trim()).default([]),
  additionalNotes: z.string().trim().max(3000).optional().or(z.literal('')),
  trainingLinks: z.array(offerTrainingLinkSchema).default([]),
  faqs: z.array(offerFaqSchema).default([]),
  completionConditions: offerCompletionConditionsSchema,
});

export const updateOfferSchema = createOfferSchema.partial();

