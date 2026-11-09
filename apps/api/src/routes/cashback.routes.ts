import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getActiveMerchants,
  submitCashbackClaim,
  getUserCashbackClaims,
  adminListMerchants,
  adminCreateMerchant,
  adminUpdateMerchant,
  adminDeleteMerchant,
  adminListCashbackClaims,
  adminReviewCashbackClaim,
} from '../controllers/cashback.controller';

export const cashbackRouter = Router();

// User routes
cashbackRouter.get('/shopping/merchants', getActiveMerchants);
cashbackRouter.post('/shopping/claims', requireAuth, submitCashbackClaim);
cashbackRouter.get('/shopping/my-claims', requireAuth, getUserCashbackClaims);

// Admin routes
cashbackRouter.get('/admin/shopping/merchants', requireAdmin, adminListMerchants);
cashbackRouter.post('/admin/shopping/merchants', requireAdmin, adminCreateMerchant);
cashbackRouter.put('/admin/shopping/merchants/:id', requireAdmin, adminUpdateMerchant);
cashbackRouter.delete('/admin/shopping/merchants/:id', requireAdmin, adminDeleteMerchant);
cashbackRouter.get('/admin/shopping/claims', requireAdmin, adminListCashbackClaims);
cashbackRouter.post('/admin/shopping/claims/:id/review', requireAdmin, adminReviewCashbackClaim);

