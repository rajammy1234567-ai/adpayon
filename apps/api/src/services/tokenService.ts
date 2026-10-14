import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { AuthSession, AuthSecurityEvent, User } from '../models';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface TokenPayload {
  userId: string;
  role: string;
  mobile: string;
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
}

const JWT_ISSUER = 'adpayon-api';
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Signs a short-lived access JWT token.
 */
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: JWT_ISSUER,
  });
}

/**
 * Verifies and decodes an access token.
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
    }) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generates a high-entropy cryptographically random refresh token string.
 */
export function generateRawRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Hashes a refresh token with SHA-256 for secure database storage.
 */
export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Creates a new AuthSession record and issues access and refresh tokens.
 */
export async function createAuthSession(
  userId: Types.ObjectId,
  role: string,
  mobile: string,
  userAgent?: string,
  ipAddress?: string,
  existingFamilyId?: string
): Promise<SessionResult> {
  const rawRefreshToken = generateRawRefreshToken();
  const refreshTokenHash = hashRefreshToken(rawRefreshToken);
  const familyId = existingFamilyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await AuthSession.create({
    userId,
    refreshTokenHash,
    familyId,
    userAgent,
    ipAddress,
    expiresAt,
    revokedAt: null,
  });

  const accessToken = generateAccessToken({
    userId: userId.toString(),
    role,
    mobile,
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
  };
}

export interface RotateSessionResult {
  success: boolean;
  tokens?: SessionResult;
  reason?: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'TOKEN_REUSE_DETECTED' | 'USER_NOT_ACTIVE';
}

/**
 * Rotates a refresh token with automatic reuse detection and family invalidation.
 */
export async function rotateAuthSession(
  rawRefreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<RotateSessionResult> {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const session = await AuthSession.findOne({ refreshTokenHash: tokenHash });
  if (!session) {
    return { success: false, reason: 'INVALID_TOKEN' };
  }

  // 1. REUSE DETECTION: If this token was already revoked or replaced, revoke entire family!
  if (session.revokedAt !== null) {
    logger.warn(
      { familyId: session.familyId, userId: session.userId },
      'SECURITY ALERT: Revoked refresh token reuse detected! Invalidating session family.'
    );

    // Invalidate all sessions sharing this family lineage
    await AuthSession.updateMany(
      { familyId: session.familyId },
      { $set: { revokedAt: new Date() } }
    );

    const user = await User.findById(session.userId);
    await AuthSecurityEvent.create({
      userId: session.userId,
      mobile: user?.mobile || 'unknown',
      eventType: 'TOKEN_REUSE_DETECTED',
      ipAddress,
      userAgent,
      metadata: { familyId: session.familyId },
    });

    return { success: false, reason: 'TOKEN_REUSE_DETECTED' };
  }

  // 2. Expiration check
  if (session.expiresAt.getTime() < Date.now()) {
    return { success: false, reason: 'TOKEN_EXPIRED' };
  }

  // 3. User account status check
  const user = await User.findById(session.userId);
  if (!user || user.status !== 'ACTIVE') {
    return { success: false, reason: 'USER_NOT_ACTIVE' };
  }

  // 4. Mark current session revoked/replaced
  session.revokedAt = new Date();
  await session.save();

  // 5. Issue new session in the same token family
  const newTokens = await createAuthSession(
    user._id,
    user.role,
    user.mobile,
    userAgent,
    ipAddress,
    session.familyId
  );

  return {
    success: true,
    tokens: newTokens,
  };
}

/**
 * Revokes an active session family on user logout.
 */
export async function revokeAuthSessionByToken(rawRefreshToken: string): Promise<boolean> {
  try {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const session = await AuthSession.findOne({ refreshTokenHash: tokenHash });
    if (!session) return false;

    await AuthSession.updateMany(
      { familyId: session.familyId },
      { $set: { revokedAt: new Date() } }
    );
    return true;
  } catch {
    return false;
  }
}
