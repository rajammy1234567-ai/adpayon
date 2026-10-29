import { Request, Response } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { User, IUser } from '../models';
import { hashPassword, verifyPassword } from '../services/passwordService';
import { createAndSendOtp, verifyOtpChallenge } from '../services/otpService';
import {
  createAuthSession,
  rotateAuthSession,
  revokeAuthSessionByToken,
} from '../services/tokenService';
import { DevOtpProvider } from '../services/sms/devOtpProvider';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Normalizes any valid Indian phone number into E.164 format (+919876543210).
 */
export function normalizeIndianMobile(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
    return `+91${digitsOnly}`;
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }
  if (raw.startsWith('+91') && digitsOnly.length === 12) {
    return raw;
  }
  throw new Error('Must be a valid 10-digit Indian mobile number');
}

/**
 * Generates an 8-character unique alphanumeric referral code (e.g., ADP48927).
 */
export function generateReferralCode(): string {
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ADP${randomSuffix}`;
}

/**
 * Strips all sensitive fields and returns public profile attributes.
 */
export function sanitizeUser(user: IUser) {
  return {
    id: user._id.toString(),
    mobile: user.mobile || null,
    email: user.email || null,
    name: user.name,
    role: user.role,
    status: user.status,
    referralCode: user.referralCode,
    sponsorId: user.sponsorId ? user.sponsorId.toString() : null,
    directReferralsCount: user.directReferralsCount || 0,
    metadata: user.metadata,
    createdAt: user.createdAt,
  };
}

// Zod validation schemas
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  mobile: z.string().trim(),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  sponsorReferralCode: z.string().trim().optional(),
  leg: z.enum(['LEFT', 'RIGHT']).optional(), // Client compatibility: accepted but ignored
  acceptTerms: z.boolean().refine((val) => val === true, 'You must accept terms & conditions'),
});

const sendOtpSchema = z.object({
  mobile: z.string().trim(),
  purpose: z.enum(['REGISTRATION', 'LOGIN', 'PASSWORD_RESET']),
});

const verifyOtpSchema = z.object({
  mobile: z.string().trim(),
  otp: z.string().trim().length(6, 'Verification code must be 6 digits'),
  purpose: z.enum(['REGISTRATION', 'LOGIN', 'PASSWORD_RESET']),
});

const loginSchema = z
  .object({
    mobile: z.string().trim().optional(),
    loginId: z.string().trim().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => data.mobile || data.loginId, {
    message: 'Mobile number or login ID is required',
  });

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20, 'Invalid refresh token'),
});

/**
 * Strict Security Guard:
 * Permits in-app test OTP delivery strictly for client-staging environment and database,
 * bounded by a MANDATORY, NON-EMPTY operator-approved allowlist (STAGING_REVIEWER_MOBILES).
 * Rejects wildcards (*) and unrestricted mobile access.
 * Only explicitly allowlisted test mobile numbers can receive an in-app test OTP.
 */
export function isStagingTestAllowed(mobile: string, dbNameOverride?: string): boolean {
  const isStagingEnv = env.APP_ENV === 'client_staging' || env.APP_ENV === 'staging';
  const activeDb = dbNameOverride || mongoose.connection.db?.databaseName;
  const isStagingDb = activeDb === 'adpayon_client_staging';
  if (!isStagingEnv || !isStagingDb) {
    return false;
  }
  const configured = env.STAGING_REVIEWER_MOBILES?.trim();
  // 1. STAGING_REVIEWER_MOBILES must be mandatory and non-empty
  if (!configured || configured.length === 0) {
    return false;
  }
  // 2. Reject wildcard (*) and unrestricted mobile-number access
  if (configured.includes('*') || configured.toUpperCase() === 'ALL') {
    logger.warn('Wildcard in STAGING_REVIEWER_MOBILES is strictly prohibited. Refusing in-app test OTP.');
    return false;
  }
  // 3. Only explicitly allowlisted test mobile numbers can receive an in-app test OTP
  const normalize10 = (num: string) => {
    const digits = num.replace(/\D/g, '');
    return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  };

  const target = normalize10(mobile);
  const allowlist = configured
    .split(',')
    .map((m) => normalize10(m.trim()))
    .filter(Boolean);

  if (allowlist.length === 0) {
    return false;
  }
  return allowlist.includes(target);
}

/**
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const { name, mobile, password, sponsorReferralCode } = parsed.data;

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

  // 1. Check if user already exists
  const existingUser = await User.findOne({ mobile: normalizedMobile });
  if (existingUser) {
    if (existingUser.status === 'PENDING_VERIFICATION') {
      // Allow pending user to update credentials and re-dispatch verification code
      existingUser.passwordHash = await hashPassword(password);
      existingUser.name = name;
      if (sponsorReferralCode && sponsorReferralCode.trim() !== '') {
        const code = sponsorReferralCode.trim().toUpperCase();
        const sponsor = await User.findOne({ referralCode: code });
        if (sponsor) {
          existingUser.sponsorId = sponsor._id;
          existingUser.ancestors = [...(sponsor.ancestors || []), sponsor._id];
        }
      }
      await existingUser.save();

      const otpResult = await createAndSendOtp(normalizedMobile, 'REGISTRATION', req.ip);
      if (!otpResult.success) {
        res.status(500).json({
          success: false,
          error: { code: 'OTP_DISPATCH_FAILED', message: otpResult.error },
        });
        return;
      }

      // Do NOT return testOtp for an existing account (even in PENDING_VERIFICATION)
      res.status(200).json({
        success: true,
        message: 'Account verification pending. A new verification code has been dispatched.',
        data: {
          userId: existingUser._id.toString(),
          mobile: normalizedMobile,
          status: 'PENDING_VERIFICATION',
        },
      });
      return;
    }

    res.status(409).json({
      success: false,
      error: {
        code: 'MOBILE_EXISTS',
        message: 'An account with this mobile number already exists.',
      },
    });
    return;
  }

  // 2. Sponsor validation (if provided)
  let sponsorId = null;
  let ancestors: any[] = [];
  if (sponsorReferralCode && sponsorReferralCode.trim() !== '') {
    const code = sponsorReferralCode.trim().toUpperCase();
    const sponsor = await User.findOne({ referralCode: code });
    if (!sponsor) {
      // In development, allow bootstrapping initial sponsor ADP1000 if no users exist
      const userCount = await User.countDocuments();
      if (userCount === 0 && code === 'ADP1000') {
        logger.info('Bootstrapping initial platform root user context for ADP1000');
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SPONSOR',
            message: 'Sponsor referral code was not found. Please verify the code.',
          },
        });
        return;
      }
    } else {
      sponsorId = sponsor._id;
      ancestors = [...(sponsor.ancestors || []), sponsor._id];
    }
  }

  // 3. Generate password hash via Argon2id
  const passwordHash = await hashPassword(password);

  // 4. Generate unique referral code
  let referralCode = generateReferralCode();
  while (await User.findOne({ referralCode })) {
    referralCode = generateReferralCode();
  }

  // 5. Create user in PENDING_VERIFICATION state (Never grant roles or verified flags from client!)
  const user = await User.create({
    mobile: normalizedMobile,
    name,
    passwordHash,
    role: 'USER',
    status: 'PENDING_VERIFICATION',
    referralCode,
    sponsorId,
    ancestors,
    directReferralsCount: 0,
    metadata: {
      language: 'en',
      kycStatus: 'NOT_SUBMITTED',
    },
  });

  // 6. Send OTP
  const otpResult = await createAndSendOtp(normalizedMobile, 'REGISTRATION', req.ip);
  if (!otpResult.success) {
    // Rollback user creation to prevent stuck PENDING_VERIFICATION state on dispatch failure
    await User.deleteOne({ _id: user._id });
    res.status(500).json({
      success: false,
      error: { code: 'OTP_DISPATCH_FAILED', message: otpResult.error },
    });
    return;
  }

  const canDiscloseTestOtp = isStagingTestAllowed(normalizedMobile);

  // 7. HTTP 201 Created — Notice: Zero JWT issued at registration stage!
  res.status(201).json({
    success: true,
    message: 'Registration initiated successfully. Verification code dispatched.',
    data: {
      userId: user._id.toString(),
      mobile: normalizedMobile,
      status: user.status,
      ...(canDiscloseTestOtp && otpResult.rawOtp ? { testOtp: otpResult.rawOtp } : {}),
    },
  });
}

/**
 * POST /api/auth/otp/send
 */
export async function sendOtp(req: Request, res: Response): Promise<void> {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  let normalizedMobile: string;
  try {
    normalizedMobile = normalizeIndianMobile(parsed.data.mobile);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_MOBILE', message: err.message },
    });
    return;
  }

  // Security: Disable password reset for review accounts
  if (parsed.data.purpose === 'PASSWORD_RESET') {
    const existingUser = await User.findOne({ mobile: normalizedMobile });
    if (existingUser?.metadata?.accountType === 'CLIENT_STAGING_TEST') {
      res.status(403).json({
        success: false,
        error: {
          code: 'REVIEW_ACCOUNT_RESTRICTED',
          message: 'Password reset is disabled for client staging review accounts.',
        },
      });
      return;
    }
  }

  const result = await createAndSendOtp(normalizedMobile, parsed.data.purpose, req.ip);
  if (!result.success) {
    res.status(500).json({
      success: false,
      error: { code: 'OTP_ERROR', message: result.error || 'Failed to send code' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Verification code dispatched successfully.',
    data: { mobile: normalizedMobile },
  });
}

/**
 * POST /api/auth/otp/verify
 */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  let normalizedMobile: string;
  try {
    normalizedMobile = normalizeIndianMobile(parsed.data.mobile);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_MOBILE', message: err.message },
    });
    return;
  }

  const verifyResult = await verifyOtpChallenge(
    normalizedMobile,
    parsed.data.otp,
    parsed.data.purpose,
    req.ip
  );

  if (!verifyResult.success) {
    if (verifyResult.reason === 'MAX_ATTEMPTS_EXCEEDED') {
      res.status(429).json({
        success: false,
        error: {
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: 'Maximum verification attempts exceeded. Please request a new code.',
        },
      });
      return;
    }
    if (verifyResult.reason === 'INVALID_OTP') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid verification code entered.',
          attemptsRemaining: verifyResult.attemptsRemaining,
        },
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'EXPIRED_OR_NOT_FOUND',
        message: 'Verification code has expired or was not requested.',
      },
    });
    return;
  }

  // Handle post-verification activation and token issuance
  if (parsed.data.purpose === 'REGISTRATION') {
    // Atomic status transition from PENDING_VERIFICATION to ACTIVE
    const user = await User.findOneAndUpdate(
      { mobile: normalizedMobile, status: 'PENDING_VERIFICATION' },
      { $set: { status: 'ACTIVE' } },
      { new: true }
    );

    if (user) {
      // First-time activation: safely increment sponsor direct count
      if (user.sponsorId) {
        await User.findByIdAndUpdate(user.sponsorId, { $inc: { directReferralsCount: 1 } });
      }
    } else {
      // Check if user is already ACTIVE (idempotent retry guard prevents double counting)
      const existingActiveUser = await User.findOne({ mobile: normalizedMobile });
      if (!existingActiveUser) {
        res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User record not found.' },
        });
        return;
      }
      if (existingActiveUser.status !== 'ACTIVE') {
        res.status(403).json({
          success: false,
          error: { code: 'ACCOUNT_NOT_ACTIVE', message: 'Account cannot be verified in current state.' },
        });
        return;
      }

      const tokens = await createAuthSession(
        existingActiveUser._id,
        existingActiveUser.role,
        existingActiveUser.mobile || normalizedMobile,
        req.headers['user-agent'],
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Account verified successfully.',
        data: {
          tokens,
          user: sanitizeUser(existingActiveUser),
        },
      });
      return;
    }

    const tokens = await createAuthSession(
      user._id,
      user.role,
      user.mobile || normalizedMobile,
      req.headers['user-agent'],
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Account verified successfully.',
      data: {
        tokens,
        user: sanitizeUser(user),
      },
    });
    return;
  }

  if (parsed.data.purpose === 'LOGIN') {
    const user = await User.findOne({ mobile: normalizedMobile });
    if (!user || user.status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_NOT_ACTIVE', message: 'Account is not in active state.' },
      });
      return;
    }

    const tokens = await createAuthSession(
      user._id,
      user.role,
      user.mobile || normalizedMobile,
      req.headers['user-agent'],
      req.ip
    );

    res.status(200).json({
      success: true,
      message: 'Login verified successfully.',
      data: {
        tokens,
        user: sanitizeUser(user),
      },
    });
    return;
  }

  // Default purpose response (e.g. PASSWORD_RESET validation)
  res.status(200).json({
    success: true,
    message: 'Verification code confirmed.',
  });
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
    });
    return;
  }

  const rawIdentifier = (parsed.data.loginId || parsed.data.mobile || '').trim();
  const isEmailIdentifier = rawIdentifier.includes('@');

  let user: (IUser & { passwordHash: string }) | null = null;

  if (isEmailIdentifier) {
    // Staging Reviewer Login: Allowed ONLY when APP_ENV is client_staging/staging and database is adpayon_client_staging
    const isStagingReviewerAllowed =
      (env.APP_ENV === 'client_staging' || env.APP_ENV === 'staging') &&
      mongoose.connection.db?.databaseName === 'adpayon_client_staging';

    if (!isStagingReviewerAllowed || rawIdentifier.toLowerCase() !== 'client.demo@adpayon.test') {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid mobile number or password.' },
      });
      return;
    }

    user = await User.findOne({
      email: 'client.demo@adpayon.test',
      'metadata.accountType': 'CLIENT_STAGING_TEST',
    }).select('+passwordHash');
  } else {
    let normalizedMobile: string;
    try {
      normalizedMobile = normalizeIndianMobile(rawIdentifier);
    } catch {
      // Uniform credential failure response against enumeration
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid mobile number or password.' },
      });
      return;
    }

    // Explicitly select hidden passwordHash
    user = await User.findOne({ mobile: normalizedMobile }).select('+passwordHash');
  }

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid mobile number or password.' },
    });
    return;
  }

  const isPasswordValid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid mobile number or password.' },
    });
    return;
  }

  // Enforce account status
  if (user.status === 'PENDING_VERIFICATION') {
    if (user.mobile) {
      await createAndSendOtp(user.mobile, 'REGISTRATION', req.ip);
    }
    res.status(403).json({
      success: false,
      error: {
        code: 'PENDING_VERIFICATION',
        message: 'Account verification required before login. Verification code dispatched.',
        mobile: user.mobile,
      },
    });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: {
        code: 'ACCOUNT_SUSPENDED',
        message: `Account is currently ${user.status.toLowerCase()}. Access denied.`,
      },
    });
    return;
  }

  const sessionIdentifier = user.mobile || user.email || 'client.demo@adpayon.test';
  const tokens = await createAuthSession(
    user._id,
    user.role,
    sessionIdentifier,
    req.headers['user-agent'],
    req.ip
  );

  res.status(200).json({
    success: true,
    message: 'Login successful.',
    data: {
      tokens,
      user: sanitizeUser(user),
    },
  });
}

/**
 * POST /api/auth/refresh
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Valid refreshToken is required' },
    });
    return;
  }

  const rotateResult = await rotateAuthSession(
    parsed.data.refreshToken,
    req.headers['user-agent'],
    req.ip
  );

  if (!rotateResult.success) {
    if (rotateResult.reason === 'TOKEN_REUSE_DETECTED') {
      res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_REUSE_DETECTED',
          message: 'Security alert: Revoked refresh token reuse detected. Session terminated.',
        },
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Refresh token is invalid or expired. Please re-authenticate.',
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Token refreshed successfully.',
    data: {
      tokens: rotateResult.tokens,
    },
  });
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const refreshToken = req.body?.refreshToken;
  if (refreshToken && typeof refreshToken === 'string') {
    await revokeAuthSessionByToken(refreshToken);
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
}

/**
 * GET /api/auth/me
 */
export async function getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
    },
  });
}

/**
 * GET /api/dev/otp/:mobile
 * Development-only loopback tool to inspect active OTP for testing.
 * Strictly forbidden outside NODE_ENV=development on localhost.
 */
export async function getDevOtpEndpoint(req: Request, res: Response): Promise<void> {
  // 1. Strict environment guard
  if (env.NODE_ENV === 'production' || !env.DEV_OTP_ENABLED) {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
    return;
  }

  // 2. Strict loopback IP guard
  const remoteIp = req.ip || req.socket.remoteAddress;
  const isLoopback =
    remoteIp === '127.0.0.1' ||
    remoteIp === '::1' ||
    remoteIp === '::ffff:127.0.0.1';

  if (!isLoopback) {
    res.status(403).json({
      success: false,
      error: 'Dev OTP inspection is strictly restricted to local development loopback.',
    });
    return;
  }

  try {
    const normalized = normalizeIndianMobile(req.params.mobile);
    const otp = DevOtpProvider.getActiveDevOtp(normalized);
    if (!otp) {
      res.status(404).json({
        success: false,
        message: 'No active verification code found in dev memory registry for this number.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      developmentOnly: true,
      mobile: normalized,
      otp,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/auth/client-staging/demo-enroll
 *
 * Safe Client Review Enrollment System:
 * Creates an isolated review account with a dedicated synthetic identity in adpayon_client_staging.
 * Generates an in-app test verification code without requiring SMS gateway or operator mobile allowlisting.
 * Strictly blocked in production.
 */
export async function startClientDemoReview(req: Request, res: Response): Promise<void> {
  const isStagingEnv = env.APP_ENV === 'client_staging' || env.APP_ENV === 'staging' || env.NODE_ENV === 'test';
  const activeDb = mongoose.connection.db?.databaseName;
  const isStagingDb = activeDb === 'adpayon_client_staging' || env.NODE_ENV === 'test';

  if (!isStagingEnv || !isStagingDb) {
    logger.warn({ appEnv: env.APP_ENV, activeDb }, 'Unauthorized attempt to invoke client demo review enrollment.');
    res.status(403).json({
      success: false,
      error: {
        code: 'DEMO_ENROLLMENT_DISABLED',
        message: 'Client demo review mode is strictly disabled in this environment.',
      },
    });
    return;
  }

  // 1. Generate unique synthetic review identity (non-routable test block: +91999900XXXX)
  let reviewSuffix = crypto.randomInt(1000, 9999).toString();
  let reviewMobile = `+91999900${reviewSuffix}`;
  let attempts = 0;
  while ((await User.findOne({ mobile: reviewMobile })) && attempts < 10) {
    reviewSuffix = crypto.randomInt(1000, 9999).toString();
    reviewMobile = `+91999900${reviewSuffix}`;
    attempts++;
  }

  const reviewEmail = `client.review.${reviewSuffix}@adpayon.test`;
  const reviewName = `Client Reviewer #${reviewSuffix}`;

  // 2. Attach initial root sponsor ADP1000 if present
  let sponsorId = null;
  let ancestors: any[] = [];
  const sponsor = await User.findOne({ referralCode: 'ADP1000' });
  if (sponsor) {
    sponsorId = sponsor._id;
    ancestors = [...(sponsor.ancestors || []), sponsor._id];
  }

  // 3. Generate high-entropy dummy password hash
  const dummyPassword = crypto.randomBytes(24).toString('hex') + 'A1!';
  const passwordHash = await hashPassword(dummyPassword);

  // 4. Generate unique referral code
  let referralCode = generateReferralCode();
  while (await User.findOne({ referralCode })) {
    referralCode = generateReferralCode();
  }

  // 5. Create unverified review account
  const user = await User.create({
    mobile: reviewMobile,
    email: reviewEmail,
    name: reviewName,
    passwordHash,
    role: 'USER',
    status: 'PENDING_VERIFICATION',
    referralCode,
    sponsorId,
    ancestors,
    directReferralsCount: 0,
    metadata: {
      language: 'en',
      kycStatus: 'NOT_SUBMITTED',
      accountType: 'CLIENT_STAGING_TEST',
    },
  });

  // 6. Create OTP challenge via CSPRNG
  const otpResult = await createAndSendOtp(reviewMobile, 'REGISTRATION', req.ip);
  if (!otpResult.success || !otpResult.rawOtp) {
    await User.deleteOne({ _id: user._id });
    res.status(500).json({
      success: false,
      error: { code: 'OTP_DISPATCH_FAILED', message: 'Failed to generate review verification code' },
    });
    return;
  }

  logger.info({ userId: user._id, reviewMobile, reviewEmail }, 'Enrolled client demo reviewer with in-app test OTP');

  // 7. Return review credentials and test OTP directly for in-app verification
  res.status(201).json({
    success: true,
    message: 'Client demo review identity created. Verification code generated.',
    data: {
      userId: user._id.toString(),
      mobile: reviewMobile,
      displayId: reviewEmail,
      testOtp: otpResult.rawOtp,
      status: 'PENDING_VERIFICATION',
    },
  });
}
