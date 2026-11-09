import { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { Offer, WalletLedgerEntry, User, AdminAuditLog } from '../models';
import { OfferSubmission } from '../models/OfferSubmission';
import { pointsToPaise, DEFAULT_COMMISSION_CONFIG } from '@adpayon/shared';
import { getProofFromGridFS } from '../services/storage/proofStorage';
import { logger } from '../config/logger';

export const submissionSchema = z.object({
  notes: z.string().trim().min(5).max(2000),
  proofFileId: z.string().optional(),
  proofUrl: z.string().trim().max(500).optional(),
  completionCode: z.string().trim().max(200).optional(),
});

export async function submitOffer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = submissionSchema.safeParse(req.body);
  if (!Types.ObjectId.isValid(req.params.id) || !parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Enter valid completion details (at least 5 characters).' },
    });
    return;
  }

  try {
    const offer = await Offer.findOne({
      _id: req.params.id,
      status: 'PUBLISHED',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!offer) {
      res.status(404).json({ success: false, error: { message: 'This offer is no longer available.' } });
      return;
    }

    // Server-side proof validation: Must exist in durable GridFS and belong to user
    let proofFileId = parsed.data.proofFileId;
    let proofUrl = parsed.data.proofUrl;

    if (proofFileId) {
      const proof = await getProofFromGridFS(proofFileId);
      if (!proof || proof.metadata?.userId !== req.user!._id.toString()) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PROOF', message: 'Uploaded screenshot proof not found or unauthorized.' },
        });
        return;
      }
      proofUrl = `/api/uploads/proof/${proofFileId}`;
    } else if (proofUrl && proofUrl.startsWith('/api/uploads/proof/')) {
      const extractedId = proofUrl.replace('/api/uploads/proof/', '').trim();
      const proof = await getProofFromGridFS(extractedId);
      if (!proof || proof.metadata?.userId !== req.user!._id.toString()) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PROOF', message: 'Uploaded screenshot proof not found or unauthorized.' },
        });
        return;
      }
      proofFileId = extractedId;
    }

    if (!proofFileId && !proofUrl) {
      res.status(400).json({
        success: false,
        error: { code: 'PROOF_REQUIRED', message: 'Screenshot evidence is mandatory. Please attach valid proof before submitting.' },
      });
      return;
    }

    if (offer.completionConditions.completionCodeRequired && !parsed.data.completionCode) {
      res.status(400).json({
        success: false,
        error: { code: 'CODE_REQUIRED', message: 'A partner reference code is required.' },
      });
      return;
    }

    const legacyCredit = await WalletLedgerEntry.exists({
      idempotencyKey: `offer-reward-${offer._id}-${req.user!._id}`,
    });
    if (legacyCredit) {
      res.status(409).json({
        success: false,
        error: { message: 'This account has already received this offer reward.' },
      });
      return;
    }

    const submissionData = {
      notes: parsed.data.notes,
      proofFileId,
      proofUrl,
      completionCode: parsed.data.completionCode,
    };

    // Rejected submissions can be corrected and resubmitted; pending/approved cannot be overwritten.
    let submission = await OfferSubmission.findOneAndUpdate(
      { offerId: offer._id, userId: req.user!._id, status: 'REJECTED' },
      {
        $set: {
          ...submissionData,
          status: 'PENDING',
          reviewNotes: '',
          rewardPoints: offer.rewardPoints,
        },
        $unset: { reviewedAt: 1, reviewedBy: 1 },
      },
      { new: true }
    );

    if (!submission) {
      submission = await OfferSubmission.create({
        ...submissionData,
        offerId: offer._id,
        userId: req.user!._id,
        rewardPoints: offer.rewardPoints,
      });
    }

    res.status(201).json({
      success: true,
      data: { id: submission._id, status: submission.status },
      message: 'Submitted for review. No points have been credited yet.',
    });
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({
        success: false,
        error: { message: 'This offer already has a pending or approved submission.' },
      });
      return;
    }
    logger.error({ err }, 'Offer submission failed');
    res.status(500).json({
      success: false,
      error: { message: 'Submission could not be saved. Please retry.' },
    });
  }
}

