import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../services/tokenService';
import { User, IUser } from '../models';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
  tokenPayload?: TokenPayload;
}

/**
 * Authentication middleware validating the Bearer JWT access token and
 * verifying that the user account is ACTIVE.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header' },
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Access token is invalid or expired' },
    });
    return;
  }

  const user = await User.findById(payload.userId);
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'Associated account does not exist' },
    });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_INACTIVE', message: `Account is currently ${user.status.toLowerCase()}` },
    });
    return;
  }

  req.user = user;
  req.tokenPayload = payload;
  next();
}

/**
 * Role-based authorization middleware.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permission to access this resource' },
      });
      return;
    }
    next();
  };
}
