import crypto from 'node:crypto';
import { OTPChallenge, OtpPurpose, AuthSecurityEvent } from '../models';
import { devOtpProvider } from './sms/devOtpProvider';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface VerifyOtpResult {
  success: boolean;
  reason?: 'EXPIRED_OR_NOT_FOUND' | 'MAX_ATTEMPTS_EXCEEDED' | 'INVALID_OTP';
  attemptsRemaining?: number;
}

/**
 * Computes deterministic HMAC-SHA256 hash of mobile, OTP code, and purpose.
 */
export function computeOtpHash(mobile: string, otp: string, purpose: string): string {
  return crypto
    .createHmac('sha256', env.OTP_HMAC_SECRET)
    .update(`${mobile}:${otp}:${purpose}`)
    .digest('hex');
}

/**
 * Generates and issues a cryptographically secure 6-digit OTP challenge.
 */
export async function createAndSendOtp(
  mobile: string,
  purpose: OtpPurpose,
  ipAddress?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Invalidate any existing active challenges for this mobile and purpose
    await OTPChallenge.deleteMany({ mobile, purpose });

    // 2. Generate secure 6-digit OTP using CSPRNG
    const rawOtp = crypto.randomInt(100000, 1000000).toString();

    // 3. Compute HMAC-SHA256 hash
    const otpHash = computeOtpHash(mobile, rawOtp, purpose);

    // 4. Persist challenge with 5-minute expiry
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OTPChallenge.create({
      mobile,
      purpose,
      otpHash,
      attempts: 0,
      consumed: false,
      expiresAt,
    });

    // 5. Send via provider
    const sendResult = await devOtpProvider.sendOtp(mobile, rawOtp, purpose);
    if (!sendResult.success) {
      logger.error({ mobile, purpose, err: sendResult.error }, 'Failed to dispatch OTP');
      return { success: false, error: 'Failed to send verification code' };
    }

    // 6. Log security audit event
    await AuthSecurityEvent.create({
      eventType: 'OTP_SENT',
      mobile,
      ipAddress,
      metadata: { purpose },
    });

    return { success: true };
  } catch (err: unknown) {
    logger.error({ err, mobile, purpose }, 'Error creating OTP challenge');
    return { success: false, error: 'Could not generate verification code' };
  }
}

/**
 * Atomically verifies an OTP challenge with timing-safe comparison, attempt limits,
 * and single-use replay protection.
 */
export async function verifyOtpChallenge(
  mobile: string,
  candidateOtp: string,
  purpose: OtpPurpose,
  ipAddress?: string
): Promise<VerifyOtpResult> {
  // 1. Find unconsumed and unexpired challenge
  const challenge = await OTPChallenge.findOne({
    mobile,
    purpose,
    consumed: false,
    expiresAt: { $gt: new Date() },
  });

  if (!challenge) {
    return { success: false, reason: 'EXPIRED_OR_NOT_FOUND' };
  }

  // 2. Enforce maximum 5 attempts
  if (challenge.attempts >= 5) {
    await OTPChallenge.deleteOne({ _id: challenge._id });
    await AuthSecurityEvent.create({
      eventType: 'OTP_FAILED',
      mobile,
      ipAddress,
      metadata: { purpose, reason: 'MAX_ATTEMPTS_EXCEEDED' },
    });
    return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', attemptsRemaining: 0 };
  }

  // 3. Timing-safe HMAC hash comparison
  const candidateHash = computeOtpHash(mobile, candidateOtp, purpose);
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const storedBuf = Buffer.from(challenge.otpHash, 'hex');

  const isMatch =
    candidateBuf.length === storedBuf.length &&
    crypto.timingSafeEqual(candidateBuf, storedBuf);

  if (!isMatch) {
    const updatedAttempts = challenge.attempts + 1;
    if (updatedAttempts >= 5) {
      await OTPChallenge.deleteOne({ _id: challenge._id });
    } else {
      await OTPChallenge.updateOne({ _id: challenge._id }, { $inc: { attempts: 1 } });
    }

    await AuthSecurityEvent.create({
      eventType: 'OTP_FAILED',
      mobile,
      ipAddress,
      metadata: { purpose, attempt: updatedAttempts },
    });

    return {
      success: false,
      reason: 'INVALID_OTP',
      attemptsRemaining: Math.max(0, 5 - updatedAttempts),
    };
  }

  // 4. Atomic single-use consumption (guards against concurrent race conditions)
  const consumedDoc = await OTPChallenge.findOneAndUpdate(
    { _id: challenge._id, consumed: false },
    { $set: { consumed: true } },
    { new: true }
  );

  if (!consumedDoc || consumedDoc.consumed !== true) {
    // Already consumed in a concurrent request!
    return { success: false, reason: 'EXPIRED_OR_NOT_FOUND' };
  }

  // 5. Log verification success
  await AuthSecurityEvent.create({
    eventType: 'OTP_VERIFIED',
    mobile,
    ipAddress,
    metadata: { purpose },
  });

  // Delete consumed record immediately
  await OTPChallenge.deleteOne({ _id: challenge._id });

  return { success: true };
}
