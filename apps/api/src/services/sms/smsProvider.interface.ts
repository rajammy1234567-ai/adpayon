export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ISmsProvider {
  name: string;
  sendOtp(mobile: string, otp: string, purpose: string): Promise<SendSmsResult>;
}

export interface FutureProductionSmsProvider extends ISmsProvider {
  dltTemplateId?: string;
  senderId?: string;
}
