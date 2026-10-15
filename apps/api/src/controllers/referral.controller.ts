import { Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User, IUser } from '../models';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logger } from '../config/logger';

/**
 * Masks Indian mobile numbers for downline privacy (e.g. +91 98****3210).
 */
export function maskMobile(rawMobile: string): string {
  if (!rawMobile) return '**********';
  const clean = rawMobile.replace(/\D/g, '');
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 2)}****${clean.slice(6)}`;
  }
  if (clean.length === 12 && clean.startsWith('91')) {
    const local = clean.slice(2);
    return `+91 ${local.slice(0, 2)}****${local.slice(6)}`;
  }
  return rawMobile.slice(0, 4) + '****' + rawMobile.slice(-2);
}

/**
 * Formats name for downline privacy (e.g. "Rahul S.").
 */
export function maskName(name: string): string {
  if (!name) return 'Member';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/**
 * GET /api/referrals/summary
 * Returns direct referral counts, total downline counts, referral code, and sponsor details.
 */
export async function getReferralSummary(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    return;
  }

  const userId = req.user._id;
  const currentUser = await User.findById(userId);

  if (!currentUser) {
    res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User record not found.' },
    });
    return;
  }

  // Consistent counting:
  // directCount: all registered direct referrals
  // activeDirectCount: verified active direct referrals
  // totalDownlineCount: all registered downstream nodes across all levels
  // activeDownlineCount: verified active downstream nodes
  const [directCount, activeDirectCount, totalDownlineCount, activeDownlineCount] =
    await Promise.all([
      User.countDocuments({ sponsorId: userId }),
      User.countDocuments({ sponsorId: userId, status: 'ACTIVE' }),
      User.countDocuments({ ancestors: userId }),
      User.countDocuments({ ancestors: userId, status: 'ACTIVE' }),
    ]);

  let sponsorData = null;
  if (currentUser.sponsorId) {
    const sponsor = await User.findById(currentUser.sponsorId).select(
      'name referralCode mobile'
    );
    if (sponsor) {
      sponsorData = {
        name: sponsor.name,
        referralCode: sponsor.referralCode,
        mobileMasked: maskMobile(sponsor.mobile),
      };
    }
  }

  res.status(200).json({
    success: true,
    data: {
      directCount,
      activeDirectCount,
      totalDownlineCount,
      activeDownlineCount,
      referralCode: currentUser.referralCode,
      sponsor: sponsorData,
    },
  });
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ALL', 'ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED']).default('ALL'),
});

/**
 * GET /api/referrals/directs
 * Returns paginated direct referrals (Level 1) with privacy masking.
 */
export async function getDirectReferrals(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    return;
  }

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { page, limit, status } = parsed.data;
  const userId = req.user._id;

  const filter: any = { sponsorId: userId };
  if (status !== 'ALL') {
    filter.status = status;
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('name mobile referralCode status directReferralsCount createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const items = users.map((u) => ({
    id: u._id.toString(),
    name: maskName(u.name),
    referralCode: u.referralCode,
    mobileMasked: maskMobile(u.mobile),
    level: 1,
    status: u.status,
    isActive: u.status === 'ACTIVE',
    directReferralsCount: u.directReferralsCount || 0,
    hasChildren: (u.directReferralsCount || 0) > 0,
    joinedAt: u.createdAt,
  }));

  res.status(200).json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
}

const treeQuerySchema = z.object({
  nodeId: z.string().trim().optional(),
});

/**
 * GET /api/referrals/tree
 * Returns dynamic, lazy-expandable single-level children for a node in the user's subtree.
 * Strictly enforces subtree authorization: A user can NEVER query nodes outside their downstream tree.
 */
export async function getTreeChildren(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    return;
  }

  const parsed = treeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const requesterId = req.user._id;
  const targetNodeIdStr = parsed.data.nodeId || requesterId.toString();

  if (!Types.ObjectId.isValid(targetNodeIdStr)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_NODE_ID', message: 'Target node ID is not a valid ObjectId.' },
    });
    return;
  }

  const targetNodeId = new Types.ObjectId(targetNodeIdStr);
  const requester = await User.findById(requesterId);
  if (!requester) {
    res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User record not found.' },
    });
    return;
  }

  // 1. Multi-Tenant Authorization Check
  // Allowed IF: targetNode is the requester OR requester is in targetNode's ancestors
  if (!targetNodeId.equals(requesterId)) {
    const targetNode = await User.findById(targetNodeId).select('ancestors');
    if (!targetNode) {
      res.status(404).json({
        success: false,
        error: { code: 'NODE_NOT_FOUND', message: 'Requested tree node was not found.' },
      });
      return;
    }

    const isDescendant = (targetNode.ancestors || []).some((a) => a.equals(requesterId));
    if (!isDescendant) {
      logger.warn(
        { requesterId: requesterId.toString(), targetNodeId: targetNodeId.toString() },
        'SECURITY ALERT: Unauthorized attempt to access referral subtree'
      );
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_SUBTREE',
          message: 'You are not authorized to view this referral branch.',
        },
      });
      return;
    }
  }

  // 2. Fetch children of targetNode
  const children = await User.find({ sponsorId: targetNodeId })
    .select('name mobile referralCode status directReferralsCount ancestors createdAt')
    .sort({ createdAt: -1 })
    .limit(100) // Guard against unbounded memory consumption
    .lean();

  const requesterAncestorsLength = requester.ancestors ? requester.ancestors.length : 0;

  const mappedChildren = children.map((c) => {
    // Relative level from the requesting user's perspective
    const relativeLevel = c.ancestors
      ? c.ancestors.length - requesterAncestorsLength
      : 1;

    return {
      id: c._id.toString(),
      name: maskName(c.name),
      referralCode: c.referralCode,
      mobileMasked: maskMobile(c.mobile),
      level: relativeLevel,
      status: c.status,
      isActive: c.status === 'ACTIVE',
      directReferralsCount: c.directReferralsCount || 0,
      totalDownlineCount: 0,
      hasChildren: (c.directReferralsCount || 0) > 0,
      joinedAt: c.createdAt,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      nodeId: targetNodeId.toString(),
      children: mappedChildren,
    },
  });
}

/**
 * GET /api/referrals/downline
 * Returns paginated full downline across all levels with optional level filtering.
 */
export async function getDownline(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    return;
  }

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { page, limit, status } = parsed.data;
  const userId = req.user._id;
  const requester = await User.findById(userId);

  if (!requester) {
    res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User record not found.' },
    });
    return;
  }

  const filter: any = { ancestors: userId };
  if (status !== 'ALL') {
    filter.status = status;
  }

  const requesterAncestorsLength = requester.ancestors ? requester.ancestors.length : 0;

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('name mobile referralCode status directReferralsCount ancestors createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const items = users.map((u) => {
    const relativeLevel = u.ancestors
      ? u.ancestors.length - requesterAncestorsLength
      : 1;

    return {
      id: u._id.toString(),
      name: maskName(u.name),
      referralCode: u.referralCode,
      mobileMasked: maskMobile(u.mobile),
      level: relativeLevel,
      status: u.status,
      isActive: u.status === 'ACTIVE',
      directReferralsCount: u.directReferralsCount || 0,
      hasChildren: (u.directReferralsCount || 0) > 0,
      joinedAt: u.createdAt,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
}