export async function listOfferSubmissions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const filter: { status?: 'PENDING' | 'APPROVED' | 'REJECTED' } = ['PENDING', 'APPROVED', 'REJECTED'].includes(
      String(req.query.status)
    )
      ? { status: String(req.query.status) as 'PENDING' | 'APPROVED' | 'REJECTED' }
      : {};

    const [items, total] = await Promise.all([
      OfferSubmission.find(filter)
        .populate('offerId', 'title description')
        .populate('userId', 'name referralCode mobile')
        .sort({ createdAt: -1 })
        .skip((page - 1) * 30)
        .limit(30)
        .lean(),
      OfferSubmission.countDocuments(filter),
    ]);

    const formatted = items.map((s) => ({
      _id: s._id.toString(),
      offerId: s.offerId,
      userId: s.userId,
      status: s.status,
      rewardPoints: s.rewardPoints,
      usdValue: Number((s.rewardPoints * 0.001).toFixed(3)),
      notes: s.notes,
      proofFileId: s.proofFileId,
      proofUrl: s.proofUrl,
      completionCode: s.completionCode,
      reviewNotes: s.reviewNotes,
      createdAt: (s as any).createdAt,
    }));

    res.json({
      success: true,
      data: {
        items: formatted,
        pagination: { page, total, totalPages: Math.max(1, Math.ceil(total / 30)) },
      },
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Unable to load submissions.' } });
  }
}

export async function reviewOfferSubmission(req: AuthenticatedRequest, res: Response): Promise<void> {
  const parsed = z
    .object({
      status: z.enum(['APPROVED', 'REJECTED']),
      reviewNotes: z.string().trim().min(5).max(2000),
    })
    .safeParse(req.body);

  if (!parsed.success || !Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({
      success: false,
      error: { message: 'A valid decision and verification notes (min 5 characters) are required.' },
    });
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sub = await OfferSubmission.findOne({ _id: req.params.id, status: 'PENDING' }).session(session);
      if (!sub) throw new Error('ALREADY_REVIEWED');

      const user = await User.findOneAndUpdate(
        { _id: sub.userId, status: 'ACTIVE' },
        { $inc: { walletMutationVersion: 1 } },
        { session, new: true }
      );
      if (!user) throw new Error('ACCOUNT_UNAVAILABLE');

      if (parsed.data.status === 'APPROVED') {
        const offer = await Offer.findById(sub.offerId).session(session);
        if (!offer) throw new Error('OFFER_UNAVAILABLE');

        const idempotencyKey = `offer-reward-${offer._id}-${user._id}`;

        await WalletLedgerEntry.create(
          [
            {
              userId: user._id,
              entryType: 'TASK_REWARD',
              amountPaise: 0,
              pointsEquivalent: sub.rewardPoints,
              status: 'CONFIRMED',
              referenceEntity: 'Offer',
              referenceId: offer._id,
              idempotencyKey,
              notes: `Verified offer reward: ${offer.title}`,
              metadata: {
                rewardPolicy: 'REDEEMABLE_V1',
                currency: 'USD',
                points: sub.rewardPoints,
                usd: sub.rewardPoints * 0.001,
                submissionId: sub._id.toString(),
                reviewedBy: req.user!._id.toString(),
              },
            },
          ],
          { session }
        );

        // Preserve referral commission rules: only verified conversions generate commissions.
        const ancestors = [...(user.ancestors || [])].reverse();
        for (let level = 1; level <= Math.min(8, ancestors.length); level++) {
          const slab = DEFAULT_COMMISSION_CONFIG.levelIncome.slabs.find((s) => s.level === level);
          if (!slab) continue;
          const commissionPoints = Math.floor((sub.rewardPoints * slab.percentage) / 100);
          if (commissionPoints <= 0) continue;

          await WalletLedgerEntry.create(
            [
              {
                userId: ancestors[level - 1],
                entryType: 'REFERRAL_COMMISSION',
                amountPaise: 0,
                pointsEquivalent: commissionPoints,
                status: 'CONFIRMED',
                referenceEntity: 'Offer',
                referenceId: offer._id,
                idempotencyKey: `ref-comm-Offer-${offer._id}-src-${user._id}-anc-${ancestors[level - 1]}-lvl-${level}`,
                notes: `Level ${level} verified offer commission`,
                metadata: {
                  sourceUserId: user._id.toString(),
                  level,
                  percentage: slab.percentage,
                  rewardPolicy: 'REDEEMABLE_V1',
                  currency: 'USD',
                  points: commissionPoints,
                  usd: commissionPoints * 0.001,
                },
              },
            ],
            { session }
          );
        }

        await Offer.updateOne({ _id: offer._id }, { $inc: { completionsCount: 1 } }, { session });
      }

      sub.status = parsed.data.status;
      sub.reviewNotes = parsed.data.reviewNotes;
      sub.reviewedBy = req.user!._id;
      sub.reviewedAt = new Date();
      await sub.save({ session });

      await AdminAuditLog.create(
        [
          {
            adminId: req.user!._id,
            action: 'OFFER_SUBMISSION_REVIEW',
            targetEntity: 'OfferSubmission',
            targetId: sub._id.toString(),
            details: parsed.data,
            ipAddress: req.ip || 'unknown',
          },
        ],
        { session }
      );
    });

    res.json({
      success: true,
      message:
        parsed.data.status === 'APPROVED'
          ? 'Verified reward credited once.'
          : 'Submission rejected; no reward credited.',
    });
  } catch (err: any) {
    logger.error({ err }, 'Offer review failed');
    res.status(err.message === 'ALREADY_REVIEWED' || err.code === 11000 ? 409 : 500).json({
      success: false,
      error: {
        message:
          err.message === 'ALREADY_REVIEWED'
            ? 'This submission is no longer pending.'
            : 'Review was not committed. Refresh and retry.',
      },
    });
  } finally {
    await session.endSession();
  }
}

