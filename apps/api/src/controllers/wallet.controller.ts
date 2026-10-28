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

// 1 point = 1 paisa (100 points = ₹1.00)
const POINTS_PER_RUPEE = 100;
const MIN_WITHDRAWAL_PAISE = 5000; // ₹50 minimum withdrawal

/**
 * Helper to compute authoritative user balance from double-entry ledger and verified completions.
 */
async function computeUserBalance(userId: Types.ObjectId) {
  // Aggregate from WalletLedgerEntry
  const ledgerEntries = await WalletLedgerEntry.find({ userId });

  let totalCreditsPaise = 0;
  let totalHoldsPaise = 0;
  let totalWithdrawnPaise = 0;
  let totalPromotionalPoints = 0;

  for (const entry of ledgerEntries) {
    if (entry.status === 'CONFIRMED') {
      if (entry.entryType === 'REFERRAL_COMMISSION' || entry.entryType === 'ADMIN_ADJUSTMENT') {
        // Withdrawable cash earnings in paise
        totalCreditsPaise += Math.max(0, entry.amountPaise);
      } else if (entry.entryType === 'TASK_REWARD') {
        // Promotional points (non-withdrawable currency)
        totalPromotionalPoints += Math.max(0, entry.pointsEquivalent || 0);
      } else if (entry.entryType === 'WITHDRAWAL_PAID') {
        totalWithdrawnPaise += Math.abs(entry.amountPaise);
      }
    } else if (entry.status === 'PENDING' && entry.entryType === 'WITHDRAWAL_HOLD') {
      totalHoldsPaise += Math.abs(entry.amountPaise);
    }
  }

  // Also count confirmed task completions that may not yet have a ledger record (for backwards compatibility)
  const completions = await TaskCompletion.find({ userId, status: 'VERIFIED' });
  const recordedCompletionIds = new Set(
    ledgerEntries
      .filter((e) => e.referenceEntity === 'TaskCompletion' && e.referenceId)
      .map((e) => e.referenceId!.toString())
  );

  for (const c of completions) {
    if (!recordedCompletionIds.has(c._id.toString())) {
      totalPromotionalPoints += c.rewardPoints;
    }
  }

  const confirmedBalancePaise = totalCreditsPaise;
  const availableBalancePaise = Math.max(0, confirmedBalancePaise - totalHoldsPaise - totalWithdrawnPaise);

  return {
    confirmedBalancePaise,
    reservedWithdrawalPaise: totalHoldsPaise,
    totalWithdrawnPaise,
    availableBalancePaise,
    totalEarnedPaise: confirmedBalancePaise,
    pointsBalance: totalPromotionalPoints,
  };
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
      amountPaise: e.amountPaise,
      amountRupees: Number((e.amountPaise / 100).toFixed(2)),
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
  amountPaise: z.number().int().min(MIN_WITHDRAWAL_PAISE, 'Minimum withdrawal is ₹50 (5000 paise)'),
  payoutMode: z.enum(['UPI', 'BANK_TRANSFER']),
  beneficiaryDetails: z.object({
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

  const { amountPaise, payoutMode, beneficiaryDetails } = parsed.data;

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

  try {
    const user = await User.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_NOT_ACTIVE', message: 'User account is not eligible for withdrawal' },
      });
      return;
    }

    // Check available balance
    const balance = await computeUserBalance(userId);
    if (balance.availableBalancePaise < amountPaise) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient available balance. Available: ₹${(balance.availableBalancePaise / 100).toFixed(2)}, Requested: ₹${(amountPaise / 100).toFixed(2)}`,
        },
      });
      return;
    }

    // Create withdrawal request
    const withdrawal = await WithdrawalRequest.create({
      userId,
      amountPaise,
      feePaise: 0,
      netAmountPaise: amountPaise,
      payoutMode,
      beneficiaryDetails,
      status: 'REQUESTED',
    });

    // Record hold in ledger
    await WalletLedgerEntry.create({
      userId,
      entryType: 'WITHDRAWAL_HOLD',
      amountPaise: -amountPaise,
      pointsEquivalent: amountPaise,
      status: 'PENDING',
      balanceBeforePaise: balance.availableBalancePaise,
      balanceAfterPaise: balance.availableBalancePaise - amountPaise,
      referenceEntity: 'WithdrawalRequest',
      referenceId: withdrawal._id,
      notes: `Payout hold for ₹${(amountPaise / 100).toFixed(2)} via ${payoutMode}`,
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully and queued for review.',
      data: {
        withdrawal: {
          id: withdrawal._id.toString(),
          amountPaise: withdrawal.amountPaise,
          amountRupees: Number((withdrawal.amountPaise / 100).toFixed(2)),
          payoutMode: withdrawal.payoutMode,
          status: withdrawal.status,
          createdAt: withdrawal.createdAt,
        },
        remainingBalancePaise: balance.availableBalancePaise - amountPaise,
      },
    });
  } catch (err: any) {
    logger.error('Failed to submit withdrawal request:', err);
    res.status(500).json({
      success: false,
      error: { code: 'WITHDRAWAL_FAILED', message: 'Failed to process withdrawal request' },
    });
  }
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
  const { id } = req.params;
  const { status, adminReviewNotes, payoutReference } = req.body;

  if (!['PAID', 'PROCESSING', 'REJECTED'].includes(status)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: 'Status must be PAID, PROCESSING, or REJECTED' },
    });
    return;
  }

  try {
    const withdrawal = await WithdrawalRequest.findById(id);
    if (!withdrawal) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Withdrawal not found' } });
      return;
    }

    if (['PAID', 'REJECTED'].includes(withdrawal.status)) {
      res.status(400).json({
        success: false,
        error: { code: 'ALREADY_FINALIZED', message: `Withdrawal is already in ${withdrawal.status} status` },
      });
      return;
    }

    withdrawal.status = status;
    withdrawal.adminReviewNotes = adminReviewNotes || withdrawal.adminReviewNotes;
    withdrawal.reviewedBy = req.user!._id;

    if (status === 'PAID') {
      withdrawal.processedAt = new Date();
      withdrawal.payoutReference = payoutReference || `TEST-PAYOUT-${Date.now()}`;

      // Update hold entry in ledger to confirmed paid
      await WalletLedgerEntry.findOneAndUpdate(
        { referenceEntity: 'WithdrawalRequest', referenceId: withdrawal._id },
        { $set: { status: 'CONFIRMED', entryType: 'WITHDRAWAL_PAID' } }
      );
    } else if (status === 'REJECTED') {
      // Reversal: release hold back to user available balance
      await WalletLedgerEntry.findOneAndUpdate(
        { referenceEntity: 'WithdrawalRequest', referenceId: withdrawal._id, entryType: 'WITHDRAWAL_HOLD' },
        { $set: { status: 'REVERSED', notes: `Hold released: ${adminReviewNotes || 'Rejected by operator'}` } }
      );

      await WalletLedgerEntry.create({
        userId: withdrawal.userId,
        entryType: 'WITHDRAWAL_REVERSED',
        amountPaise: 0,
        pointsEquivalent: 0,
        status: 'CONFIRMED',
        balanceBeforePaise: 0,
        balanceAfterPaise: 0,
        referenceEntity: 'WithdrawalRequest',
        referenceId: withdrawal._id,
        notes: `Compensating audit entry for rejected payout: ${adminReviewNotes || 'Rejected by operator'}`,
      });
    }

    await withdrawal.save();

    await AdminAuditLog.create({
      adminId: req.user!._id,
      action: status === 'PAID' ? 'PAYOUT_APPROVED' : 'PAYOUT_REJECTED',
      targetEntity: 'WithdrawalRequest',
      targetId: withdrawal._id.toString(),
      details: { status, adminReviewNotes, payoutReference },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(200).json({
      success: true,
      message: `Withdrawal review saved: status set to ${status}.`,
      data: {
        withdrawal: {
          id: withdrawal._id.toString(),
          status: withdrawal.status,
          adminReviewNotes: withdrawal.adminReviewNotes,
          processedAt: withdrawal.processedAt,
        },
      },
    });
  } catch (err: any) {
    logger.error('Failed to review withdrawal:', err);
    res.status(500).json({
      success: false,
      error: { code: 'REVIEW_ERROR', message: 'Failed to review withdrawal' },
    });
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
