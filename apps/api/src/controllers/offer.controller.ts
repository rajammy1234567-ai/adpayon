import { Request, Response } from 'express';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { createOfferSchema, updateOfferSchema } from '../validators/offerContent';
import { Offer, Category, User, WalletLedgerEntry } from '../models';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { slugify } from './category.controller';
import { pointsToPaise } from '@adpayon/shared';

/**
 * Computes an HMAC signature for a referral link to ensure referral attribution tamper-resistance.
 */
export function signReferralAttribution(offerSlug: string, referralCode: string): string {
  const secret = env.JWT_ACCESS_SECRET;
  return crypto
    .createHmac('sha256', secret)
    .update(`${offerSlug.toLowerCase()}:${referralCode.trim().toUpperCase()}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Validates the referral attribution signature.
 */
export function verifyReferralAttribution(offerSlug: string, referralCode: string, signature?: string): boolean {
  if (!signature || !referralCode || !/^[a-f0-9]{16}$/.test(signature)) return false;
  const expected = signReferralAttribution(offerSlug, referralCode);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * GET /api/offers
 * Returns published, active offers for mobile and web.
 * Optional query: categoryId, categorySlug
 */
export async function getOffers(req: Request, res: Response): Promise<void> {
  const { categoryId, categorySlug } = req.query;
  const now = new Date();

  const filter: any = {
    status: 'PUBLISHED',
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
  };

  try {
    if (categoryId && typeof categoryId === 'string' && Types.ObjectId.isValid(categoryId)) {
      filter.categoryId = new Types.ObjectId(categoryId);
    } else if (categorySlug && typeof categorySlug === 'string') {
      const category = await Category.findOne({ slug: categorySlug.toLowerCase() });
      if (category) {
        filter.categoryId = category._id;
      } else {
        res.status(200).json({ success: true, data: [] });
        return;
      }
    }

    const offers = await Offer.find(filter)
      .populate('categoryId', 'name slug icon')
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    const formatted = offers.map((o: any) => ({
      id: o._id.toString(),
      title: o.title,
      slug: o.slug,
      categoryId: o.categoryId?._id ? o.categoryId._id.toString() : o.categoryId?.toString(),
      categoryName: o.categoryId?.name || '',
      categorySlug: o.categoryId?.slug || '',
      categoryIcon: o.categoryId?.icon || 'grid',
      description: o.description,
      rewardPoints: o.rewardPoints,
      status: o.status,
      displayOrder: o.displayOrder || 0,
      expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
      bannerUrl: o.bannerUrl || '',
      images: o.images || [],
      instructions: o.instructions || [],
      additionalNotes: o.additionalNotes || '',
      trainingLinks: o.trainingLinks || [],
      content: o.content || {},
      faqs: o.faqs || [],
      completionConditions: o.completionConditions,
      completionsCount: o.completionsCount || 0,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch offers');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch offers' },
    });
  }
}

/**
 * GET /api/offers/:idOrSlug
 */
export async function getOfferByIdOrSlug(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = req.params;

  try {
    let offer = null;
    if (Types.ObjectId.isValid(idOrSlug)) {
      offer = await Offer.findById(idOrSlug).populate('categoryId', 'name slug icon').lean();
    }
    if (!offer) {
      offer = await Offer.findOne({ slug: idOrSlug.toLowerCase() }).populate('categoryId', 'name slug icon').lean();
    }

    if (!offer) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Offer not found' },
      });
      return;
    }

    if ((req as AuthenticatedRequest).user?.role !== 'ADMIN' && (offer.status !== 'PUBLISHED' || (offer.expiresAt && offer.expiresAt <= new Date()))) {
      res.status(404).json({ success: false, error: { message: 'Offer not available' } }); return;
    }
    const o: any = offer;
    res.status(200).json({
      success: true,
      data: {
        id: o._id.toString(),
        title: o.title,
        slug: o.slug,
        categoryId: o.categoryId?._id ? o.categoryId._id.toString() : o.categoryId?.toString(),
        categoryName: o.categoryId?.name || '',
        categorySlug: o.categoryId?.slug || '',
        categoryIcon: o.categoryId?.icon || 'grid',
        description: o.description,
        rewardPoints: o.rewardPoints,
        status: o.status,
        displayOrder: o.displayOrder || 0,
        expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
        bannerUrl: o.bannerUrl || '',
        images: o.images || [],
        instructions: o.instructions || [],
        additionalNotes: o.additionalNotes || '',
        trainingLinks: o.trainingLinks || [],
        content: o.content || {},
      faqs: o.faqs || [],
        completionConditions: o.completionConditions,
        completionsCount: o.completionsCount || 0,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch offer details');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch offer details' },
    });
  }
}

/**
 * GET /api/offers/public/:slug
 * Public offer landing page endpoint.
 * Validates optional signed referral attribution: ?ref=...&sig=...
 * Note: Sharing or viewing alone NEVER credits rewards.
 */
export async function getPublicOfferBySlug(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;
  const { ref, sig } = req.query;

  try {
    const offer: any = await Offer.findOne({ slug: slug.toLowerCase() })
      .populate('categoryId', 'name slug icon')
      .lean();

    if (!offer || offer.status !== 'PUBLISHED' || (offer.expiresAt && offer.expiresAt <= new Date())) {
      res.status(404).json({ success: false, error: { message: 'Offer not available' } }); return;
    }

    // Validate referral attribution if provided
    let referrerInfo: { name: string; referralCode: string } | null = null;
    let isValidReferral = false;

    if (ref && typeof ref === 'string') {
      const refCode = ref.trim().toUpperCase();
      const referrer = await User.findOne({ referralCode: refCode, status: 'ACTIVE' });
      if (referrer) {
        if (sig && typeof sig === 'string') {
          isValidReferral = verifyReferralAttribution(offer.slug, refCode, sig);
        } else {
          // If signature omitted in simple links, referral code is still recognized for signup
          isValidReferral = false;
        }

        if (isValidReferral) referrerInfo = {
          name: referrer.name.split(' ')[0], // Privacy-masked first name
          referralCode: referrer.referralCode,
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        offer: {
          id: offer._id.toString(),
          title: offer.title,
          slug: offer.slug,
          categoryName: offer.categoryId?.name || '',
          categorySlug: offer.categoryId?.slug || '',
          description: offer.description,
          rewardPoints: offer.rewardPoints,
          status: offer.status,
          bannerUrl: offer.bannerUrl || '',
          images: offer.images || [],
          instructions: offer.instructions || [],
          additionalNotes: offer.additionalNotes || '',
          trainingLinks: offer.trainingLinks || [],
          content: offer.content || {},
          faqs: offer.faqs || [],
          completionConditions: offer.completionConditions,
        },
        referrer: referrerInfo,
        isValidReferral,
        notice: 'Points are credited exclusively upon verified completion. Sharing or clicking does not award points.',
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch public offer');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch public offer' },
    });
  }
}

/**
 * POST /api/offers/:id/share-link
 * Authenticated: Generates offer-specific shareable link with signed referral attribution.
 */
export async function generateOfferShareLink(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
    const offer = await Offer.findById(id);
    if (!offer) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Offer not found' } });
      return;
    }

    const refCode = user.referralCode;
    const signature = signReferralAttribution(offer.slug, refCode);

    if (offer.status !== 'PUBLISHED' || (offer.expiresAt && offer.expiresAt <= new Date())) {
      res.status(404).json({ success: false, error: { message: 'Offer not available for sharing.' } }); return;
    }
    const configuredOrigin = env.PUBLIC_OFFER_ORIGIN || process.env.RENDER_EXTERNAL_URL;
    if (!configuredOrigin && env.NODE_ENV === 'production') {
      res.status(503).json({ success: false, error: { message: 'Public offer hosting has not been configured.' } }); return;
    }
    const origin = new URL(configuredOrigin || `http://127.0.0.1:${env.PORT}`).origin;
    const shareUrl = `${origin}/api/offers/landing/${encodeURIComponent(offer.slug)}?ref=${encodeURIComponent(refCode)}&sig=${signature}`;
    const shareMessage = `${offer.content?.marketingMessage || offer.title}\n\n${shareUrl}`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;

    res.status(200).json({
      success: true,
      data: {
        offerId: offer._id.toString(),
        offerTitle: offer.title,
        offerSlug: offer.slug,
        referralCode: refCode,
        signature,
        shareUrl,
        whatsappUrl,
        shareMessage,
        rewardPolicy: 'STRICT_COMPLETION_ONLY',
        note: 'Sharing or clicking alone does not credit rewards. Points are credited upon verified completion.',
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to generate share link');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to generate share link' },
    });
  }
}

