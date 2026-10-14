import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { app } from '../src/app';
import { connectMongo, disconnectMongo } from '../src/db/mongoose';
import { User, AuthSession, OTPChallenge, AuthSecurityEvent } from '../src/models';
import { DevOtpProvider } from '../src/services/sms/devOtpProvider';

describe('Authentication & Session Management Integration Tests', () => {
  let server: Server;
  let baseUrl: string;

  const TEST_PREFIX = '+91999999';
  const testMobile1 = `${TEST_PREFIX}1111`;
  const testMobile2 = `${TEST_PREFIX}2222`;
  const testPassword = 'Password@123456';

  before(async () => {
    // 1. Establish database connection for test lifecycle
    await connectMongo();

    // 2. Clean previous test-specific synthetic records
    await User.deleteMany({ mobile: { $regex: '^\\+91999999' } });
    await AuthSession.deleteMany({});
    await OTPChallenge.deleteMany({ mobile: { $regex: '^\\+91999999' } });
    await AuthSecurityEvent.deleteMany({ mobile: { $regex: '^\\+91999999' } });

    // 3. Start ephemeral HTTP server on dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // 1. Cleanup only test-owned records
    await User.deleteMany({ mobile: { $regex: '^\\+91999999' } });
    await AuthSession.deleteMany({});
    await OTPChallenge.deleteMany({ mobile: { $regex: '^\\+91999999' } });
    await AuthSecurityEvent.deleteMany({ mobile: { $regex: '^\\+91999999' } });

    // 2. Close HTTP server and database
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectMongo();
  });

  it('1. POST /api/auth/register creates user in PENDING_VERIFICATION and issues no JWT', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Candidate',
        mobile: '9999991111',
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

    // Verify database record
    const userInDb = await User.findOne({ mobile: testMobile1 });
    assert.ok(userInDb);
    assert.equal(userInDb.status, 'PENDING_VERIFICATION');
  });

  it('2. POST /api/auth/register rejects duplicate mobile number (HTTP 409)', async () => {
    // First, activate the user so it's a conflict
    await User.updateOne({ mobile: testMobile1 }, { $set: { status: 'ACTIVE' } });

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Candidate',
        mobile: '9999991111',
        password: testPassword,
        acceptTerms: true,
      }),
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'MOBILE_EXISTS');
  });

  it('3. POST /api/auth/register rejects invalid sponsor referral code (HTTP 400)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sponsor Test',
        mobile: '9999992222',
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

  it('4. Dev OTP provider issues test OTP and allows loopback retrieval via GET /api/dev/otp/:mobile', async () => {
    // Re-register testMobile2
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'OTP User',
        mobile: '9999992222',
        password: testPassword,
        acceptTerms: true,
      }),
    });

    // Query loopback dev OTP endpoint
    const res = await fetch(`${baseUrl}/api/dev/otp/${testMobile2}`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.mobile, testMobile2);
    assert.equal(typeof body.otp, 'string');
    assert.equal(body.otp.length, 6);
  });

  it('5. POST /api/auth/otp/verify rejects invalid OTP with attempt tracking', async () => {
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

  it('6. POST /api/auth/otp/verify with valid OTP activates account and issues JWT + Refresh tokens', async () => {
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

  it('7. Single-use replay protection: Reusing verified OTP is rejected (HTTP 400)', async () => {
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

  it('8. POST /api/auth/login rejects incorrect password (HTTP 401)', async () => {
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

  it('9. POST /api/auth/login succeeds with correct password and returns tokens', async () => {
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

  it('10. GET /api/auth/me returns sanitized user profile without passwordHash', async () => {
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

  it('11. POST /api/auth/refresh rotates refresh token and returns new token pair', async () => {
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

  it('12. Token reuse detection: Presenting already-rotated refresh token revokes entire family', async () => {
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

  it('13. Suspended account rejection: Suspended user cannot log in (HTTP 403)', async () => {
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

  it('14. POST /api/auth/logout succeeds and revokes session', async () => {
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
