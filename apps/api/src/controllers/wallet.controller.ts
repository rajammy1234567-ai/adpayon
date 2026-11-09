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
import { verifyPassword } from '../services/passwordService';

import {
  POINTS_TO_PAISE_RATIO,
  POINTS_PER_RUPEE,
  pointsToPaise,
  pointsToRupees,
} from '@adpayon/shared';

// Integer accounting: 1,000 points = USD $1.00 (1 point = $0.001 USD)
// Minimum withdrawal: 1,000 points ($1.00 USD)
const MIN_WITHDRAWAL_POINTS = 1000;
const MIN_WITHDRAWAL_PAISE = 1000;

/**
 * Helper to compute authoritative user balance from double-entry ledger and verified completions.
 */
async function computeUserBalance(userId: Types.ObjectId, session?: ClientSession) {
  const ledgerEntries = await WalletLedgerEntry.find({ userId }).session(session || null);
  const balance = ledgerBalance(ledgerEntries);
  const completions = await TaskCompletion.find({ userId, status: 'VERIFIED' }).session(session || null);
  const recorded = new Set(
    ledgerEntries
      .filter((e) => e.referenceEntity === 'TaskCompletion' && e.referenceId)
      .map((e) => e.referenceId!.toString())
  );
  for (const c of completions) {
    if (!recorded.has(c._id.toString())) {
      balance.pointsBalance += c.rewardPoints;
    }
  }
  return balance;
}

/**
 * GET /api/wallet/summary
 * Retrieves authenticated user's wallet overview with authoritative Points & USD balances.
 */
export async function getWalletSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;

  try {
    const balance = await computeUserBalance(userId);

    res.status(200).json({
      success: true,
      data: {
        // Authoritative Points and USD balances
        availablePoints: balance.availablePoints,
        availableUsd: balance.availableUsd,
        reservedPoints: balance.reservedPoints,
        reservedUsd: balance.reservedUsd,
        totalEarnedPoints: balance.totalEarnedPoints,
        totalEarnedUsd: balance.totalEarnedUsd,
        totalWithdrawnPoints: balance.totalWithdrawnPoints,
        totalWithdrawnUsd: balance.totalWithdrawnUsd,
        pointsConversionRate: '1,000 points = USD $1.00',
        minWithdrawalPoints: MIN_WITHDRAWAL_POINTS,
        minWithdrawalUsd: 1.0,
        // Legacy INR fields preserved for backward compatibility
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
      WalletLedgerEntry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      WalletLedgerEntry.countDocuments(filter),
    ]);

    const formatted = entries.map((e) => {
      const isRedeemable =
        ['REFERRAL_COMMISSION', 'ADMIN_ADJUSTMENT'].includes(e.entryType) ||
        (e.entryType === 'TASK_REWARD' && e.metadata?.rewardPolicy === 'REDEEMABLE_V1') ||
        e.entryType.startsWith('WITHDRAWAL');

      const pts = Math.abs(e.pointsEquivalent || Math.floor(Math.abs(e.amountPaise) / 10));

      return {
        id: e._id.toString(),
        type: e.entryType,
        amountPaise: isRedeemable ? e.amountPaise : 0,
        amountRupees: isRedeemable ? Number((e.amountPaise / 100).toFixed(2)) : 0,
        pointsEquivalent: pts,
        usdEquivalent: Number((pts * 0.001).toFixed(3)),
        rewardKind: isRedeemable ? 'CASH' : 'PROMOTIONAL_POINTS',
        status: e.status,
        notes: e.notes || (e.amountPaise >= 0 ? 'Reward Credit' : 'Withdrawal Hold'),
        createdAt: e.createdAt,
      };
    });

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
  pointsAmount: z.number().int().min(MIN_WITHDRAWAL_POINTS, `Minimum withdrawal is ${MIN_WITHDRAWAL_POINTS} points ($1.00)`).optional(),
  amountPaise: z.number().int().min(MIN_WITHDRAWAL_PAISE).optional(),
  payoutMode: z.enum(['BANK_ACCOUNT', 'USDT_WALLET', 'BANK_TRANSFER', 'UPI', 'USD_ACCOUNT']),
  accountPassword: z.string().min(1, 'ADPAYON account password confirmation is required'),
  currency: z.enum(['INR', 'USD']).default('USD'),
  quoteToken: z.string().max(3000).optional(),
  idempotencyKey: z.string().optional(),
  beneficiaryDetails: z.object({
    accountHolderName: z.string().trim().optional(),
    accountNumber: z.string().trim().optional(),
    ifscCode: z.string().trim().optional(),
    bankName: z.string().trim().optional(),
    usdtAddress: z.string().trim().optional(),
    network: z.enum(['BEP20']).optional(),
    usdAccount: z.string().trim().optional(),
    upiId: z.string().trim().optional(),
  }),
});

