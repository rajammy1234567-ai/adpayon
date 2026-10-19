import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User, IUser, AdminAuditLog, AuthSecurityEvent } from '../models';
import { verifyPassword } from '../services/passwordService';
import { createAndSendOtp, verifyOtpChallenge } from '../services/otpService';
import { createAuthSession, revokeAuthSessionByToken } from '../services/tokenService';
import { normalizeIndianMobile, sanitizeUser } from './auth.controller';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { logger } from '../config/logger';

const adminLoginSchema = z.object({
  mobile: z.string().trim(),
  password: z.string().min(1, 'Password is required'),
});

const adminMfaVerifySchema = z.object({
  mfaSessionToken: z.string().trim().min(20, 'Valid MFA session token is required'),
  otp: z.string().trim().length(6, 'Verification code must be 6 digits'),
});

interface MfaChallengePayload {
  userId: string;
  role: string;
  purpose: 'ADMIN_MFA_CHALLENGE';
}

/**
 * Sanitizes admin user object with role and permissions metadata.
 */
function sanitizeAdminProfile(user: IUser) {
  const base = sanitizeUser(user);
  return {
    ...base,
    permissions: [
      'admin:read',
      'admin:write',
      'campaigns:manage',
      'tasks:manage',
      'tasks:review',
      'audit:read',
    ],
  };
}

/**
 * POST /api/admin/auth/login
 * Step 1 of Admin Authentication: Verifies credentials, verifies ADMIN role,
 * and initiates an MFA challenge.
 */
export async function loginAdmin(req: Request, res: Response): Promise<void> {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { mobile, password } = parsed.data;

  let normalizedMobile: string;
  try {
    normalizedMobile = normalizeIndianMobile(mobile);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_MOBILE', message: err.message },
    });
    return;
  }

  // 1. Fetch user by normalized mobile including passwordHash
  const user = await User.findOne({ mobile: normalizedMobile }).select('+passwordHash');
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid administrative mobile or password' },
    });
    return;
  }

  // 2. Strict ADMIN role verification
  if (user.role !== 'ADMIN') {
    logger.warn({ mobile: normalizedMobile, role: user.role, ip: req.ip }, 'SECURITY ALERT: Non-admin attempted admin login');
    await AuthSecurityEvent.create({
      userId: user._id,
      eventType: 'LOGIN_FAILURE',
      mobile: user.mobile,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      metadata: { attemptedRole: 'ADMIN', actualRole: user.role, reason: 'Unauthorized admin dashboard login attempt' },
    });

    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied: User does not possess administrative privileges' },
    });
    return;
  }

  // 3. Status verification
  if (user.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_INACTIVE', message: `Admin account is currently ${user.status.toLowerCase()}` },
    });
    return;
  }

  // 4. Verify password with Argon2id
  const isMatch = await verifyPassword(user.passwordHash, password);
  if (!isMatch) {
    logger.warn({ mobile: normalizedMobile, ip: req.ip }, 'SECURITY ALERT: Failed admin password verification');
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid administrative mobile or password' },
    });
    return;
  }

  // 5. Generate short-lived MFA challenge token (valid 5 minutes)
  const challengePayload: MfaChallengePayload = {
    userId: user._id.toString(),
    role: user.role,
    purpose: 'ADMIN_MFA_CHALLENGE',
  };

  const mfaSessionToken = jwt.sign(challengePayload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'adpayon-admin-api',
  });

  // 6. Dispatch 2FA OTP to registered admin mobile
  await createAndSendOtp(user.mobile, 'LOGIN');

  // Mask mobile for security display (e.g., +91 ••••• ••210)
  const maskedMobile = user.mobile.replace(/(\+\d{2})(\d{5})(\d{3})(\d{2})/, '$1 ••••• ••$4');

  res.status(200).json({
    success: true,
    data: {
      mfaRequired: true,
      mfaSessionToken,
      maskedMobile,
      message: 'MFA challenge initiated. Please enter the 6-digit code sent to your registered mobile.',
    },
  });
}

/**
 * POST /api/admin/auth/mfa-verify
 * Step 2 of Admin Authentication: Verifies MFA OTP and issues full admin session tokens.
 */
export async function verifyAdminMfa(req: Request, res: Response): Promise<void> {
  const parsed = adminMfaVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { mfaSessionToken, otp } = parsed.data;

  // 1. Decode and verify MFA challenge token
  let decoded: MfaChallengePayload;
  try {
    decoded = jwt.verify(mfaSessionToken, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'adpayon-admin-api',
    }) as MfaChallengePayload;
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: { code: 'MFA_CHALLENGE_EXPIRED', message: 'MFA session challenge has expired or is invalid. Please log in again.' },
    });
    return;
  }

  if (decoded.purpose !== 'ADMIN_MFA_CHALLENGE' || decoded.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid MFA challenge context' },
    });
    return;
  }

  // 2. Fetch admin user from DB
  const user = await User.findById(decoded.userId);
  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Administrator account inactive or unverified' },
    });
    return;
  }

  // 3. Verify OTP challenge
  const otpResult = await verifyOtpChallenge(user.mobile, otp, 'LOGIN');
  if (!otpResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_MFA_OTP', message: otpResult.reason || 'Invalid or expired 2FA verification code' },
    });
    return;
  }

  // 4. Create authentic administrative session
  const ipAddress = req.ip || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'AdpayonAdminPortal';
  const session = await createAuthSession(user._id, user.role, user.mobile, userAgent, ipAddress);

  // 5. Append-only Admin Audit Logging
  await AdminAuditLog.create({
    adminId: user._id,
    action: 'ADMIN_LOGIN_SUCCESS',
    targetEntity: 'AdminSession',
    targetId: user._id.toString(),
    details: { ip: ipAddress, userAgent },
    ipAddress,
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      admin: sanitizeAdminProfile(user),
    },
  });
}

/**
 * POST /api/admin/auth/logout
 * Revokes active admin session.
 */
export async function logoutAdmin(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (refreshToken && typeof refreshToken === 'string') {
    await revokeAuthSessionByToken(refreshToken);
  }

  if (req.user) {
    await AdminAuditLog.create({
      adminId: req.user._id,
      action: 'ADMIN_LOGOUT',
      targetEntity: 'AdminSession',
      targetId: req.user._id.toString(),
      details: { ip: req.ip },
      ipAddress: req.ip || '127.0.0.1',
    });
  }

  res.status(200).json({
    success: true,
    message: 'Admin session terminated successfully',
  });
}

/**
 * GET /api/admin/auth/me
 * Retrieves current admin profile and privileges.
 */
export async function getAdminProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  res.status(200).json({
    success: true,
    data: {
      admin: sanitizeAdminProfile(user),
    },
  });
}