export async function getOfferActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, error: { message: 'Invalid offer ID.' } });
    return;
  }
  try {
    const userId = req.user!._id;
    const [submission, credits] = await Promise.all([
      OfferSubmission.findOne({ offerId: req.params.id, userId }).lean(),
      WalletLedgerEntry.find({
        userId,
        referenceEntity: 'Offer',
        referenceId: req.params.id,
        entryType: 'TASK_REWARD',
        status: 'CONFIRMED',
      }).lean(),
    ]);

    const totalEarnedPoints = credits
      .filter((e) => e.metadata?.rewardPolicy === 'REDEEMABLE_V1')
      .reduce((sum, e) => sum + (e.pointsEquivalent || 0), 0);

    res.json({
      success: true,
      data: {
        personalStats: {
          earningsPaise: credits
            .filter((e) => e.metadata?.rewardPolicy === 'REDEEMABLE_V1')
            .reduce((sum, e) => sum + e.amountPaise, 0),
          earningsPoints: totalEarnedPoints,
          earningsUsd: Number((totalEarnedPoints * 0.001).toFixed(3)),
          totalLeads: submission ? 1 : 0,
          totalSales: submission?.status === 'APPROVED' ? 1 : 0,
        },
        submission: submission
          ? {
              id: submission._id.toString(),
              status: submission.status,
              reviewNotes: submission.reviewNotes,
              proofUrl: submission.proofUrl,
              notes: submission.notes,
              completionCode: submission.completionCode,
            }
          : credits.length
          ? { id: '', status: 'LEGACY_CREDITED' }
          : null,
      },
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Unable to load your offer activity.' } });
  }
}