/**
 * POST /api/wallet/withdraw
 * Initiates a formal payout request with server-side password verification and balance reservation.
 */
export async function requestWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const parsed = withdrawSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format(), message: 'Invalid withdrawal payload' },
    });
    return;
  }

  const {
    pointsAmount: rawPoints,
    amountPaise: rawPaise,
    payoutMode,
    accountPassword,
    beneficiaryDetails,
    currency,
  } = parsed.data;

  // 1. ADPAYON Account Password Confirmation (Argon2 server-side verification)
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || user.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: { message: 'Account is not active or unavailable.' },
    });
    return;
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, accountPassword);
  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Incorrect ADPAYON account password. Payout request denied.' },
    });
    return;
  }

  // 2. KYC Prerequisite Check (fail-closed if unverified)
  if (user.metadata?.kycStatus !== 'VERIFIED') {
    res.status(403).json({
      success: false,
      error: { code: 'KYC_REQUIRED', message: 'KYC verification is required before initiating withdrawals.' },
    });
    return;
  }

  // 3. Method Specific Validation
  if (payoutMode === 'USDT_WALLET') {
    if (!beneficiaryDetails.usdtAddress || !/^0x[a-fA-F0-9]{40}$/.test(beneficiaryDetails.usdtAddress)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_USDT_ADDRESS', message: 'A valid EVM USDT wallet address (0x... 40 hex characters) is required.' },
      });
      return;
    }
    if (beneficiaryDetails.network && beneficiaryDetails.network !== 'BEP20') {
      res.status(400).json({
        success: false,
        error: { code: 'UNSUPPORTED_NETWORK', message: 'Only BEP20 network is supported for USDT withdrawals.' },
      });
      return;
    }
    beneficiaryDetails.network = 'BEP20';
  } else if (payoutMode === 'BANK_ACCOUNT' || payoutMode === 'BANK_TRANSFER') {
    if (!beneficiaryDetails.accountHolderName || beneficiaryDetails.accountHolderName.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Account holder name is required (min 2 characters).' },
      });
      return;
    }
    if (!beneficiaryDetails.accountNumber || beneficiaryDetails.accountNumber.trim().length < 6) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ACCOUNT_NUMBER', message: 'Valid bank account number is required (min 6 characters).' },
      });
      return;
    }
    if (!beneficiaryDetails.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(beneficiaryDetails.ifscCode.toUpperCase())) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_IFSC', message: 'Valid 11-character IFSC code is required (e.g. SBIN0001234).' },
      });
      return;
    }
    beneficiaryDetails.ifscCode = beneficiaryDetails.ifscCode.toUpperCase();
  }

  // Determine points and paise
  let points = rawPoints || (rawPaise ? Math.floor(rawPaise / 10) : 1000);

  // For payment methods supporting cents only, redeem whole 10-point units and leave remainder available
  const centOnlyMethods = ['BANK_ACCOUNT', 'BANK_TRANSFER', 'UPI', 'USD_ACCOUNT'];
  let remainderPoints = 0;
  if (centOnlyMethods.includes(payoutMode) && points % 10 !== 0) {
    remainderPoints = points % 10;
    points = Math.floor(points / 10) * 10;
  }

  if (points < 1000) {
    res.status(400).json({
      success: false,
      error: { code: 'BELOW_MINIMUM', message: 'Minimum withdrawal is 1,000 points ($1.00 USD).' },
    });
    return;
  }
  const usdAmount = Number((points * 0.001).toFixed(3));

  const session = await mongoose.startSession();
  try {
    let response: any;
    await session.withTransaction(async () => {
      // Serialize balance mutations per user so simultaneous withdrawals cannot overspend
      const updatedUser = await User.findOneAndUpdate(
        { _id: userId, status: 'ACTIVE' },
        { $inc: { walletMutationVersion: 1 } },
        { session, new: true }
      );
      if (!updatedUser) throw new Error('ACCOUNT_NOT_ACTIVE');

      const balance = await computeUserBalance(userId, session);
      if (balance.availablePoints < points) throw new Error('INSUFFICIENT_BALANCE');

      const [withdrawal] = await WithdrawalRequest.create(
        [
          {
            userId,
            amountPaise: 0,
            pointsAmount: points,
            usdAmount,
            feePaise: 0,
            netAmountPaise: 0,
            payoutMode,
            currency: 'USD',
            payoutMinor: Math.round(usdAmount * 100), // USD cents ($5.00 = 500 cents)
            status: 'REQUESTED',
            beneficiaryDetails,
            idempotencyKey: parsed.data.idempotencyKey ? `${userId}:${parsed.data.idempotencyKey}` : undefined,
          },
        ],
        { session }
      );

      await WalletLedgerEntry.create(
        [
          {
            userId,
            entryType: 'WITHDRAWAL_HOLD',
            amountPaise: 0,
            pointsEquivalent: -points,
            status: 'PENDING',
            balanceBeforePaise: 0,
            balanceAfterPaise: 0,
            referenceEntity: 'WithdrawalRequest',
            referenceId: withdrawal._id,
            idempotencyKey: `withdrawal-hold-${withdrawal._id}`,
            notes: `Payout requested via ${payoutMode} (${points.toLocaleString()} pts = $${usdAmount.toFixed(3)}); awaiting review`,
            metadata: {
              points,
              usd: usdAmount,
              currency: 'USD',
            },
          },
        ],
        { session }
      );

      response = {
        withdrawal: {
          id: withdrawal._id.toString(),
          pointsAmount: points,
          usdAmount,
          currency: 'USD',
          payoutMode,
          status: withdrawal.status,
          beneficiaryDetails: withdrawal.beneficiaryDetails,
          createdAt: withdrawal.createdAt,
        },
        redeemedPoints: points,
        remainderPoints,
        remainderUsd: Number((remainderPoints * 0.001).toFixed(3)),
        remainingPoints: balance.availablePoints - points,
        remainingUsd: Number(((balance.availablePoints - points) * 0.001).toFixed(3)),
      };
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal requested. Awaiting administrator review.',
      data: response,
    });
  } catch (err: any) {
    logger.error({ err }, 'Withdrawal request failed');
    const messages: Record<string, string> = {
      INSUFFICIENT_BALANCE: 'Insufficient available points balance.',
      KYC_REQUIRED: 'Complete KYC verification before withdrawing.',
      ACCOUNT_NOT_ACTIVE: 'Account is not active.',
    };
    res.status(err.code === 11000 ? 409 : messages[err.message] ? 400 : 500).json({
      success: false,
      error: {
        message:
          err.code === 11000
            ? 'This withdrawal request has already been submitted. Refresh your wallet.'
            : messages[err.message] || 'Withdrawal was not submitted. Please retry.',
      },
    });
  } finally {
    await session.endSession();
  }
}

