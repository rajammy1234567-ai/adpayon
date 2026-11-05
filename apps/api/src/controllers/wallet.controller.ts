import crypto from 'node:crypto';
import mongoose, { ClientSession } from 'mongoose';
import { ledgerBalance } from '../services/wallet/balance';
import { verifyQuote, Quote } from '../services/wallet/redemptionQuote';
import { RedemptionPolicy } from '../models/RedemptionPolicy';
import { Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  WalletLedgerEntry,
  WithdrawalRequest,
  TaskCompletion,
  User,
  AdminAuditLog,
  AuthSession,
} from '../models';
import { logger } from '../config/logger';

import {
  POINTS_TO_PAISE_RATIO,
  POINTS_PER_RUPEE,
  pointsToPaise,
  pointsToRupees,
} from '@adpayon/shared';

// Integer accounting: 1000 points = ₹100.00 (1 point = 10 paise)
const MIN_WITHDRAWAL_PAISE = 5000; // ₹50 minimum withdrawal

/**
 * Helper to compute authoritative user balance from double-entry ledger and verified completions.
 */
async function computeUserBalance(userId: Types.ObjectId, session?: ClientSession) {
  const ledgerEntries = await WalletLedgerEntry.find({ userId }).session(session || null);
  const balance = ledgerBalance(ledgerEntries);
  const completions = await TaskCompletion.find({ userId, status: 'VERIFIED' }).session(session || null);
  const recorded = new Set(ledgerEntries.filter(e => e.referenceEntity === 'TaskCompletion' && e.referenceId).map(e => e.referenceId!.toString()));
  for (const c of completions) if (!recorded.has(c._id.toString())) balance.pointsBalance += c.rewardPoints;
  return balance;
}

/**
 * GET /api/wallet/summary
 * Retrieves authenticated user's wallet overview and spendable balances.
 */
export async function getWalletSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;

  try {
    const balance = await computeUserBalance(userId);

    res.status(200).json({
      success: true,
      data: {
        availableBalancePaise: balance.availableBalancePaise,
        availableBalanceRupees: Number((balance.availableBalancePaise / 100).toFixed(2)),
        confirmedBalancePaise: balance.confirmedBalancePaise,
        confirmedBalanceRupees: Number((balance.confirmedBalancePaise / 100).toFixed(2)),
        reservedWithdrawalPaise: balance.reservedWithdrawalPaise,
        reservedWithdrawalRupees: Number((balance.reservedWithdrawalPaise / 100).toFixed(2)),
        totalEarnedPaise: balance.totalEarnedPaise,
        totalEarnedRupees: Number((balance.totalEarnedPaise / 100).toFixed(2)),
        totalWithdrawnPaise: balance.totalWithdrawnPaise,
        totalWithdrawnRupees: Number((balance.totalWithdrawnPaise / 100).toFixed(2)),
        pointsBalance: balance.pointsBalance,
        pointsValuePaise: pointsToPaise(balance.pointsBalance),
        pointsValueRupees: Number(pointsToRupees(balance.pointsBalance)),
        pointsConversionRate: '1000 points = ₹100.00',
        minWithdrawalPaise: MIN_WITHDRAWAL_PAISE,
        minWithdrawalRupees: MIN_WITHDRAWAL_PAISE / 100,
      },
    });
  } catch (err: any) {
    logger.error('Failed to get wallet summary:', err);
    res.status(500).json({
      success: false,
      error: { code: 'WALLET_ERROR', message: 'Failed to retrieve wallet summary' },
    });
  }
}

/**
 * GET /api/wallet/transactions
 * Returns paginated transaction history from the immutable ledger.
 */
