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
});
