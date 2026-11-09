import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getActiveBanners,
  trackBannerClick,
  adminListBanners,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
} from '../controllers/banner.controller';

export const bannerRouter = Router();

// Public routes
bannerRouter.get('/banners', getActiveBanners);
bannerRouter.post('/banners/:id/click', trackBannerClick);

// Admin routes
bannerRouter.get('/admin/banners', requireAdmin, adminListBanners);
bannerRouter.post('/admin/banners', requireAdmin, adminCreateBanner);
bannerRouter.put('/admin/banners/:id', requireAdmin, adminUpdateBanner);
bannerRouter.delete('/admin/banners/:id', requireAdmin, adminDeleteBanner);