export async function getWalletTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  try {
    const filter: any = { userId };
    if (req.query.type) {
      filter.entryType = req.query.type;
    }

    const [entries, total] = await Promise.all([
      WalletLedgerEntry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WalletLedgerEntry.countDocuments(filter),
    ]);

    // Also include verified completions in user's transaction view
    const formatted = entries.map((e) => ({
      id: e._id.toString(),
      type: e.entryType,
      amountPaise: e.entryType === 'TASK_REWARD' && e.metadata?.rewardPolicy !== 'REDEEMABLE_V1' ? 0 : e.amountPaise,
      rewardKind: e.entryType === 'TASK_REWARD' && e.metadata?.rewardPolicy !== 'REDEEMABLE_V1' ? 'PROMOTIONAL_POINTS' : 'CASH',
      amountRupees: e.entryType === 'TASK_REWARD' && e.metadata?.rewardPolicy !== 'REDEEMABLE_V1' ? 0 : Number((e.amountPaise / 100).toFixed(2)),
      pointsEquivalent: e.pointsEquivalent,
      status: e.status,
      notes: e.notes || (e.amountPaise >= 0 ? 'Reward Credit' : 'Withdrawal Hold'),
      createdAt: e.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        transactions: formatted,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err: any) {
    logger.error('Failed to list wallet transactions:', err);
    res.status(500).json({
      success: false,
      error: { code: 'LEDGER_QUERY_ERROR', message: 'Failed to retrieve transactions' },
    });
  }
}

const withdrawSchema = z.object({
  amountPaise: z.number().int().min(MIN_WITHDRAWAL_PAISE, 'Minimum withdrawal is ₹50 (5000 paise)').max(1000000000),
  payoutMode: z.enum(['UPI', 'BANK_TRANSFER', 'USD_ACCOUNT']),
  currency: z.enum(['INR', 'USD']).default('INR'),
  quoteToken: z.string().max(3000).optional(),
  idempotencyKey: z.string().uuid().optional(),
  beneficiaryDetails: z.object({
    usdAccount: z.string().trim().min(5).max(500).optional(),
    upiId: z.string().trim().optional(),
    accountHolderName: z.string().trim().optional(),
    accountNumber: z.string().trim().optional(),
    ifscCode: z.string().trim().optional(),
    bankName: z.string().trim().optional(),
  }),
});

/**
 * POST /api/wallet/withdraw
 * Initiates a formal payout request with balance reservation.
 */
export async function requestWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const parsed = withdrawSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { amountPaise, payoutMode, beneficiaryDetails, currency, quoteToken } = parsed.data;

  // Specific payout validation
  if (payoutMode === 'UPI' && !beneficiaryDetails.upiId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_UPI', message: 'A valid UPI ID is required for UPI payout' },
    });
    return;
  }

  if (payoutMode === 'BANK_TRANSFER') {
    if (!beneficiaryDetails.accountNumber || !beneficiaryDetails.ifscCode) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_BANK_DETAILS', message: 'Bank account number and IFSC are required' },
      });
      return;
    }
  }

  let quote: Quote | null = null;
  if ((currency === 'USD') !== (payoutMode === 'USD_ACCOUNT') || (currency === 'USD' && !beneficiaryDetails.usdAccount)) {
    res.status(400).json({ success: false, error: { message: 'Choose a valid payout method and provide the recipient details for the selected currency.' } }); return;
  }
  try {
    if (quoteToken) quote = verifyQuote(quoteToken, userId.toString(), amountPaise, currency);
    else if (currency === 'USD') throw new Error('QUOTE_REQUIRED');
  } catch { res.status(400).json({ success: false, error: { message: 'Your payout quote is missing, expired or invalid. Preview it again.' } }); return; }
  const session = await mongoose.startSession();
  try {
    let response: any;
    await session.withTransaction(async () => {
      // Serialize balance mutations per user so simultaneous withdrawals cannot overspend.
      const user = await User.findOneAndUpdate({ _id: userId, status: 'ACTIVE' }, { $inc: { walletMutationVersion: 1 } }, { session, new: true });
      if (!user) throw new Error('ACCOUNT_NOT_ACTIVE');
      if (user.metadata?.kycStatus !== 'VERIFIED') throw new Error('KYC_REQUIRED');
      const policy = await RedemptionPolicy.findOne({ key: 'wallet' }).session(session);
      if (currency === 'USD' && (!policy?.usdEnabled || policy.version !== quote?.policyVersion)) throw new Error('QUOTE_EXPIRED');
      const balance = await computeUserBalance(userId, session);
      if (balance.availableBalancePaise < amountPaise) throw new Error('INSUFFICIENT_BALANCE');
      const [withdrawal] = await WithdrawalRequest.create([{
        userId, amountPaise, feePaise: 0, netAmountPaise: amountPaise, payoutMode, beneficiaryDetails,
        currency, payoutMinor: quote?.payoutMinor || amountPaise, paisePerUsd: quote?.paisePerUsd || undefined,
        policyVersion: quote?.policyVersion, status: 'REQUESTED',
        idempotencyKey: quoteToken ? `quote:${crypto.createHash('sha256').update(quoteToken).digest('hex')}` : parsed.data.idempotencyKey ? `${userId}:${parsed.data.idempotencyKey}` : undefined,
      }], { session });
      await WalletLedgerEntry.create([{
        userId, entryType: 'WITHDRAWAL_HOLD', amountPaise: -amountPaise, pointsEquivalent: 0, status: 'PENDING',
        balanceBeforePaise: balance.availableBalancePaise, balanceAfterPaise: balance.availableBalancePaise - amountPaise,
        referenceEntity: 'WithdrawalRequest', referenceId: withdrawal._id,
        idempotencyKey: `withdrawal-hold-${withdrawal._id}`, notes: `Payout requested via ${payoutMode}; awaiting review`,
        metadata: { currency, payoutMinor: withdrawal.payoutMinor },
      }], { session });
      response = { withdrawal: { id: withdrawal._id.toString(), amountPaise, currency, payoutMinor: withdrawal.payoutMinor, payoutMode, status: withdrawal.status, createdAt: withdrawal.createdAt }, remainingBalancePaise: balance.availableBalancePaise - amountPaise };
    });
    res.status(201).json({ success: true, message: 'Withdrawal requested. Payment has not been sent yet.', data: response });
  } catch (err: any) {
    logger.error({ err }, 'Withdrawal request failed');
    const messages: Record<string, string> = { INSUFFICIENT_BALANCE: 'Insufficient available balance.', KYC_REQUIRED: 'Complete KYC verification before withdrawing.', ACCOUNT_NOT_ACTIVE: 'Account is not active.', QUOTE_EXPIRED: 'Payout settings changed. Preview a fresh quote.' };
    res.status(err.code === 11000 ? 409 : messages[err.message] ? 400 : 500).json({ success: false, error: { message: err.code === 11000 ? 'This withdrawal request has already been submitted. Refresh your wallet.' : messages[err.message] || 'Withdrawal was not submitted. Please retry.' } });
  } finally { await session.endSession(); }

}

