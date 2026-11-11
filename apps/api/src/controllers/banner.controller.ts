import { Request, Response } from 'express';
import { SponsoredBanner } from '../models/SponsoredBanner';

// Public: Get all active sponsored banners sorted by display order
export async function getActiveBanners(req: Request, res: Response): Promise<void> {
  try {
    const banners = await SponsoredBanner.find({ active: true }).sort({ displayOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: banners.map((b) => ({
        id: b._id.toString(),
        title: b.title,
        imageUrl: b.imageUrl,
        destinationUrl: b.destinationUrl,
        sponsorName: b.sponsorName,
        ctaText: b.ctaText || 'Explore',
        targetCategory: b.targetCategory || 'ALL',
        active: b.active,
        displayOrder: b.displayOrder,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch banners' } });
  }
}

// Public: Record click on banner
export async function trackBannerClick(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await SponsoredBanner.findByIdAndUpdate(id, { $inc: { clicksCount: 1 } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: List all banners
export async function adminListBanners(req: Request, res: Response): Promise<void> {
  try {
    const banners = await SponsoredBanner.find().sort({ displayOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: banners.map((b) => ({
        id: b._id.toString(),
        title: b.title,
        imageUrl: b.imageUrl,
        destinationUrl: b.destinationUrl,
        sponsorName: b.sponsorName,
        ctaText: b.ctaText || 'Explore',
        targetCategory: b.targetCategory || 'ALL',
        active: b.active,
        displayOrder: b.displayOrder,
        clicksCount: b.clicksCount,
        impressionsCount: b.impressionsCount,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Create banner
export async function adminCreateBanner(req: Request, res: Response): Promise<void> {
  try {
    const { title, imageUrl, destinationUrl, sponsorName, ctaText, targetCategory, displayOrder, active } = req.body;
    if (!title || !imageUrl) {
      res.status(400).json({
        success: false,
        error: { message: 'Title and imageUrl are required' },
      });
      return;
    }

    const banner = new SponsoredBanner({
      title,
      imageUrl,
      destinationUrl: destinationUrl || '',
      sponsorName: sponsorName || 'AdPayOn Partner',
      ctaText: ctaText || 'Explore',
      targetCategory: targetCategory || 'ALL',
      displayOrder: Number(displayOrder) || 0,
      active: active !== undefined ? Boolean(active) : true,
    });
    await banner.save();

    res.status(201).json({
      success: true,
      data: {
        id: banner._id.toString(),
        title: banner.title,
        imageUrl: banner.imageUrl,
        destinationUrl: banner.destinationUrl,
        sponsorName: banner.sponsorName,
        ctaText: banner.ctaText,
        targetCategory: banner.targetCategory,
        active: banner.active,
        displayOrder: banner.displayOrder,
        createdAt: banner.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Update banner
export async function adminUpdateBanner(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { title, imageUrl, destinationUrl, sponsorName, ctaText, targetCategory, displayOrder, active } = req.body;

    const banner = await SponsoredBanner.findById(id);
    if (!banner) {
      res.status(404).json({ success: false, error: { message: 'Banner not found' } });
      return;
    }

    if (title !== undefined) banner.title = title;
    if (imageUrl !== undefined) banner.imageUrl = imageUrl;
    if (destinationUrl !== undefined) banner.destinationUrl = destinationUrl;
    if (sponsorName !== undefined) banner.sponsorName = sponsorName;
    if (ctaText !== undefined) banner.ctaText = ctaText;
    if (targetCategory !== undefined) banner.targetCategory = targetCategory;
    if (displayOrder !== undefined) banner.displayOrder = Number(displayOrder);
    if (active !== undefined) banner.active = Boolean(active);

    await banner.save();

    res.json({
      success: true,
      data: {
        id: banner._id.toString(),
        title: banner.title,
        imageUrl: banner.imageUrl,
        destinationUrl: banner.destinationUrl,
        sponsorName: banner.sponsorName,
        ctaText: banner.ctaText,
        targetCategory: banner.targetCategory,
        active: banner.active,
        displayOrder: banner.displayOrder,
        createdAt: banner.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Delete banner
export async function adminDeleteBanner(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await SponsoredBanner.findByIdAndDelete(id);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

