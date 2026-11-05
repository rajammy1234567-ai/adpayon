import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Category, Offer } from '../models';
import { logger } from '../config/logger';

// Helper to generate a slug from a name if not provided
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().max(100).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(50).optional(),
  bannerUrl: z.string().trim().url().optional().or(z.literal('')),
  displayOrder: z.coerce.number().int().min(0).default(0),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED']).default('DRAFT'),
});

const updateCategorySchema = createCategorySchema.partial();

/**
 * GET /api/categories
 * Returns all published categories sorted by displayOrder for mobile and web clients.
 * Includes count of published, non-expired offers per category.
 */
export async function getCategories(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await Category.find({ status: 'PUBLISHED' })
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    const now = new Date();
    // Count published offers per category
    const categoryIds = categories.map((c) => c._id);
    const offerCounts = await Offer.aggregate([
      {
        $match: {
          categoryId: { $in: categoryIds },
          status: 'PUBLISHED',
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
        },
      },
      {
        $group: {
          _id: '$categoryId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map<string, number>();
    offerCounts.forEach((oc) => countMap.set(oc._id.toString(), oc.count));

    const formatted = categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      icon: c.icon || 'grid',
      bannerUrl: c.bannerUrl || '',
      displayOrder: c.displayOrder || 0,
      status: c.status,
      offersCount: countMap.get(c._id.toString()) || 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch categories');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch categories' },
    });
  }
}

/**
 * GET /api/categories/:idOrSlug
 */
export async function getCategoryByIdOrSlug(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = req.params;
  try {
    let category = null;
    if (Types.ObjectId.isValid(idOrSlug)) {
      category = await Category.findById(idOrSlug).lean();
    }
    if (!category) {
      category = await Category.findOne({ slug: idOrSlug.toLowerCase() }).lean();
    }

    if (!category) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Category not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        icon: category.icon || 'grid',
        bannerUrl: category.bannerUrl || '',
        displayOrder: category.displayOrder || 0,
        status: category.status,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch category');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch category' },
    });
  }
}

/**
 * GET /api/admin/categories
 * Admin: Returns all categories with optional status filter.
 */
export async function getAdminCategories(req: Request, res: Response): Promise<void> {
  const { status } = req.query;
  const filter: any = {};
  if (status && status !== 'ALL') {
    filter.status = status;
  }

  try {
    const categories = await Category.find(filter)
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    const categoryIds = categories.map((c) => c._id);
    const offerCounts = await Offer.aggregate([
      {
        $match: { categoryId: { $in: categoryIds } },
      },
      {
        $group: {
          _id: '$categoryId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map<string, number>();
    offerCounts.forEach((oc) => countMap.set(oc._id.toString(), oc.count));

    const formatted = categories.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      icon: c.icon || 'grid',
      bannerUrl: c.bannerUrl || '',
      displayOrder: c.displayOrder || 0,
      status: c.status,
      offersCount: countMap.get(c._id.toString()) || 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch admin categories');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch categories' },
    });
  }
}

/**
 * POST /api/admin/categories
 * Admin: Create category.
 */
export async function createCategory(req: Request, res: Response): Promise<void> {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { name, description, icon, bannerUrl, displayOrder, status } = parsed.data;
  const rawSlug = parsed.data.slug || slugify(name);
  const slug = slugify(rawSlug);

  try {
    const existing = await Category.findOne({ slug });
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'SLUG_EXISTS', message: `Category with slug "${slug}" already exists.` },
      });
      return;
    }

    const category = await Category.create({
      name,
      slug,
      description,
      icon,
      bannerUrl: bannerUrl || undefined,
      displayOrder,
      status,
    });

    res.status(201).json({
      success: true,
      data: {
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        bannerUrl: category.bannerUrl,
        displayOrder: category.displayOrder,
        status: category.status,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to create category');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create category' },
    });
  }
}

/**
 * PUT /api/admin/categories/:id
 * Admin: Update category.
 */
export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid category ID' },
    });
    return;
  }

  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  try {
    const category = await Category.findById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Category not found' },
      });
      return;
    }

    if (parsed.data.slug && parsed.data.slug !== category.slug) {
      const slug = slugify(parsed.data.slug);
      const conflict = await Category.findOne({ slug, _id: { $ne: category._id } });
      if (conflict) {
        res.status(409).json({
          success: false,
          error: { code: 'SLUG_EXISTS', message: `Slug "${slug}" already in use.` },
        });
        return;
      }
      category.slug = slug;
    }

    if (parsed.data.name !== undefined) category.name = parsed.data.name;
    if (parsed.data.description !== undefined) category.description = parsed.data.description;
    if (parsed.data.icon !== undefined) category.icon = parsed.data.icon;
    if (parsed.data.bannerUrl !== undefined) category.bannerUrl = parsed.data.bannerUrl || undefined;
    if (parsed.data.displayOrder !== undefined) category.displayOrder = parsed.data.displayOrder;
    if (parsed.data.status !== undefined) category.status = parsed.data.status;

    await category.save();

    res.status(200).json({
      success: true,
      data: {
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        description: category.description,
        icon: category.icon,
        bannerUrl: category.bannerUrl,
        displayOrder: category.displayOrder,
        status: category.status,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to update category');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update category' },
    });
  }
}

/**
 * DELETE /api/admin/categories/:id
 */
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid category ID' },
    });
    return;
  }

  try {
    const activeOffers = await Offer.countDocuments({ categoryId: id });
    if (activeOffers > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'CATEGORY_IN_USE',
          message: `Cannot delete category with ${activeOffers} associated offer(s). Reassign or delete offers first.`,
        },
      });
      return;
    }

    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Category not found' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to delete category');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete category' },
    });
  }
}

