import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  Msg91SmsProvider,
  normalizeMobileForMsg91,
} from '../src/services/sms/msg91SmsProvider';
import { MockSmsProvider } from '../src/services/sms/mockSmsProvider';
import {
  getSmsProvider,
  setSmsProviderForTesting,
} from '../src/services/sms';

describe('ADPAYON — SMS OTP Provider & MSG91 Integration Suite', () => {
  beforeEach(() => {
    setSmsProviderForTesting(null);
  });

  afterEach(() => {
    setSmsProviderForTesting(null);
  });

  describe('1. Mobile Number Normalization for MSG91', () => {
    it('Normalizes 10-digit Indian mobile number with 91 prefix', () => {
      assert.equal(normalizeMobileForMsg91('9876543210'), '919876543210');
    });

    it('Normalizes E.164 +91 mobile number by stripping plus symbol', () => {
      assert.equal(normalizeMobileForMsg91('+919876543210'), '919876543210');
    });

    it('Preserves already normalized 12-digit 91-prefixed numbers', () => {
      assert.equal(normalizeMobileForMsg91('919876543210'), '919876543210');
    });

    it('Strips formatting whitespace, dashes, and parentheses', () => {
      assert.equal(normalizeMobileForMsg91('+91 (987) 654-3210'), '919876543210');
    });
  });

  describe('2. Msg91SmsProvider Validation & Construction', () => {
    it('Fails construction if authKey is empty or missing', () => {
      assert.throws(
        () => new Msg91SmsProvider({ authKey: '' }),
        /authKey is strictly required/
      );
    });

    it('Succeeds construction with valid authKey and flowId', () => {
      const provider = new Msg91SmsProvider({
        authKey: 'test_auth_key_123',
        flowId: 'flow_template_abc',
      });
      assert.equal(provider.name, 'Msg91SmsProvider');
    });
  });

  describe('3. Msg91SmsProvider Flow API Dispatch (Mocked HTTP)', () => {
    it('Successfully dispatches OTP payload to Flow API and returns messageId', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      const mockFetch: typeof fetch = async (input, init) => {
        capturedUrl = input.toString();
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'success',
            message: 'msg91-flow-request-id-998877',
          }),
        } as Response;
      };

      const provider = new Msg91SmsProvider(
        {
          authKey: 'secure_msg91_auth_key',
          flowId: 'FLOW_TEMPLATE_REGISTRATION_ID',
        },
        mockFetch
      );

      const result = await provider.sendOtp('+919876543210', '654321', 'REGISTRATION');

      assert.equal(result.success, true);
      assert.equal(result.messageId, 'msg91-flow-request-id-998877');
      assert.equal(capturedUrl, 'https://control.msg91.com/api/v5/flow/');
      assert.equal(capturedHeaders.authkey, 'secure_msg91_auth_key');
      assert.equal(capturedBody.template_id, 'FLOW_TEMPLATE_REGISTRATION_ID');
      assert.equal(capturedBody.recipients[0].mobiles, '919876543210');
      assert.equal(capturedBody.recipients[0].otp, '654321');
    });

    it('Handles MSG91 Flow API rejection (e.g. invalid template or DLT error)', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            type: 'error',
            message: 'Template ID does not exist or DLT not approved',
          }),
        } as Response);

      const provider = new Msg91SmsProvider(
        {
          authKey: 'valid_key',
          flowId: 'invalid_flow',
        },
        mockFetch
      );

      const result = await provider.sendOtp('+919876543210', '123456', 'LOGIN');
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('Template ID does not exist or DLT not approved'));
    });

    it('Handles HTTP 401 unauthorized error gracefully', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({
            message: 'Invalid Auth Key',
          }),
        } as Response);

      const provider = new Msg91SmsProvider(
        {
          authKey: 'bad_auth_key',
          flowId: 'flow_id',
        },
        mockFetch
      );

      const result = await provider.sendOtp('+919876543210', '123456', 'REGISTRATION');
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('Invalid Auth Key'));
    });

    it('Handles network timeout / abort cleanly without crashing', async () => {
      const mockFetch: typeof fetch = async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      };

      const provider = new Msg91SmsProvider(
        {
          authKey: 'auth_key',
          flowId: 'flow_id',
        },
        mockFetch
      );

      const result = await provider.sendOtp('+919876543210', '123456', 'REGISTRATION');
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('aborted'));
    });
  });

  describe('4. Msg91SmsProvider Dedicated OTP API Dispatch (Mocked HTTP)', () => {
    it('Calls OTP API with correct query parameters when dltTemplateId is provided', async () => {
      let capturedUrl = '';

      const mockFetch: typeof fetch = async (input) => {
        capturedUrl = input.toString();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: 'otp-req-id-12345',
            type: 'success',
          }),
        } as Response;
      };

      const provider = new Msg91SmsProvider(
        {
          authKey: 'my_auth_key',
          dltTemplateId: 'DLT_TE_1107161234567890123',
        },
        mockFetch
      );

      const result = await provider.sendOtp('+919876543210', '999888', 'REGISTRATION');
      assert.equal(result.success, true);
      assert.equal(result.messageId, 'otp-req-id-12345');
      assert.ok(capturedUrl.includes('https://control.msg91.com/api/v5/otp'));
      assert.ok(capturedUrl.includes('template_id=DLT_TE_1107161234567890123'));
      assert.ok(capturedUrl.includes('mobile=919876543210'));
      assert.ok(capturedUrl.includes('authkey=my_auth_key'));
      assert.ok(capturedUrl.includes('otp=999888'));
    });
  });

  describe('5. MockSmsProvider for Deterministic Local & CI Testing', () => {
    it('Records sent OTPs in memory and allows retrieval without network', async () => {
      const mock = new MockSmsProvider();
      const res = await mock.sendOtp('+919876543210', '778899', 'REGISTRATION');

      assert.equal(res.success, true);
      assert.ok(res.messageId?.startsWith('mock-sms-'));

      const lastOtp = mock.getLastOtp('+919876543210');
      assert.equal(lastOtp, '778899');
      assert.equal(mock.getSentMessages().length, 1);
    });

    it('Supports configurable simulated failure to verify error handling paths', async () => {
      const mock = new MockSmsProvider();
      mock.setFailureMode(true, 'Simulated DLT template mismatch');

      const res = await mock.sendOtp('+919876543210', '778899', 'LOGIN');
      assert.equal(res.success, false);
      assert.equal(res.error, 'Simulated DLT template mismatch');
    });
  });

  describe('6. getSmsProvider Factory & Injection', () => {
    it('Allows registering a mock provider for isolated test runs', () => {
      const mock = new MockSmsProvider();
      setSmsProviderForTesting(mock);

      const active = getSmsProvider();
      assert.equal(active.name, 'MockSmsProvider');
      assert.equal(active, mock);
    });

    it('Restores default provider resolution when reset to null', () => {
      const mock = new MockSmsProvider();
      setSmsProviderForTesting(mock);
      setSmsProviderForTesting(null);

      const active = getSmsProvider();
      assert.notEqual(active, mock);
    });
  });
});