/**
 * POST /api/offers/:id/complete
 * Authenticated: Completes an offer and awards reward points using integer accounting.
 * Also calculates and distributes referral commissions up to 8 levels according to DEFAULT_COMMISSION_CONFIG.
 * Strict anti-replay and single-credit per completion.
 */
// Backward-compatible endpoint now submits for verification; it never credits on a click.
export { submitOffer as completeOffer } from './offerSubmission.controller';

/**
 * GET /api/admin/offers
 * Admin: Return all offers with optional category/status filters and pagination.
 */
export async function getAdminOffers(req: Request, res: Response): Promise<void> {
  const { categoryId, status, page = 1, limit = 50 } = req.query;
  const filter: any = {};

  if (status && status !== 'ALL') {
    filter.status = status;
  }
  if (categoryId && typeof categoryId === 'string' && Types.ObjectId.isValid(categoryId)) {
    filter.categoryId = new Types.ObjectId(categoryId);
  }

  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 50));

  try {
    const [total, offers] = await Promise.all([
      Offer.countDocuments(filter),
      Offer.find(filter)
        .populate('categoryId', 'name slug icon')
        .sort({ displayOrder: 1, createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
    ]);

    const formatted = offers.map((o: any) => ({
      id: o._id.toString(),
      title: o.title,
      slug: o.slug,
      categoryId: o.categoryId?._id ? o.categoryId._id.toString() : o.categoryId?.toString(),
      categoryName: o.categoryId?.name || '',
      categorySlug: o.categoryId?.slug || '',
      categoryIcon: o.categoryId?.icon || 'grid',
      description: o.description,
      rewardPoints: o.rewardPoints,
      status: o.status,
      displayOrder: o.displayOrder || 0,
      expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
      bannerUrl: o.bannerUrl || '',
      images: o.images || [],
      instructions: o.instructions || [],
      additionalNotes: o.additionalNotes || '',
      trainingLinks: o.trainingLinks || [],
      content: o.content || {},
      faqs: o.faqs || [],
      completionConditions: o.completionConditions,
      completionsCount: o.completionsCount || 0,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: {
        items: formatted,
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l) || 1,
        },
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch admin offers');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch offers' },
    });
  }
}

