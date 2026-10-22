import { ISmsProvider, SendSmsResult } from './smsProvider.interface';

export interface MockSentMessage {
  mobile: string;
  otp: string;
  purpose: string;
  timestamp: Date;
}

/**
 * Mock SMS Provider for automated integration tests and local development.
 * Never performs network requests or sends real SMS.
 */
export class MockSmsProvider implements ISmsProvider {
  public readonly name = 'MockSmsProvider';
  private sentMessages: MockSentMessage[] = [];
  private failureMode: { enabled: boolean; error: string } = { enabled: false, error: 'Simulated SMS gateway failure' };

  public async sendOtp(mobile: string, otp: string, purpose: string): Promise<SendSmsResult> {
    if (this.failureMode.enabled) {
      return {
        success: false,
        error: this.failureMode.error,
      };
    }

    this.sentMessages.push({
      mobile,
      otp,
      purpose,
      timestamp: new Date(),
    });

    return {
      success: true,
      messageId: `mock-sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
  }

  public getSentMessages(): MockSentMessage[] {
    return [...this.sentMessages];
  }

  public getLastOtp(mobile: string): string | null {
    const matching = this.sentMessages.filter((m) => m.mobile === mobile);
    if (matching.length === 0) return null;
    return matching[matching.length - 1].otp;
  }

  public setFailureMode(enabled: boolean, error?: string): void {
    this.failureMode = {
      enabled,
      error: error || 'Simulated SMS gateway failure',
    };
  }

  public clear(): void {
    this.sentMessages = [];
    this.failureMode = { enabled: false, error: 'Simulated SMS gateway failure' };
  }
}

export const mockSmsProvider = new MockSmsProvider();
