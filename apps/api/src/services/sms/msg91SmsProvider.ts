import { ISmsProvider, SendSmsResult } from './smsProvider.interface';
import { logger } from '../../config/logger';

export interface Msg91Config {
  authKey: string;
  flowId?: string;
  dltTemplateId?: string;
  senderId?: string;
}

/**
 * Normalizes Indian mobile number for MSG91 API (e.g. +919876543210 -> 919876543210).
 */
export function normalizeMobileForMsg91(rawMobile: string): string {
  const digits = rawMobile.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

/**
 * Production SMS Provider for Indian mobile numbers using MSG91 API v5.
 *
 * Complies with Indian TRAI DLT regulations:
 * - Directs delivery through registered Entity ID, Header, and Content Template.
 * - Never prints or leaks raw OTP into logs.
 */
export class Msg91SmsProvider implements ISmsProvider {
  public readonly name = 'Msg91SmsProvider';

  constructor(
    private readonly config: Msg91Config,
    private readonly fetchFn: typeof fetch = globalThis.fetch
  ) {
    if (!config.authKey || config.authKey.trim() === '') {
      throw new Error('Msg91SmsProvider initialization failed: authKey is strictly required');
    }
  }

  public async sendOtp(mobile: string, otp: string, purpose: string): Promise<SendSmsResult> {
    const formattedMobile = normalizeMobileForMsg91(mobile);
    const sanitizedLog = {
      provider: this.name,
      mobile: `${formattedMobile.slice(0, 4)}••••${formattedMobile.slice(-2)}`,
      purpose,
    };

    try {
      if (this.config.flowId) {
        return await this.sendViaFlowApi(formattedMobile, otp, purpose, sanitizedLog);
      }
      if (this.config.dltTemplateId) {
        return await this.sendViaOtpApi(formattedMobile, otp, sanitizedLog);
      }

      logger.error(sanitizedLog, 'MSG91 misconfiguration: neither flowId nor dltTemplateId is configured');
      return { success: false, error: 'SMS provider template misconfiguration' };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown network failure';
      logger.error({ ...sanitizedLog, err: errorMessage }, 'MSG91 SMS dispatch request failed');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Dispatches custom OTP via MSG91 Flow API v5.
   */
  private async sendViaFlowApi(
    mobile: string,
    otp: string,
    purpose: string,
    logContext: Record<string, unknown>
  ): Promise<SendSmsResult> {
    const url = 'https://control.msg91.com/api/v5/flow/';
    const payload = {
      template_id: this.config.flowId,
      short_url: '0',
      recipients: [
        {
          mobiles: mobile,
          otp,
          purpose,
          app_name: 'Adpayon',
        },
      ],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          authkey: this.config.authKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.message || `HTTP ${response.status} from MSG91`;
        logger.error({ ...logContext, status: response.status, errorMsg }, 'MSG91 Flow API returned non-OK status');
        return { success: false, error: errorMsg };
      }

      if (data.type === 'error') {
        logger.error({ ...logContext, error: data.message }, 'MSG91 Flow API rejected payload');
        return { success: false, error: data.message || 'SMS delivery failed' };
      }

      logger.info({ ...logContext, messageId: data.message }, 'MSG91 OTP SMS dispatched successfully');
      return {
        success: true,
        messageId: typeof data.message === 'string' ? data.message : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Dispatches OTP via MSG91 dedicated OTP API v5.
   */
  private async sendViaOtpApi(
    mobile: string,
    otp: string,
    logContext: Record<string, unknown>
  ): Promise<SendSmsResult> {
    const params = new URLSearchParams({
      template_id: this.config.dltTemplateId || '',
      mobile,
      authkey: this.config.authKey,
      otp,
    });

    const url = `https://control.msg91.com/api/v5/otp?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok || data.type === 'error') {
        const errorMsg = data.message || `HTTP ${response.status} from MSG91 OTP API`;
        logger.error({ ...logContext, errorMsg }, 'MSG91 OTP API error');
        return { success: false, error: errorMsg };
      }

      logger.info({ ...logContext, messageId: data.request_id }, 'MSG91 OTP SMS dispatched successfully');
      return {
        success: true,
        messageId: data.request_id,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