/**
 * POST /api/admin/offers
 * Admin: Create offer.
 */
export async function createOffer(req: Request, res: Response): Promise<void> {
  const parsed = createOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const {
    content,
    title,
    categoryId,
    description,
    rewardPoints,
    status,
    displayOrder,
    expiresAt,
    bannerUrl,
    images,
    instructions,
    additionalNotes,
    trainingLinks,
    faqs,
    completionConditions,
  } = parsed.data;

  const rawSlug = parsed.data.slug || slugify(title);
  const slug = slugify(rawSlug);

  try {
    const existing = await Offer.findOne({ slug });
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'SLUG_EXISTS', message: `Offer with slug "${slug}" already exists.` },
      });
      return;
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: { code: 'CATEGORY_NOT_FOUND', message: 'Referenced category does not exist.' },
      });
      return;
    }

    const offer = await Offer.create({
      content,
      title,
      slug,
      categoryId: new Types.ObjectId(categoryId),
      description,
      rewardPoints,
      status,
      displayOrder,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      bannerUrl: bannerUrl || undefined,
      images: images || [],
      instructions: instructions || [],
      additionalNotes: additionalNotes || undefined,
      trainingLinks: trainingLinks || [],
      faqs: faqs || [],
      completionConditions,
    });

    res.status(201).json({
      success: true,
      data: {
        id: offer._id.toString(),
        title: offer.title,
        slug: offer.slug,
        categoryId: offer.categoryId.toString(),
        description: offer.description,
        rewardPoints: offer.rewardPoints,
        status: offer.status,
        displayOrder: offer.displayOrder,
        expiresAt: offer.expiresAt ? offer.expiresAt.toISOString() : null,
        bannerUrl: offer.bannerUrl,
        instructions: offer.instructions,
        content: offer.content || {},
        images: offer.images,
        trainingLinks: offer.trainingLinks,
        faqs: offer.faqs,
        additionalNotes: offer.additionalNotes,
        completionConditions: offer.completionConditions,
        createdAt: offer.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to create offer');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create offer' },
    });
  }
}

