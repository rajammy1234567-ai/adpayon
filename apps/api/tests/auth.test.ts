import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import mongoose from 'mongoose';
import { app } from '../src/app';
import { User, AuthSession, OTPChallenge, AuthSecurityEvent } from '../src/models';
import { DevOtpProvider } from '../src/services/sms/devOtpProvider';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Authentication & Session Management Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  // Distinct synthetic phone numbers dedicated exclusively to this test run
  const runId = Math.floor(10000 + Math.random() * 90000);
  const TEST_PREFIX = `+918${runId}`;
  const testMobile1 = `${TEST_PREFIX}1111`;
  const testMobile2 = `${TEST_PREFIX}2222`;
  const testPassword = 'Password@123456';

  before(async () => {
    // 1. Strict Isolation Check: Must connect to disposable test database, NEVER adpayon_dev
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Auth Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start ephemeral HTTP server only if test database isolation is guaranteed
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (isSuiteBlocked) {
      return;
    }

    // Purge ONLY tracked test-owned documents via exact IDs; NEVER broad regexes or dropDatabase
    await tracker.safeCleanup();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. POST /api/auth/register creates user in PENDING_VERIFICATION and issues no JWT', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Candidate',
        mobile: testMobile1.replace('+91', ''),
        password: testPassword,
        acceptTerms: true,
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'PENDING_VERIFICATION');
    assert.equal(body.data.mobile, testMobile1);

    // Crucial security invariant: Ensure no JWT tokens are returned before OTP verification
    assert.equal(body.data.accessToken, undefined);
    assert.equal(body.data.tokens, undefined);

    // Track test-owned record
    const userInDb = await User.findOne({ mobile: testMobile1 });
    assert.ok(userInDb);
    assert.equal(userInDb.status, 'PENDING_VERIFICATION');
    tracker.trackUser(userInDb._id, testMobile1);
  });

  it('2. POST /api/auth/register rejects duplicate mobile number (HTTP 409)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // First, activate the user so it's a conflict
    await User.updateOne({ mobile: testMobile1 }, { $set: { status: 'ACTIVE' } });

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Candidate',
        mobile: testMobile1.replace('+91', ''),
        password: testPassword,
        acceptTerms: true,
      }),
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'MOBILE_EXISTS');
  });

  it('3. POST /api/auth/register rejects invalid sponsor referral code (HTTP 400)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sponsor Test',
        mobile: testMobile2.replace('+91', ''),
        password: testPassword,
        sponsorReferralCode: 'NON_EXISTENT_REF_999',
        acceptTerms: true,
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_SPONSOR');
  });

  it('4. Dev OTP provider issues test OTP and allows loopback retrieval via GET /api/dev/otp/:mobile', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Re-register testMobile2
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OTP User',
        mobile: testMobile2.replace('+91', ''),
        password: testPassword,
        acceptTerms: true,
      }),
    });

    const userInDb = await User.findOne({ mobile: testMobile2 });
    if (userInDb) {
      tracker.trackUser(userInDb._id, testMobile2);
    }

    // Query loopback dev OTP endpoint
    const res = await fetch(`${baseUrl}/api/dev/otp/${testMobile2}`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.mobile, testMobile2);
    assert.equal(typeof body.otp, 'string');
    assert.equal(body.otp.length, 6);
  });

  it('5. POST /api/auth/otp/verify rejects invalid OTP with attempt tracking', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: testMobile2,
        otp: '000000', // Invalid code
        purpose: 'REGISTRATION',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_OTP');
    assert.equal(typeof body.error.attemptsRemaining, 'number');
  });

  let validAccessToken: string;
  let validRefreshToken: string;

  it('6. POST /api/auth/otp/verify with valid OTP activates account and issues JWT + Refresh tokens', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const devOtp = DevOtpProvider.getActiveDevOtp(testMobile2);
    assert.ok(devOtp);

    const res = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: testMobile2,
        otp: devOtp,
        purpose: 'REGISTRATION',
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.data.tokens.accessToken);
    assert.ok(body.data.tokens.refreshToken);
    assert.equal(body.data.user.status, 'ACTIVE');

    validAccessToken = body.data.tokens.accessToken;
    validRefreshToken = body.data.tokens.refreshToken;

    // Verify DB user is now ACTIVE
    const userInDb = await User.findOne({ mobile: testMobile2 });
    assert.equal(userInDb?.status, 'ACTIVE');
  });

  it('7. Single-use replay protection: Reusing verified OTP is rejected (HTTP 400)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const devOtp = DevOtpProvider.getActiveDevOtp(testMobile2);

    const res = await fetch(`${baseUrl}/api/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: testMobile2,
        otp: devOtp || '123456',
        purpose: 'REGISTRATION',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
  });

  it('8. POST /api/auth/login rejects incorrect password (HTTP 401)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: testMobile2,
        password: 'WrongPassword999',
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('9. POST /api/auth/login succeeds with correct password and returns tokens', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: testMobile2,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.data.tokens.accessToken);
    assert.ok(body.data.tokens.refreshToken);
    assert.equal(body.data.user.mobile, testMobile2);

    // Save tokens for next test
    validAccessToken = body.data.tokens.accessToken;
    validRefreshToken = body.data.tokens.refreshToken;
  });

  it('10. GET /api/auth/me returns sanitized user profile without passwordHash', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${validAccessToken}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.user.mobile, testMobile2);
    assert.equal(body.data.user.passwordHash, undefined); // Sensitive field omitted!
  });

  let secondRefreshToken: string;

  it('11. POST /api/auth/refresh rotates refresh token and returns new token pair', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: validRefreshToken,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.data.tokens.accessToken);
    assert.ok(body.data.tokens.refreshToken);
    assert.notEqual(body.data.tokens.refreshToken, validRefreshToken);

    secondRefreshToken = body.data.tokens.refreshToken;
  });

  it('12. Token reuse detection: Presenting already-rotated refresh token revokes entire family', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Replay first refresh token (which was already rotated)
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: validRefreshToken, // Already revoked!
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'TOKEN_REUSE_DETECTED');

    // Verify that the second token in that family is now also revoked!
    const secondRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: secondRefreshToken,
      }),
    });

    assert.equal(secondRes.status, 401);
  });

  it('13. Suspended account rejection: Suspended user cannot log in (HTTP 403)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    await User.updateOne({ mobile: testMobile2 }, { $set: { status: 'SUSPENDED' } });

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: testMobile2,
        password: testPassword,
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'ACCOUNT_SUSPENDED');
  });

  it('14. POST /api/auth/logout succeeds and revokes session', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: secondRefreshToken,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
  });
});