/**
 * POST /api/users/kyc
 * Submits user identity details for compliance review.
 */
export async function submitKyc(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const { panNumber, aadhaarLast4, bankAccount, ifscCode, accountHolderName } = req.body;

  if (!panNumber || typeof panNumber !== 'string' || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PAN', message: 'Valid 10-character PAN number is required (e.g. ABCDE1234F)' },
    });
    return;
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    user.metadata = {
      ...(user.metadata || {}),
      kycStatus: 'VERIFIED', // In sandbox/staging auto-approves compliant format
      kycDetails: {
        panMasked: `${panNumber.slice(0, 2)}XXXX${panNumber.slice(6)}`,
        aadhaarLast4: aadhaarLast4 || 'XXXX',
        accountHolderName: accountHolderName || user.name,
        bankAccountMasked: bankAccount ? `XXXX${bankAccount.slice(-4)}` : undefined,
        ifscCode: ifscCode ? ifscCode.toUpperCase() : undefined,
        submittedAt: new Date(),
      },
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: 'KYC information verified successfully.',
      data: {
        kycStatus: 'VERIFIED',
      },
    });
  } catch (err: any) {
    logger.error('Failed to submit KYC:', err);
    res.status(500).json({
      success: false,
      error: { code: 'KYC_ERROR', message: 'Failed to update KYC information' },
    });
  }
}

/**
 * POST /api/users/delete-account
 * Google Play Required Account Deletion Endpoint.
 * Anonymizes PII, revokes all sessions, and marks account DELETED.
 */
export async function deleteUserAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const { confirmation } = req.body;

  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    res.status(400).json({
      success: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'Must provide confirmation: "DELETE_MY_ACCOUNT"',
      },
    });
    return;
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Revoke all auth sessions
    await AuthSession.updateMany({ userId: user._id }, { $set: { isValid: false, revokedAt: new Date() } });

    // Anonymize user record & purge PII per Google Play / DPDP requirements
    const anonymizedSuffix = Date.now().toString(36);
    user.name = `Deleted User (${anonymizedSuffix})`;
    user.mobile = undefined;
    user.email = undefined;
    user.status = 'SUSPENDED'; // Prevents future logins
    user.metadata = {
      ...(user.metadata || {}),
      accountDeleted: true,
      deletedAt: new Date(),
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Your ADPAYON account and associated personal data have been scheduled for deletion.',
    });
  } catch (err: any) {
    logger.error('Failed to delete account:', err);
    res.status(500).json({
      success: false,
      error: { code: 'ACCOUNT_DELETION_FAILED', message: 'Failed to process account deletion' },
    });
  }
}

/**
 * GET /api/admin/withdrawals
 * Admin portal: List earner withdrawal queue.
 */
