import { Request, Response } from 'express';
import { ShoppingMerchant } from '../models/ShoppingMerchant';
import { CashbackClaim } from '../models/CashbackClaim';
import { WalletLedgerEntry } from '../models/WalletLedgerEntry';
import { pointsToUsd, pointsToPaise } from '@adpayon/shared';
import mongoose from 'mongoose';

// User / Public: List active shopping merchants
export async function getActiveMerchants(req: Request, res: Response): Promise<void> {
  try {
    const merchants = await ShoppingMerchant.find({ isActive: true }).sort({ displayOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: merchants.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        logoUrl: m.logoUrl,
        description: m.description,
        destinationUrl: m.destinationUrl,
        cashbackTerms: m.cashbackTerms,
        featuredBadge: m.featuredBadge,
        displayOrder: m.displayOrder,
        isActive: m.isActive,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// User: Submit a cashback purchase claim with proof screenshot
export async function submitCashbackClaim(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const { merchantId, orderId, orderAmount, currency, claimedPoints, proofFileId, proofUrl, notes } = req.body;

    if (!merchantId || !orderId || !orderAmount || !claimedPoints) {
      res.status(400).json({
        success: false,
        error: { message: 'merchantId, orderId, orderAmount, and claimedPoints are required.' },
      });
      return;
    }

    if (!proofFileId && !proofUrl) {
      res.status(400).json({
        success: false,
        error: { code: 'PROOF_REQUIRED', message: 'Screenshot evidence is mandatory. Please attach valid proof before submitting.' },
      });
      return;
    }

    const merchant = await ShoppingMerchant.findById(merchantId);
    if (!merchant || !merchant.isActive) {
      res.status(404).json({ success: false, error: { message: 'Merchant not found or inactive.' } });
      return;
    }

    // Check duplicate orderId
    const existing = await CashbackClaim.findOne({ userId, merchantId, orderId: orderId.trim() });
    if (existing) {
      res.status(409).json({
        success: false,
        error: { message: 'A cashback claim for this order ID has already been submitted.' },
      });
      return;
    }

    const claim = new CashbackClaim({
      userId,
      merchantId,
      orderId: orderId.trim(),
      orderAmount: Number(orderAmount),
      currency: currency || 'USD',
      claimedPoints: Math.round(Number(claimedPoints)),
      proofFileId: proofFileId ? proofFileId.trim() : undefined,
      proofUrl: proofUrl ? proofUrl.trim() : undefined,
      notes: notes ? notes.trim() : undefined,
      status: 'PENDING',
    });
    await claim.save();

    res.status(201).json({
      success: true,
      data: {
        id: claim._id.toString(),
        merchantName: merchant.name,
        orderId: claim.orderId,
        orderAmount: claim.orderAmount,
        claimedPoints: claim.claimedPoints,
        status: claim.status,
        createdAt: claim.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: { message: 'A cashback claim for this order ID has already been submitted.' },
      });
      return;
    }
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to submit cashback claim' } });
  }
}

// User: Get personal cashback claims history
export async function getUserCashbackClaims(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const claims = await CashbackClaim.find({ userId })
      .populate('merchantId', 'name logoUrl')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: claims.map((c: any) => ({
        id: c._id.toString(),
        merchantId: c.merchantId?._id?.toString() || '',
        merchantName: c.merchantId?.name || 'Partner Merchant',
        merchantLogo: c.merchantId?.logoUrl || '',
        orderId: c.orderId,
        orderAmount: c.orderAmount,
        currency: c.currency,
        claimedPoints: c.claimedPoints,
        approvedPoints: c.approvedPoints,
        proofFileId: c.proofFileId,
        proofUrl: c.proofUrl,
        notes: c.notes,
        status: c.status,
        rejectionReason: c.rejectionReason,
        adminReviewNotes: c.adminReviewNotes,
        reviewedAt: c.reviewedAt?.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: List all merchants
export async function adminListMerchants(req: Request, res: Response): Promise<void> {
  try {
    const merchants = await ShoppingMerchant.find().sort({ displayOrder: 1, createdAt: -1 });
    res.json({
      success: true,
      data: merchants.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        logoUrl: m.logoUrl,
        description: m.description,
        destinationUrl: m.destinationUrl,
        cashbackTerms: m.cashbackTerms,
        featuredBadge: m.featuredBadge,
        displayOrder: m.displayOrder,
        isActive: m.isActive,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Create merchant
export async function adminCreateMerchant(req: Request, res: Response): Promise<void> {
  try {
    const { name, logoUrl, description, destinationUrl, cashbackTerms, featuredBadge, displayOrder, isActive } = req.body;
    if (!name || !logoUrl || !destinationUrl || !cashbackTerms) {
      res.status(400).json({
        success: false,
        error: { message: 'name, logoUrl, destinationUrl, and cashbackTerms are required.' },
      });
      return;
    }

    const merchant = new ShoppingMerchant({
      name,
      logoUrl,
      description: description || '',
      destinationUrl,
      cashbackTerms,
      featuredBadge: featuredBadge || undefined,
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });
    await merchant.save();

    res.status(201).json({ success: true, data: merchant });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Update merchant
export async function adminUpdateMerchant(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const merchant = await ShoppingMerchant.findById(id);
    if (!merchant) {
      res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
      return;
    }

    const { name, logoUrl, description, destinationUrl, cashbackTerms, featuredBadge, displayOrder, isActive } = req.body;
    if (name !== undefined) merchant.name = name;
    if (logoUrl !== undefined) merchant.logoUrl = logoUrl;
    if (description !== undefined) merchant.description = description;
    if (destinationUrl !== undefined) merchant.destinationUrl = destinationUrl;
    if (cashbackTerms !== undefined) merchant.cashbackTerms = cashbackTerms;
    if (featuredBadge !== undefined) merchant.featuredBadge = featuredBadge;
    if (displayOrder !== undefined) merchant.displayOrder = Number(displayOrder);
    if (isActive !== undefined) merchant.isActive = Boolean(isActive);

    await merchant.save();
    res.json({ success: true, data: merchant });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Delete merchant
export async function adminDeleteMerchant(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await ShoppingMerchant.findByIdAndDelete(id);
    res.json({ success: true, message: 'Merchant deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: List cashback claims queue
export async function adminListCashbackClaims(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.query;
    const filter: any = {};
    if (status && status !== 'ALL') {
      filter.status = status;
    }

    const claims = await CashbackClaim.find(filter)
      .populate('userId', 'name mobile email')
      .populate('merchantId', 'name logoUrl')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: claims.map((c: any) => ({
        id: c._id.toString(),
        userId: c.userId?._id?.toString() || '',
        userName: c.userId?.name || 'User',
        userMobile: c.userId?.mobile || '',
        merchantId: c.merchantId?._id?.toString() || '',
        merchantName: c.merchantId?.name || 'Partner',
        merchantLogo: c.merchantId?.logoUrl || '',
        orderId: c.orderId,
        orderAmount: c.orderAmount,
        currency: c.currency,
        claimedPoints: c.claimedPoints,
        approvedPoints: c.approvedPoints,
        proofFileId: c.proofFileId,
        proofUrl: c.proofUrl,
        notes: c.notes,
        status: c.status,
        rejectionReason: c.rejectionReason,
        adminReviewNotes: c.adminReviewNotes,
        reviewedAt: c.reviewedAt?.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Review cashback claim (Approve with transactional credit / Reject with reason)
export async function adminReviewCashbackClaim(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = (req as any).admin?.id || (req as any).admin?._id;
    const { id } = req.params;
    const { decision, approvedPoints, rejectionReason, adminNotes } = req.body;

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Decision must be APPROVE or REJECT' } });
      return;
    }

    const claim = await CashbackClaim.findById(id).session(session);
    if (!claim) {
      await session.abortTransaction();
      res.status(404).json({ success: false, error: { message: 'Claim not found' } });
      return;
    }

    if (claim.status !== 'PENDING') {
      await session.abortTransaction();
      res.status(409).json({ success: false, error: { message: `Claim is already ${claim.status}. Cannot re-review.` } });
      return;
    }

    if (decision === 'REJECT') {
      if (!rejectionReason || rejectionReason.trim().length < 5) {
        await session.abortTransaction();
        res.status(400).json({
          success: false,
          error: { message: 'A rejection reason of at least 5 characters is required.' },
        });
        return;
      }

      claim.status = 'REJECTED';
      claim.rejectionReason = rejectionReason.trim();
      claim.adminReviewNotes = adminNotes ? adminNotes.trim() : undefined;
      claim.reviewedBy = adminId;
      claim.reviewedAt = new Date();
      await claim.save({ session });

      await session.commitTransaction();
      res.json({ success: true, data: { status: 'REJECTED', message: 'Cashback claim rejected.' } });
      return;
    }

    // APPROVE
    const finalPoints = Number(approvedPoints) > 0 ? Math.round(Number(approvedPoints)) : claim.claimedPoints;
    const usdValue = pointsToUsd(finalPoints);

    claim.status = 'APPROVED';
    claim.approvedPoints = finalPoints;
    claim.adminReviewNotes = adminNotes ? adminNotes.trim() : undefined;
    claim.reviewedBy = adminId;
    claim.reviewedAt = new Date();
    await claim.save({ session });

    // Transactionally credit ledger
    const amountPaise = pointsToPaise(finalPoints);
    const idempotencyKey = `CASHBACK_${claim._id.toString()}`;
    const ledger = new WalletLedgerEntry({
      userId: claim.userId,
      entryType: 'TASK_REWARD',
      amountPaise,
      pointsEquivalent: finalPoints,
      status: 'CONFIRMED',
      idempotencyKey,
      notes: `Shopping Cashback Approved for Order #${claim.orderId} (+${finalPoints} pts)`,
      metadata: {
        activity: 'SHOPPING_CASHBACK',
        claimId: claim._id.toString(),
        orderId: claim.orderId,
        rewardPolicy: 'REDEEMABLE_V1',
        points: finalPoints,
        usd: usdValue,
        description: `Shopping Cashback Approved for Order #${claim.orderId} (+${finalPoints} pts)`,
      },
    });
    await ledger.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        status: 'APPROVED',
        approvedPoints: finalPoints,
        usdValue,
        message: `Cashback claim approved! +${finalPoints} points ($${usdValue.toFixed(3)} USD) credited.`,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message || 'Review failed' } });
  } finally {
    session.endSession();
  }
}

