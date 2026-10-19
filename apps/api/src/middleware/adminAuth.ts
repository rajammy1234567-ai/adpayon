import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, requireAuth } from './auth.middleware';
import { User } from '../models';

/**
 * Enforces strict ADMIN role verification against current database state.
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // First ensure standard authentication succeeded
  if (!req.user) {
    await requireAuth(req, res, async () => {
      await verifyAdminRole(req, res, next);
    });
    return;
  }

  await verifyAdminRole(req, res, next);
}

async function verifyAdminRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  // Re-verify against current database state
  const freshUser = await User.findById(req.user._id);
  if (!freshUser || freshUser.status !== 'ACTIVE' || freshUser.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_ADMIN_ONLY',
        message: 'Administrative privileges required for this action',
      },
    });
    return;
  }

  req.user = freshUser;
  next();
}