/**
 * POST /api/users/kyc
 * Submits user identity details for compliance review.
 */
export async function submitKyc(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const { panNumber, aadhaarLast4, bankAccount, ifscCode, accountHolderName } = req.body;

  if (
    !panNumber ||
    typeof panNumber !== 'string' ||
    !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase())
  ) {
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
      kycStatus: 'VERIFIED',
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
 */
export async function deleteUserAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!._id;
  const { confirmation } = req.body;

  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    res.status(400).json({
      success: false,
      error: { code: 'CONFIRMATION_REQUIRED', message: 'Explicit confirmation required' },
    });
    return;
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    user.status = 'SUSPENDED';
    user.name = `Deleted User ${user._id.toString().slice(-4)}`;
    user.email = `deleted_${user._id}@deleted.invalid`;
    user.mobile = `DEL${user._id.toString().slice(-8)}`;
    await user.save();

    await AuthSession.updateMany({ userId }, { $set: { isValid: false, revokedAt: new Date() } });

    res.status(200).json({
      success: true,
      message: 'Account marked deleted and personal data anonymized.',
    });
  } catch (err: any) {
    logger.error('Failed to delete user account:', err);
    res.status(500).json({
      success: false,
      error: { code: 'ACCOUNT_DELETE_ERROR', message: 'Failed to process account deletion' },
    });
  }
}

