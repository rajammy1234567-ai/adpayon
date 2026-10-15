import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getReferralSummary,
  getDirectReferrals,
  getTreeChildren,
  getDownline,
} from '../controllers/referral.controller';

export const referralRouter = Router();

// All referral endpoints are strictly protected behind requireAuth middleware
referralRouter.get('/summary', requireAuth, getReferralSummary);
referralRouter.get('/directs', requireAuth, getDirectReferrals);
referralRouter.get('/tree', requireAuth, getTreeChildren);
referralRouter.get('/downline', requireAuth, getDownline);