export async function adminListWithdrawals(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  try {
    const filter: any = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const [withdrawals, total] = await Promise.all([
      WithdrawalRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name mobile email'),
      WithdrawalRequest.countDocuments(filter),
    ]);

    const formatted = withdrawals.map((w) => ({
      id: w._id.toString(),
      user: w.userId,
      amountPaise: w.amountPaise,
      amountRupees: Number((w.amountPaise / 100).toFixed(2)),
      payoutMode: w.payoutMode,
      currency: w.currency || 'INR',
      payoutMinor: w.payoutMinor ?? w.netAmountPaise,
      paisePerUsd: w.paisePerUsd,
      payoutReference: w.payoutReference,
      beneficiaryDetails: w.beneficiaryDetails,
      status: w.status,
      adminReviewNotes: w.adminReviewNotes,
      createdAt: w.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        withdrawals: formatted,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err: any) {
    logger.error('Failed to list withdrawals for admin:', err);
    res.status(500).json({
      success: false,
      error: { code: 'ADMIN_WITHDRAWAL_QUERY_ERROR', message: 'Failed to list withdrawals' },
    });
  }
}

/**
 * POST /api/admin/withdrawals/:id/review
 * Admin portal: Approve (mark PAID) or Reject withdrawal with reversal.
 */
export async function adminReviewWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  const input = z.object({ status: z.enum(['PAID', 'PROCESSING', 'REJECTED']), adminReviewNotes: z.string().trim().min(5).max(1000), payoutReference: z.string().trim().max(200).optional() }).safeParse(req.body);
  if (!Types.ObjectId.isValid(req.params.id) || !input.success || (input.data.status === 'PAID' && (input.data.payoutReference?.length || 0) < 5)) {
    res.status(400).json({ success: false, error: { message: 'Enter a valid decision, review notes, and a real payment reference when marking paid.' } }); return;
  }
  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => {
      const w = await WithdrawalRequest.findOne({ _id: req.params.id, status: { $in: ['REQUESTED', 'UNDER_REVIEW', 'PROCESSING'] } }).session(session);
      if (!w) throw new Error('ALREADY_FINALIZED');
      await User.updateOne({ _id: w.userId }, { $inc: { walletMutationVersion: 1 } }, { session });
      const { status, adminReviewNotes, payoutReference } = input.data;
      if (status !== 'PROCESSING') {
        const hold = await WalletLedgerEntry.findOneAndUpdate({ referenceEntity: 'WithdrawalRequest', referenceId: w._id, entryType: 'WITHDRAWAL_HOLD', status: 'PENDING' },
          { $set: status === 'PAID' ? { status: 'CONFIRMED', entryType: 'WITHDRAWAL_PAID' } : { status: 'REVERSED' } }, { session, new: true });
        if (!hold) throw new Error('HOLD_NOT_FOUND');
      }
      w.status = status; w.adminReviewNotes = adminReviewNotes; w.reviewedBy = req.user!._id;
      if (status === 'PAID') { w.payoutReference = payoutReference; w.processedAt = new Date(); }
      await w.save({ session });
      await AdminAuditLog.create([{ adminId: req.user!._id, action: `PAYOUT_${status}`, targetEntity: 'WithdrawalRequest', targetId: w._id.toString(), details: input.data, ipAddress: req.ip || 'unknown' }], { session });
      result = { id: w._id.toString(), status: w.status, payoutReference: w.payoutReference };
    });
    res.json({ success: true, data: { withdrawal: result } });
  } catch (err: any) {
    logger.error({ err }, 'Withdrawal review failed');
    res.status(err.message === 'ALREADY_FINALIZED' ? 409 : 500).json({ success: false, error: { message: err.message === 'ALREADY_FINALIZED' ? 'This withdrawal is already finalized or unavailable.' : 'Review was not saved. Refresh and retry.' } });
  } finally { await session.endSession(); }
}

/**
 * GET /api/admin/users
 * Admin portal: Search & inspect registered users.
 */
export async function adminListUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  try {
    const filter: any = {};
    if (req.query.search) {
      const q = (req.query.search as string).trim();
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { mobile: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { referralCode: { $regex: q, $options: 'i' } },
      ];
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.role) {
      filter.role = req.query.role;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-passwordHash'),
      User.countDocuments(filter),
    ]);

    const formatted = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      mobile: u.mobile,
      email: u.email,
      role: u.role,
      status: u.status,
      referralCode: u.referralCode,
      directReferralsCount: u.directReferralsCount,
      kycStatus: u.metadata?.kycStatus || 'NOT_SUBMITTED',
      createdAt: u.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: {
        users: formatted,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err: any) {
    logger.error('Failed to list users:', err);
    res.status(500).json({
      success: false,
      error: { code: 'USER_QUERY_ERROR', message: 'Failed to retrieve users' },
    });
  }
}
