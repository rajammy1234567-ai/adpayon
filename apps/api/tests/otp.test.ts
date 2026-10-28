import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeOtpHash } from '../src/services/otpService';
import { DevOtpProvider } from '../src/services/sms/devOtpProvider';

describe('OTP and DevOtpProvider Tests', () => {
  it('1. Computes deterministic HMAC-SHA256 for identical inputs', () => {
    const hash1 = computeOtpHash('+919876543210', '123456', 'REGISTRATION');
    const hash2 = computeOtpHash('+919876543210', '123456', 'REGISTRATION');
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  it('2. Computes different hashes for different OTPs or purposes', () => {
    const hash1 = computeOtpHash('+919876543210', '123456', 'REGISTRATION');
    const hash2 = computeOtpHash('+919876543210', '654321', 'REGISTRATION');
    const hash3 = computeOtpHash('+919876543210', '123456', 'LOGIN');
    assert.notEqual(hash1, hash2);
    assert.notEqual(hash1, hash3);
  });

  it('3. DevOtpProvider caches generated OTP in memory for local dev inspection', async () => {
    const provider = new DevOtpProvider();
    const testMobile = '+919999990099';
    const testOtp = '849201';

    const sendRes = await provider.sendOtp(testMobile, testOtp, 'REGISTRATION');
    assert.equal(sendRes.success, true);
    assert.ok(sendRes.messageId);

    const retrieved = DevOtpProvider.getActiveDevOtp(testMobile);
    assert.equal(retrieved, testOtp);

    DevOtpProvider.clearDevOtp(testMobile);
    assert.equal(DevOtpProvider.getActiveDevOtp(testMobile), null);
  });

  it('4. TerminalOtpProvider dispatches to stdout for allowlisted test admin in sandbox/dev', async () => {
    const { TerminalOtpProvider } = await import('../src/services/sms/terminalOtpProvider');
    const provider = new TerminalOtpProvider({
      enabled: true,
      allowlistedMobiles: ['+919876543210'],
    });

    const res = await provider.sendOtp('+919876543210', '654321', 'LOGIN');
    assert.equal(res.success, true);
    assert.ok(res.messageId);
  });

  it('5. TerminalOtpProvider strictly rejects non-allowlisted mobile numbers', async () => {
    const { TerminalOtpProvider } = await import('../src/services/sms/terminalOtpProvider');
    const provider = new TerminalOtpProvider({
      enabled: true,
      allowlistedMobiles: ['+919876543210'],
    });

    const res = await provider.sendOtp('+919999999999', '654321', 'LOGIN');
    assert.equal(res.success, false);
    assert.match(res.error || '', /not authorized/i);
  });

  it('6. TerminalOtpProvider refuses activation when disabled', async () => {
    const { TerminalOtpProvider } = await import('../src/services/sms/terminalOtpProvider');
    const provider = new TerminalOtpProvider({
      enabled: false,
      allowlistedMobiles: ['+919876543210'],
    });

    const res = await provider.sendOtp('+919876543210', '654321', 'LOGIN');
    assert.equal(res.success, false);
    assert.match(res.error || '', /disabled/i);
  });

  it('7. TerminalOtpProvider cannot activate in production or staging environments', async () => {
    const { TerminalOtpProvider } = await import('../src/services/sms/terminalOtpProvider');
    const { env } = await import('../src/config/env');

    // Simulate production environment
    const originalEnv = env.NODE_ENV;
    try {
      (env as any).NODE_ENV = 'production';
      assert.throws(
        () => new TerminalOtpProvider({ enabled: true, allowlistedMobiles: ['+919876543210'] }),
        /SECURITY VIOLATION.*strictly prohibited in environment/i
      );
    } finally {
      (env as any).NODE_ENV = originalEnv;
    }

    // Simulate client_staging environment
    const originalAppEnv = env.APP_ENV;
    try {
      (env as any).APP_ENV = 'client_staging';
      assert.throws(
        () => new TerminalOtpProvider({ enabled: true, allowlistedMobiles: ['+919876543210'] }),
        /SECURITY VIOLATION.*strictly prohibited in environment/i
      );
    } finally {
      (env as any).APP_ENV = originalAppEnv;
    }
  });
});

