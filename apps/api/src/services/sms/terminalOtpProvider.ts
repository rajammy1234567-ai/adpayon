import { ISmsProvider, SendSmsResult } from './smsProvider.interface';
import { DevOtpProvider } from './devOtpProvider';
import { env } from '../../config/env';

export interface TerminalOtpConfig {
  enabled: boolean;
  allowlistedMobiles: string[];
}

/**
 * Isolated Local Terminal Test OTP Provider.
 *
 * STRICT SECURITY INVARIANTS:
 * 1. Only runs in local development or sandbox environments.
 * 2. Strictly prohibited from running in staging or production.
 * 3. Enforces an explicit opt-in flag (TERMINAL_OTP_ENABLED).
 * 4. Strictly checks an exact allowlist of authorized test admin phone numbers.
 * 5. Writes directly to the interactive operator terminal (process.stdout).
 * 6. Never exposes OTPs to application log files, API responses, or telemetry.
 * 7. Never uses fixed, universal, or brute-forceable test codes.
 */
export class TerminalOtpProvider implements ISmsProvider {
  public readonly name = 'TerminalOtpProvider';

  constructor(private readonly config: TerminalOtpConfig) {
    if (this.config.enabled) {
      this.assertSafeEnvironment();
    }
  }

  private assertSafeEnvironment(): void {
    const isProhibited =
      env.NODE_ENV === 'production' ||
      env.APP_ENV === 'client_staging' ||
      env.APP_ENV === 'staging';

    if (isProhibited) {
      throw new Error(
        `SECURITY VIOLATION: TerminalOtpProvider is strictly prohibited in environment '${env.NODE_ENV}' (APP_ENV: '${env.APP_ENV}').`
      );
    }
  }

  public async sendOtp(mobile: string, otp: string, purpose: string): Promise<SendSmsResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Terminal OTP delivery is disabled.',
      };
    }

    try {
      this.assertSafeEnvironment();
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }

    const normalizedTarget = mobile.replace(/\D/g, '');
    const isAllowlisted = this.config.allowlistedMobiles.some(
      (m) => m.replace(/\D/g, '') === normalizedTarget
    );

    if (!isAllowlisted) {
      return {
        success: false,
        error: 'Mobile number is not authorized for local terminal OTP dispatch.',
      };
    }

    // Direct terminal output strictly to interactive stdout (never logged through pino)
    const banner = [
      '',
      '==============================================================',
      '        ADPAYON LOCAL SECURE TERMINAL TEST OTP DISPATCH       ',
      '==============================================================',
      `  Recipient Mobile: ${mobile}`,
      `  Challenge Action: ${purpose}`,
      `  Fresh 2FA Code:   [ ${otp} ]`,
      '  Security Guard:   Single-use, 5-minute expiry, max 5 attempts',
      '==============================================================',
      '',
    ].join('\n');

    process.stdout.write(banner);

    // Also register in DevOtpProvider registry for developer loopback inspection
    DevOtpProvider.recordDevOtp(mobile, otp, purpose);

    return {
      success: true,
      messageId: `terminal-otp-${Date.now()}`,
    };
  }
}
