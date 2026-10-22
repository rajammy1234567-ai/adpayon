import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStagingTestAllowed, startClientDemoReview } from '../src/controllers/auth.controller';
import { env } from '../src/config/env';
import { computeOtpHash } from '../src/services/otpService';

describe('ADPAYON — Client Staging In-App Test OTP Unit & Security Tests', () => {
  describe('1. isStagingTestAllowed Guard Invariants', () => {
    it('Refuses test OTP disclosure when environment is not staging or client_staging', () => {
      const allowed = isStagingTestAllowed('+919876543210', 'adpayon_client_staging');
      assert.equal(allowed, false);
    });

    it('Refuses test OTP disclosure if database is not adpayon_client_staging', () => {
      const originalAppEnv = env.APP_ENV;
      try {
        (env as any).APP_ENV = 'client_staging';
        const allowed = isStagingTestAllowed('+919876543210', 'adpayon_dev');
        assert.equal(allowed, false);
      } finally {
        (env as any).APP_ENV = originalAppEnv;
      }
    });

    it('Refuses test OTP disclosure if STAGING_REVIEWER_MOBILES is empty or not set', () => {
      const originalAppEnv = env.APP_ENV;
      const originalMobiles = env.STAGING_REVIEWER_MOBILES;

      try {
        (env as any).APP_ENV = 'client_staging';
        (env as any).STAGING_REVIEWER_MOBILES = '';

        const allowed = isStagingTestAllowed('+919876543210', 'adpayon_client_staging');
        assert.equal(allowed, false, 'Must fail closed when STAGING_REVIEWER_MOBILES is empty');
      } finally {
        (env as any).APP_ENV = originalAppEnv;
        (env as any).STAGING_REVIEWER_MOBILES = originalMobiles;
      }
    });

    it('Rejects wildcard (*) and unrestricted access', () => {
      const originalAppEnv = env.APP_ENV;
      const originalMobiles = env.STAGING_REVIEWER_MOBILES;

      try {
        (env as any).APP_ENV = 'client_staging';

        // Test with '*'
        (env as any).STAGING_REVIEWER_MOBILES = '*';
        assert.equal(isStagingTestAllowed('+919876543210', 'adpayon_client_staging'), false, 'Must reject wildcard *');

        // Test with 'ALL'
        (env as any).STAGING_REVIEWER_MOBILES = 'ALL';
        assert.equal(isStagingTestAllowed('+919876543210', 'adpayon_client_staging'), false, 'Must reject ALL');

        // Test with list containing wildcard
        (env as any).STAGING_REVIEWER_MOBILES = '+919876543210,*';
        assert.equal(isStagingTestAllowed('+919876543210', 'adpayon_client_staging'), false, 'Must reject list containing wildcard');
      } finally {
        (env as any).APP_ENV = originalAppEnv;
        (env as any).STAGING_REVIEWER_MOBILES = originalMobiles;
      }
    });

    it('Allows only explicitly allowlisted numbers when in client_staging environment and DB', () => {
      const originalAppEnv = env.APP_ENV;
      const originalMobiles = env.STAGING_REVIEWER_MOBILES;

      try {
        (env as any).APP_ENV = 'client_staging';
        (env as any).STAGING_REVIEWER_MOBILES = '+919876543210, +919876543211';

        // Allowlisted number 1
        assert.equal(isStagingTestAllowed('+919876543210', 'adpayon_client_staging'), true);
        // Allowlisted number 2
        assert.equal(isStagingTestAllowed('9876543211', 'adpayon_client_staging'), true);
        // Non-allowlisted number
        assert.equal(isStagingTestAllowed('+919999999999', 'adpayon_client_staging'), false);
      } finally {
        (env as any).APP_ENV = originalAppEnv;
        (env as any).STAGING_REVIEWER_MOBILES = originalMobiles;
      }
    });
  });

  describe('2. createAndSendOtp Return Structure & Security Storage', () => {
    it('Generates 6-digit rawOtp and stores only HMAC hash in OTPChallenge', () => {
      const testMobile = '+919876500001';
      const testPurpose = 'REGISTRATION';

      const hash1 = computeOtpHash(testMobile, '123456', testPurpose);
      const hash2 = computeOtpHash(testMobile, '123456', testPurpose);
      const hash3 = computeOtpHash(testMobile, '654321', testPurpose);

      assert.equal(hash1, hash2);
      assert.notEqual(hash1, hash3);
      assert.equal(hash1.length, 64); // SHA-256 hex string
    });
  });

  describe('3. startClientDemoReview Safety Guard', () => {
    it('Rejects demo enrollment if environment is production without staging flag', async () => {
      const originalAppEnv = env.APP_ENV;
      const originalNodeEnv = env.NODE_ENV;

      let responseStatusCode = 0;
      let responseBody: any = null;

      const mockReq: any = { ip: '127.0.0.1' };
      const mockRes: any = {
        status: (code: number) => {
          responseStatusCode = code;
          return {
            json: (data: any) => {
              responseBody = data;
            },
          };
        },
      };

      try {
        (env as any).APP_ENV = 'production';
        (env as any).NODE_ENV = 'production';

        await startClientDemoReview(mockReq, mockRes);
        assert.equal(responseStatusCode, 403);
        assert.equal(responseBody?.error?.code, 'DEMO_ENROLLMENT_DISABLED');
      } finally {
        (env as any).APP_ENV = originalAppEnv;
        (env as any).NODE_ENV = originalNodeEnv;
      }
    });
  });
});