/**
 * GET /api/admin/withdrawals
 * Admin portal: List earner withdrawal queue with Points & USD breakdown.
 */
export async function adminListWithdrawals(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  try {
    const filter: any = {};
    if (req.query.status && req.query.status !== 'ALL') {
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

    const formatted = withdrawals.map((w) => {
      const points = w.pointsAmount || Math.floor(w.amountPaise / 10);
      const usd = w.usdAmount || Number((points * 0.001).toFixed(2));

      return {
        id: w._id.toString(),
        user: w.userId,
        pointsAmount: points,
        usdAmount: usd,
        amountPaise: w.amountPaise,
        amountRupees: Number((w.amountPaise / 100).toFixed(2)),
        payoutMode: w.payoutMode,
        currency: w.currency || 'USD',
        payoutMinor: w.payoutMinor ?? Math.round(usd * 100),
        payoutReference: w.payoutReference,
        beneficiaryDetails: w.beneficiaryDetails,
        status: w.status,
        adminReviewNotes: w.adminReviewNotes,
        createdAt: w.createdAt,
      };
    });

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
 * Admin portal: Approve (mark PAID with reference) or Reject withdrawal (reversing hold to available points).
 */
export async function adminReviewWithdrawal(req: AuthenticatedRequest, res: Response): Promise<void> {
  const input = z
    .object({
      status: z.enum(['PAID', 'PROCESSING', 'REJECTED']),
      adminReviewNotes: z.string().trim().min(5).max(1000),
      payoutReference: z.string().trim().max(200).optional(),
    })
    .safeParse(req.body);

  if (
    !Types.ObjectId.isValid(req.params.id) ||
    !input.success ||
    (input.data.status === 'PAID' && (input.data.payoutReference?.length || 0) < 5)
  ) {
    res.status(400).json({
      success: false,
      error: {
        message:
          'Enter a valid decision, review notes (minimum 5 characters), and a real payment reference (transaction hash or bank UTR, minimum 5 characters) when marking PAID.',
      },
    });
    return;
  }

  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => {
      const w = await WithdrawalRequest.findOne({
        _id: req.params.id,
        status: { $in: ['REQUESTED', 'UNDER_REVIEW', 'PROCESSING'] },
      }).session(session);
      if (!w) throw new Error('ALREADY_FINALIZED');

      await User.updateOne({ _id: w.userId }, { $inc: { walletMutationVersion: 1 } }, { session });
      const { status, adminReviewNotes, payoutReference } = input.data;

      if (status !== 'PROCESSING') {
        const hold = await WalletLedgerEntry.findOneAndUpdate(
          { referenceEntity: 'WithdrawalRequest', referenceId: w._id, entryType: 'WITHDRAWAL_HOLD', status: 'PENDING' },
          {
            $set:
              status === 'PAID'
                ? { status: 'CONFIRMED', entryType: 'WITHDRAWAL_PAID' }
                : { status: 'REVERSED' },
          },
          { session, new: true }
        );
        if (!hold) throw new Error('HOLD_NOT_FOUND');
      }

      w.status = status;
      w.adminReviewNotes = adminReviewNotes;
      w.reviewedBy = req.user!._id;
      if (status === 'PAID') {
        w.payoutReference = payoutReference;
        w.processedAt = new Date();
      }
      await w.save({ session });

      await AdminAuditLog.create(
        [
          {
            adminId: req.user!._id,
            action: `PAYOUT_${status}`,
            targetEntity: 'WithdrawalRequest',
            targetId: w._id.toString(),
            details: input.data,
            ipAddress: req.ip || 'unknown',
          },
        ],
        { session }
      );

      result = { id: w._id.toString(), status: w.status, payoutReference: w.payoutReference };
    });

    res.json({ success: true, data: { withdrawal: result } });
  } catch (err: any) {
    logger.error({ err }, 'Withdrawal review failed');
    res.status(err.message === 'ALREADY_FINALIZED' ? 409 : 500).json({
      success: false,
      error: {
        message:
          err.message === 'ALREADY_FINALIZED'
            ? 'This withdrawal is already finalized or unavailable.'
            : 'Review was not saved. Refresh and retry.',
      },
    });
  } finally {
    await session.endSession();
  }
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
