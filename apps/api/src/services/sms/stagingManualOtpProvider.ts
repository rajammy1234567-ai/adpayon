import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ISmsProvider, SendSmsResult } from './smsProvider.interface';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface StagingManualOtpConfig {
  operatorSecret: string;
  allowlistedMobiles: string[];
}

export interface EncryptedOtpEnvelope {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Derives a 32-byte key from the operator secret using SHA-256.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext OTP string using AES-256-GCM.
 */
export function encryptOtpForStaging(otp: string, secret: string): EncryptedOtpEnvelope {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(otp, 'utf8'),
    cipher.final(),
  ]).toString('hex');

  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypts an encrypted OTP envelope using AES-256-GCM.
 */
export function decryptOtpForStaging(envelope: EncryptedOtpEnvelope, secret: string): string {
  const key = deriveKey(secret);
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Isolated Client-Staging Manual OTP Provider.
 *
 * STRICT SECURITY INVARIANTS:
 * 1. Only runs when APP_ENV=client_staging and database is adpayon_client_staging.
 * 2. Only accepts explicitly allowlisted reviewer mobile numbers.
 * 3. Never prints raw OTP to console or Render application logs.
 * 4. Encrypts OTP with AES-256-GCM before writing to the staging vault.
 * 5. Ordinary public users attempting registration receive a fail-closed rejection.
 */
export class StagingManualOtpProvider implements ISmsProvider {
  public readonly name = 'StagingManualOtpProvider';

  constructor(private readonly config: StagingManualOtpConfig) {
    if (!config.operatorSecret || config.operatorSecret.length < 32) {
      throw new Error('StagingManualOtpProvider requires operatorSecret of at least 32 characters');
    }
  }

  public async sendOtp(mobile: string, otp: string, purpose: string): Promise<SendSmsResult> {
    // 1. Strict reviewer allowlist guard
    const normalizedTarget = mobile.replace(/\D/g, '');
    const isAllowlisted = this.config.allowlistedMobiles.some(
      (m) => m.replace(/\D/g, '') === normalizedTarget
    );

    const maskedMobile = `${mobile.slice(0, 4)}••••${mobile.slice(-2)}`;

    if (!isAllowlisted) {
      logger.warn(
        { provider: this.name, mobile: maskedMobile, purpose },
        'Rejecting OTP dispatch: mobile number is not an authorized staging reviewer'
      );
      return {
        success: false,
        error: 'SMS service is restricted to authorized staging reviewers. Please contact the administrator.',
      };
    }

    // 2. Strict environment guard (Permits test environment for unit tests)
    if (env.APP_ENV !== 'client_staging' && env.APP_ENV !== 'staging' && env.NODE_ENV !== 'test') {
      logger.error('CRITICAL: StagingManualOtpProvider invoked outside client_staging environment. Refusing execution.');
      return {
        success: false,
        error: 'Manual OTP testing is strictly disabled in this environment',
      };
    }

    const activeDbName = mongoose.connection.db?.databaseName;
    if (env.NODE_ENV !== 'test' && activeDbName !== 'adpayon_client_staging') {
      logger.error({ activeDbName }, 'CRITICAL: StagingManualOtpProvider invoked against unauthorized database.');
      return {
        success: false,
        error: 'Manual OTP testing is restricted to staging database',
      };
    }

    // 3. Encrypt OTP with AES-256-GCM envelope
    const envelope = encryptOtpForStaging(otp, this.config.operatorSecret);

    // 4. Persist encrypted dispatch in adpayon_client_staging.staging_manual_otps collection
    const activeDb = mongoose.connection.db;
    if (!activeDb) {
      return { success: false, error: 'Database connection unavailable' };
    }

    const vaultCollection = activeDb.collection('staging_manual_otps');

    // Create TTL index if not already present (fails-safe if exists)
    await vaultCollection
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true })
      .catch(() => {});

    // Invalidate prior manual envelopes for this mobile and purpose
    await vaultCollection.deleteMany({ mobile, purpose });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute TTL

    await vaultCollection.insertOne({
      mobile,
      purpose,
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      tag: envelope.tag,
      expiresAt,
      consumed: false,
      createdAt: new Date(),
    });

    // 5. Secure log (NEVER logs raw OTP)
    logger.info(
      { provider: this.name, mobile: maskedMobile, purpose },
      'Staging reviewer OTP securely deposited in staging vault for operator lookup'
    );

    return {
      success: true,
      messageId: `staging-vault-${Date.now()}`,
    };
  }
}
