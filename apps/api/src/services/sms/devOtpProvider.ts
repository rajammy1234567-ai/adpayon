import { ISmsProvider, SendSmsResult } from './smsProvider.interface';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

interface CachedDevOtp {
  otp: string;
  purpose: string;
  expiresAt: number;
}

// In-memory isolated store strictly for authorized local development inspection
const devOtpMemoryRegistry = new Map<string, CachedDevOtp>();

export class DevOtpProvider implements ISmsProvider {
  public readonly name = 'DevOtpProvider';

  public async sendOtp(mobile: string, otp: string, purpose: string): Promise<SendSmsResult> {
    // Fail closed if executed outside development or if DEV_OTP_ENABLED is false
    if (env.NODE_ENV === 'production' || !env.DEV_OTP_ENABLED) {
      logger.error('DevOtpProvider cannot be used in production or when DEV_OTP_ENABLED is false.');
      return {
        success: false,
        error: 'DevOtpProvider disabled in this environment',
      };
    }

    // Store in ephemeral memory registry (expires in 5 minutes)
    devOtpMemoryRegistry.set(mobile, {
      otp,
      purpose,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Clean up expired items periodically
    const now = Date.now();
    for (const [key, val] of devOtpMemoryRegistry.entries()) {
      if (val.expiresAt < now) {
        devOtpMemoryRegistry.delete(key);
      }
    }

    // Log delivery metadata WITHOUT leaking the OTP digits into ordinary application logs
    logger.debug(
      { provider: this.name, mobile, purpose },
      'Development OTP generated and held in memory registry for local verification'
    );

    return {
      success: true,
      messageId: `dev-otp-${Date.now()}`,
    };
  }

  /**
   * Records an active development OTP in the local memory registry.
   */
  public static recordDevOtp(mobile: string, otp: string, purpose: string): void {
    if (env.NODE_ENV === 'production' || !env.DEV_OTP_ENABLED) {
      return;
    }
    devOtpMemoryRegistry.set(mobile, {
      otp,
      purpose,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
  }

  /**
   * Safely retrieves the currently cached OTP for local development verification.
   * Accessible strictly in development via authorized loopback interface or tests.
   */
  public static getActiveDevOtp(mobile: string): string | null {
    if (env.NODE_ENV === 'production' || !env.DEV_OTP_ENABLED) {
      return null;
    }
    const item = devOtpMemoryRegistry.get(mobile);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      devOtpMemoryRegistry.delete(mobile);
      return null;
    }
    return item.otp;
  }

  /**
   * Clear test cache.
   */
  public static clearDevOtp(mobile?: string): void {
    if (mobile) {
      devOtpMemoryRegistry.delete(mobile);
    } else {
      devOtpMemoryRegistry.clear();
    }
  }
}

export const devOtpProvider = new DevOtpProvider();
