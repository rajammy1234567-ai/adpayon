import { Router } from 'express';
import {
  loginAdmin,
  verifyAdminMfa,
  logoutAdmin,
  getAdminProfile,
} from '../controllers/adminAuth.controller';
import { requireAdmin } from '../middleware/adminAuth';
import { authRateLimiter } from '../middleware/rateLimiters';

export const adminAuthRouter = Router();

// Publicly reachable admin login and MFA verification (strictly rate-limited)
adminAuthRouter.post('/admin/auth/login', authRateLimiter, loginAdmin);
adminAuthRouter.post('/admin/auth/mfa-verify', authRateLimiter, verifyAdminMfa);

// Authenticated admin identity endpoints
adminAuthRouter.post('/admin/auth/logout', requireAdmin, logoutAdmin);
adminAuthRouter.get('/admin/auth/me', requireAdmin, getAdminProfile);
