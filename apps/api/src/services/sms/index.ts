import { ISmsProvider, SendSmsResult } from './smsProvider.interface';
import { DevOtpProvider, devOtpProvider } from './devOtpProvider';
import { Msg91SmsProvider } from './msg91SmsProvider';
import { MockSmsProvider, mockSmsProvider } from './mockSmsProvider';
import { StagingManualOtpProvider } from './stagingManualOtpProvider';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export * from './smsProvider.interface';
export * from './devOtpProvider';
export * from './msg91SmsProvider';
export * from './mockSmsProvider';
export * from './stagingManualOtpProvider';

class FailClosedSmsProvider implements ISmsProvider {
  public readonly name = 'FailClosedSmsProvider';
  public async sendOtp(mobile: string, _otp: string, purpose: string): Promise<SendSmsResult> {
    logger.error(
      { provider: this.name, mobile: `${mobile.slice(0, 4)}••••${mobile.slice(-2)}`, purpose },
      'SMS delivery blocked: No production SMS gateway configured. Set SMS_PROVIDER=msg91 with authorized credentials.'
    );
    return {
      success: false,
      error: 'SMS service is temporarily unavailable. Please contact support.',
    };
  }
}

class ClientStagingOtpProvider implements ISmsProvider {
  public readonly name = 'ClientStagingOtpProvider';
  public async sendOtp(mobile: string, _otp: string, purpose: string): Promise<SendSmsResult> {
    const maskedMobile = `${mobile.slice(0, 4)}••••${mobile.slice(-2)}`;
    logger.info(
      { provider: this.name, mobile: maskedMobile, purpose },
      'Client staging in-app OTP dispatched successfully'
    );
    return {
      success: true,
      messageId: `staging-inapp-${Date.now()}`,
    };
  }
}

const clientStagingOtpProvider = new ClientStagingOtpProvider();

const failClosedProvider = new FailClosedSmsProvider();

let testProviderOverride: ISmsProvider | null = null;
let stagingManualInstance: StagingManualOtpProvider | null = null;
let msg91Instance: Msg91SmsProvider | null = null;

/**
 * Resolves the active SMS provider instance based on runtime environment configuration.
 */
export function getSmsProvider(): ISmsProvider {
  if (testProviderOverride) {
    return testProviderOverride;
  }

  if (env.SMS_PROVIDER === 'mock') {
    return mockSmsProvider;
  }

  if (env.SMS_PROVIDER === 'staging_manual') {
    if (!stagingManualInstance) {
      const allowlist = (env.STAGING_REVIEWER_MOBILES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      stagingManualInstance = new StagingManualOtpProvider({
        operatorSecret: env.STAGING_OPERATOR_SECRET || env.OTP_HMAC_SECRET,
        allowlistedMobiles: allowlist,
      });
    }
    return stagingManualInstance;
  }

  if (env.SMS_PROVIDER === 'msg91') {
    if (!msg91Instance) {
      if (!env.MSG91_AUTH_KEY) {
        logger.error('SMS_PROVIDER is set to msg91 but MSG91_AUTH_KEY is not configured. Falling closed.');
        return failClosedProvider;
      }
      msg91Instance = new Msg91SmsProvider({
        authKey: env.MSG91_AUTH_KEY,
        flowId: env.MSG91_FLOW_ID,
        dltTemplateId: env.MSG91_DLT_TE_ID,
        senderId: env.MSG91_SENDER_ID,
      });
    }
    return msg91Instance;
  }

  if (env.DEV_OTP_ENABLED && env.NODE_ENV !== 'production') {
    return devOtpProvider;
  }

  if (env.APP_ENV === 'client_staging' || env.APP_ENV === 'staging') {
    return clientStagingOtpProvider;
  }

  return failClosedProvider;
}

/**
 * Registers an isolated provider for unit or integration testing.
 * Pass null to restore default behavior.
 */
export function setSmsProviderForTesting(provider: ISmsProvider | null): void {
  testProviderOverride = provider;
}
