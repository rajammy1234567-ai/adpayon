import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptOtpForStaging,
  decryptOtpForStaging,
  StagingManualOtpProvider,
} from '../src/services/sms/stagingManualOtpProvider';

describe('ADPAYON — Staging Manual Reviewer OTP Suite', () => {
  const validSecret = '12345678901234567890123456789012'; // 32 chars
  const allowlistedNumbers = ['+919999901001', '+919999901002'];

  describe('1. AES-256-GCM Cryptographic Envelope Integrity', () => {
    it('Encrypts and decrypts 6-digit OTP cleanly', () => {
      const rawOtp = '482910';
      const envelope = encryptOtpForStaging(rawOtp, validSecret);

      assert.ok(envelope.ciphertext);
      assert.ok(envelope.iv);
      assert.ok(envelope.tag);
      assert.notEqual(envelope.ciphertext, rawOtp);

      const decrypted = decryptOtpForStaging(envelope, validSecret);
      assert.equal(decrypted, rawOtp);
    });

    it('Fails decryption if ciphertext or authentication tag is tampered', () => {
      const rawOtp = '482910';
      const envelope = encryptOtpForStaging(rawOtp, validSecret);

      // Tamper ciphertext
      const tamperedEnvelope = {
        ...envelope,
        ciphertext: '00' + envelope.ciphertext.slice(2),
      };

      assert.throws(
        () => decryptOtpForStaging(tamperedEnvelope, validSecret),
        /Unsupported state or unable to authenticate data/
      );
    });

    it('Fails decryption if secret key is incorrect', () => {
      const rawOtp = '482910';
      const envelope = encryptOtpForStaging(rawOtp, validSecret);
      const wrongSecret = 'abcdefabcdefabcdefabcdefabcdefab'; // 32 chars

      assert.throws(
        () => decryptOtpForStaging(envelope, wrongSecret),
        /Unsupported state or unable to authenticate data/
      );
    });
  });

  describe('2. Provider Authorization & Allowlist Guards', () => {
    it('Rejects constructor if operatorSecret is less than 32 characters', () => {
      assert.throws(
        () => new StagingManualOtpProvider({ operatorSecret: 'short_key', allowlistedMobiles: allowlistedNumbers }),
        /operatorSecret of at least 32 characters/
      );
    });

    it('Strictly rejects non-allowlisted / public phone numbers', async () => {
      const provider = new StagingManualOtpProvider({
        operatorSecret: validSecret,
        allowlistedMobiles: allowlistedNumbers,
      });

      const publicUserMobile = '+919876543210';
      const result = await provider.sendOtp(publicUserMobile, '123456', 'REGISTRATION');

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('restricted to authorized staging reviewers'));
    });

    it('Normalizes allowlist matching across whitespace, parens, and dashes', async () => {
      const provider = new StagingManualOtpProvider({
        operatorSecret: validSecret,
        allowlistedMobiles: ['+91 99999-01001'],
      });

      // Target with standard E.164
      const target = '+919999901001';
      // In non-staging unit test, environment guard will fail closed, but allowlist check passes first
      const res = await provider.sendOtp(target, '123456', 'REGISTRATION');
      // If environment guard blocks, error is environment, NOT allowlist
      assert.ok(
        res.error?.includes('Manual OTP testing is strictly disabled in this environment') ||
        res.error?.includes('restricted to staging database')
      );
    });
  });
});