/**
 * PUT /api/admin/offers/:id
 * Admin: Update offer.
 */
export async function updateOffer(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid offer ID' } });
    return;
  }

  const parsed = updateOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  try {
    const offer = await Offer.findById(id);
    if (!offer) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Offer not found' } });
      return;
    }

    if (parsed.data.slug && parsed.data.slug !== offer.slug) {
      const slug = slugify(parsed.data.slug);
      const conflict = await Offer.findOne({ slug, _id: { $ne: offer._id } });
      if (conflict) {
        res.status(409).json({
          success: false,
          error: { code: 'SLUG_EXISTS', message: `Slug "${slug}" already in use.` },
        });
        return;
      }
      offer.slug = slug;
    }

    if (parsed.data.content !== undefined) offer.content = parsed.data.content;
    if (parsed.data.title !== undefined) offer.title = parsed.data.title;
    if (parsed.data.categoryId !== undefined) offer.categoryId = new Types.ObjectId(parsed.data.categoryId);
    if (parsed.data.description !== undefined) offer.description = parsed.data.description;
    if (parsed.data.rewardPoints !== undefined) offer.rewardPoints = parsed.data.rewardPoints;
    if (parsed.data.status !== undefined) offer.status = parsed.data.status;
    if (parsed.data.displayOrder !== undefined) offer.displayOrder = parsed.data.displayOrder;
    if (parsed.data.expiresAt !== undefined) {
      offer.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined;
    }
    if (parsed.data.bannerUrl !== undefined) offer.bannerUrl = parsed.data.bannerUrl || undefined;
    if (parsed.data.images !== undefined) offer.images = parsed.data.images;
    if (parsed.data.instructions !== undefined) offer.instructions = parsed.data.instructions;
    if (parsed.data.additionalNotes !== undefined) offer.additionalNotes = parsed.data.additionalNotes || undefined;
    if (parsed.data.trainingLinks !== undefined) offer.trainingLinks = parsed.data.trainingLinks as any;
    if (parsed.data.faqs !== undefined) offer.faqs = parsed.data.faqs as any;
    if (parsed.data.completionConditions !== undefined) offer.completionConditions = parsed.data.completionConditions as any;

    await offer.save();

    res.status(200).json({
      success: true,
      data: {
        id: offer._id.toString(),
        title: offer.title,
        slug: offer.slug,
        categoryId: offer.categoryId.toString(),
        description: offer.description,
        rewardPoints: offer.rewardPoints,
        status: offer.status,
        displayOrder: offer.displayOrder,
        expiresAt: offer.expiresAt ? offer.expiresAt.toISOString() : null,
        bannerUrl: offer.bannerUrl,
        instructions: offer.instructions,
        content: offer.content || {},
        images: offer.images,
        trainingLinks: offer.trainingLinks,
        faqs: offer.faqs,
        additionalNotes: offer.additionalNotes,
        completionConditions: offer.completionConditions,
        updatedAt: offer.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to update offer');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update offer' },
    });
  }
}

/**
 * DELETE /api/admin/offers/:id
 */
export async function deleteOffer(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid offer ID' } });
    return;
  }

  try {
    const deleted = await Offer.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Offer not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Offer deleted successfully',
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to delete offer');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete offer' },
    });
  }
}
