import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getWalletSummary,
  getWalletTransactions,
  requestWithdrawal,
  submitKyc,
  deleteUserAccount,
  adminListWithdrawals,
  adminReviewWithdrawal,
  adminListUsers,
} from '../controllers/wallet.controller';

export const walletRouter = Router();

// User Wallet Endpoints (Earner Auth required)
walletRouter.get('/wallet/summary', requireAuth, getWalletSummary);
walletRouter.get('/wallet/transactions', requireAuth, getWalletTransactions);
walletRouter.post('/wallet/withdraw', requireAuth, requestWithdrawal);

// User KYC & Play Store Account Deletion Endpoints (supports both /users and /user)
walletRouter.post('/users/kyc', requireAuth, submitKyc);
walletRouter.post('/user/kyc', requireAuth, submitKyc);
walletRouter.post('/users/delete-account', requireAuth, deleteUserAccount);
walletRouter.post('/user/delete-account', requireAuth, deleteUserAccount);

// Admin Portal Endpoints (Admin 2FA required)
walletRouter.get('/admin/withdrawals', requireAdmin, adminListWithdrawals);
walletRouter.post('/admin/withdrawals/:id/review', requireAdmin, adminReviewWithdrawal);
walletRouter.get('/admin/users', requireAdmin, adminListUsers);
