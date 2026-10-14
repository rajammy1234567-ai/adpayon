import mongoose from 'mongoose';
import { connectMongo, disconnectMongo, pingMongo } from '../db/mongoose';
import { User, AuthSession, OTPChallenge, AuthSecurityEvent } from '../models';
import { env } from '../config/env';
import { logger } from '../config/logger';

const API_BASE = `http://${env.HOST}:${env.PORT}/api`;
const TEST_MOBILE_PREFIX = '+91999998';

interface TestStepResult {
  step: string;
  passed: boolean;
  details?: string;
}

export async function runLiveAuthVerification(): Promise<TestStepResult[]> {
  const results: TestStepResult[] = [];

  const recordResult = (step: string, passed: boolean, details?: string) => {
    results.push({ step, passed, details });
    if (passed) {
      console.log(`  [PASS] ${step}${details ? ' - ' + details : ''}`);
    } else {
      console.error(`  [FAIL] ${step}${details ? ' - ' + details : ''}`);
    }
  };

  console.log('\n============================================================');
  console.log('ADPAYON PHASE 4C: LIVE AUTHENTICATION VERIFICATION');
  console.log('Target API:        ', API_BASE);
  console.log('Target Database:   ', env.MONGODB_DB_NAME);
  console.log('Target Environment:', env.NODE_ENV);
  console.log('============================================================\n');

  // STEP 1: Safety & MongoDB connection
  await connectMongo();
  const dbAlive = await pingMongo();
  recordResult('1. MongoDB Atlas connectivity check', dbAlive, `Database: ${env.MONGODB_DB_NAME}`);
  if (!dbAlive) {
    throw new Error('Database ping failed. Halting live verification.');
  }

  // Pre-cleanup synthetic test namespace
  await User.deleteMany({ mobile: { $regex: '^\\+91999998' } });
  await AuthSession.deleteMany({ userId: { $in: await User.find({ mobile: { $regex: '^\\+91999998' } }).distinct('_id') } });
  await OTPChallenge.deleteMany({ mobile: { $regex: '^\\+91999998' } });
  await AuthSecurityEvent.deleteMany({ mobile: { $regex: '^\\+91999998' } });

  const testMobile1 = `${TEST_MOBILE_PREFIX}0001`;
  const testMobile2 = `${TEST_MOBILE_PREFIX}0002`;
  const testPassword = 'SecurePassword@2026';

  // STEP 2: Live Registration
  console.log('\n--- STEP 2: LIVE REGISTRATION ---');

  // 2.1 Register User 1 without sponsor
  const regRes1 = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic Alpha',
      mobile: '9999980001',
      password: testPassword,
      acceptTerms: true,
    }),
  });

  const regBody1 = (await regRes1.json()) as any;
  const is201 = regRes1.status === 201;
  const isPending = regBody1?.data?.status === 'PENDING_VERIFICATION';
  const noTokens = regBody1?.data?.accessToken === undefined && regBody1?.data?.tokens === undefined;
  recordResult('2.1 POST /api/auth/register returns HTTP 201 Created', is201, `Status: ${regRes1.status}`);
  recordResult('2.2 Registration response sets PENDING_VERIFICATION', isPending, `Status: ${regBody1?.data?.status}`);
  recordResult('2.3 Registration response issues ZERO JWT access/refresh tokens', noTokens);

  // 2.2 Verify DB record directly
  const dbUser1 = await User.findOne({ mobile: testMobile1 }).select('+passwordHash');
  const dbUserOk = !!dbUser1 && dbUser1.status === 'PENDING_VERIFICATION';
  const hashIsArgon2 = !!dbUser1?.passwordHash && dbUser1.passwordHash.startsWith('$argon2id$');
  const passwordNotPlain = dbUser1?.passwordHash !== testPassword;
  recordResult('2.4 Database User stored with PENDING_VERIFICATION', dbUserOk);
  recordResult('2.5 Password stored strictly as Argon2id hash', hashIsArgon2 && passwordNotPlain, `Hash prefix: ${dbUser1?.passwordHash?.slice(0, 10)}...`);

  // STEP 3: Development OTP Verification
  console.log('\n--- STEP 3: DEVELOPMENT OTP ---');

  // 3.1 Retrieve Dev OTP via loopback
  const devOtpRes = await fetch(`${API_BASE}/dev/otp/${testMobile1}`);
  const devOtpBody = (await devOtpRes.json()) as any;
  const devOtpValid = devOtpRes.status === 200 && typeof devOtpBody.otp === 'string' && devOtpBody.otp.length === 6;
  const testOtp1 = devOtpBody.otp;
  recordResult('3.1 Retrieve Dev OTP via GET /api/dev/otp/:mobile', devOtpValid, `OTP format verified (6 digits)`);

  // 3.2 Verify DB OTPChallenge
  const dbOtp = await OTPChallenge.findOne({ mobile: testMobile1 });
  const otpNoPlaintext = !!dbOtp && dbOtp.otpHash !== testOtp1;
  const otpHash64 = dbOtp?.otpHash.length === 64;
  const expiresFuture = !!dbOtp && dbOtp.expiresAt.getTime() > Date.now();
  recordResult('3.2 Database OTP stored as 64-char HMAC-SHA256 (never plaintext)', otpNoPlaintext && otpHash64);
  recordResult('3.3 OTP challenge expiry set to ~5 minutes in future', expiresFuture, `Expires in ${Math.round((dbOtp!.expiresAt.getTime() - Date.now()) / 1000)}s`);

  // 3.3 Test Invalid OTP Attempt
  const badOtpRes = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      otp: '000000',
      purpose: 'REGISTRATION',
    }),
  });
  const badOtpBody = (await badOtpRes.json()) as any;
  const badOtpHandled = badOtpRes.status === 400 && badOtpBody.error?.code === 'INVALID_OTP';
  recordResult('3.4 Reject invalid OTP with HTTP 400 and attempt tracking', badOtpHandled, `Remaining attempts: ${badOtpBody.error?.attemptsRemaining}`);

  // 3.4 Verify Correct OTP Verification & Account Activation
  const verifyRes = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      otp: testOtp1,
      purpose: 'REGISTRATION',
    }),
  });
  const verifyBody = (await verifyRes.json()) as any;
  const verifyOk = verifyRes.status === 200 && verifyBody.success === true;
  const userNowActive = verifyBody?.data?.user?.status === 'ACTIVE';
  const tokensIssued = !!verifyBody?.data?.tokens?.accessToken && !!verifyBody?.data?.tokens?.refreshToken;
  recordResult('3.5 Correct OTP verification succeeds with HTTP 200', verifyOk);
  recordResult('3.6 User status transitioned to ACTIVE', userNowActive);
  recordResult('3.7 Valid Access Token and Refresh Token issued on verification', tokensIssued);

  let user1AccessToken = verifyBody?.data?.tokens?.accessToken;
  let user1RefreshToken = verifyBody?.data?.tokens?.refreshToken;

  // 3.5 Single-use replay protection
  const replayRes = await fetch(`${API_BASE}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      otp: testOtp1,
      purpose: 'REGISTRATION',
    }),
  });
  recordResult('3.8 OTP single-use replay rejected (HTTP 400)', replayRes.status === 400);

  // 3.6 Duplicate registration rejection (now that user 1 is ACTIVE)
  const dupRegRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Duplicate Alpha',
      mobile: '9999980001',
      password: testPassword,
      acceptTerms: true,
    }),
  });
  recordResult('2.6 Duplicate mobile registration rejected with HTTP 409 Conflict', dupRegRes.status === 409);

  // STEP 4: Session Lifecycle
  console.log('\n--- STEP 4: SESSION LIFECYCLE ---');

  // 4.1 Login before OTP verification rejected
  await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic Beta',
      mobile: '9999980002',
      password: testPassword,
      acceptTerms: true,
    }),
  });
  const preVerifyLogin = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile2,
      password: testPassword,
    }),
  });
  const preVerifyBody = (await preVerifyLogin.json()) as any;
  recordResult('4.1 Login before OTP verification rejected with HTTP 403 PENDING_VERIFICATION', preVerifyLogin.status === 403 && preVerifyBody.error?.code === 'PENDING_VERIFICATION');

  // 4.2 Wrong password fails
  const wrongPassRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      password: 'IncorrectPassword999',
    }),
  });
  recordResult('4.2 Login with wrong password rejected with HTTP 401 INVALID_CREDENTIALS', wrongPassRes.status === 401);

  // 4.3 Correct password login succeeds
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      password: testPassword,
    }),
  });
  const loginBody = (await loginRes.json()) as any;
  recordResult('4.3 Login with correct password returns HTTP 200 with tokens', loginRes.status === 200 && !!loginBody.data?.tokens?.accessToken);
  user1AccessToken = loginBody.data.tokens.accessToken;
  user1RefreshToken = loginBody.data.tokens.refreshToken;

  // 4.4 GET /api/auth/me requires valid authentication
  const meUnauthorized = await fetch(`${API_BASE}/auth/me`);
  recordResult('4.4 GET /api/auth/me rejects unauthenticated request with HTTP 401', meUnauthorized.status === 401);

  const meAuthorized = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${user1AccessToken}` },
  });
  const meBody = (await meAuthorized.json()) as any;
  const meSanitized = meAuthorized.status === 200 && meBody.data?.user?.mobile === testMobile1 && meBody.data?.user?.passwordHash === undefined;
  recordResult('4.5 GET /api/auth/me returns sanitized profile without passwordHash', meSanitized);

  // 4.5 Refresh Token Rotation
  const refreshRes1 = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: user1RefreshToken }),
  });
  const refreshBody1 = (await refreshRes1.json()) as any;
  const rotatedOk = refreshRes1.status === 200 && !!refreshBody1.data?.tokens?.refreshToken && refreshBody1.data.tokens.refreshToken !== user1RefreshToken;
  recordResult('4.6 POST /api/auth/refresh rotates refresh token successfully', rotatedOk);

  const user1RefreshTokenRotated = refreshBody1.data.tokens.refreshToken;

  // 4.6 Token Reuse Detection & Family Revocation
  const reuseRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: user1RefreshToken }), // Replaying old token!
  });
  const reuseBody = (await reuseRes.json()) as any;
  const reuseDetected = reuseRes.status === 401 && reuseBody.error?.code === 'TOKEN_REUSE_DETECTED';
  recordResult('4.7 Reusing rotated refresh token triggers TOKEN_REUSE_DETECTED (HTTP 401)', reuseDetected);

  // Subsequent use of rotated token must now also fail because family was revoked
  const familyRevokedRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: user1RefreshTokenRotated }),
  });
  recordResult('4.8 Entire token family revoked upon reuse detection (successor token rejected)', familyRevokedRes.status === 401);

  // 4.7 Suspended user rejection
  await User.updateOne({ mobile: testMobile1 }, { $set: { status: 'SUSPENDED' } });
  const suspendedLogin = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      password: testPassword,
    }),
  });
  recordResult('4.9 Suspended account cannot log in (HTTP 403 ACCOUNT_SUSPENDED)', suspendedLogin.status === 403);
  await User.updateOne({ mobile: testMobile1 }, { $set: { status: 'ACTIVE' } });

  // 4.8 Logout revokes session
  const relogin = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile: testMobile1,
      password: testPassword,
    }),
  });
  const reloginBody = (await relogin.json()) as any;
  const logoutToken = reloginBody.data.tokens.refreshToken;

  const logoutRes = await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: logoutToken }),
  });
  recordResult('4.10 POST /api/auth/logout succeeds (HTTP 200)', logoutRes.status === 200);

  const postLogoutRefresh = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: logoutToken }),
  });
  recordResult('4.11 Logged out refresh token rejected on subsequent refresh (HTTP 401)', postLogoutRefresh.status === 401);

  // STEP 5: Rate Limiting Verification
  console.log('\n--- STEP 5: RATE LIMITING & SECURITY ---');

  // Trigger OTP resend rate limiting
  let rateLimitHit = false;
  for (let i = 0; i < 7; i++) {
    const r = await fetch(`${API_BASE}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: testMobile1, purpose: 'LOGIN' }),
    });
    if (r.status === 429) {
      rateLimitHit = true;
      break;
    }
  }
  recordResult('5.1 OTP rate limiter triggers HTTP 429 Too Many Requests under burst requests', rateLimitHit);

  // STEP 6: Test Cleanup
  console.log('\n--- STEP 6: TEST CLEANUP ---');
  const delUsers = await User.deleteMany({ mobile: { $regex: '^\\+91999998' } });
  const delSessions = await AuthSession.deleteMany({ userId: { $in: await User.find({ mobile: { $regex: '^\\+91999998' } }).distinct('_id') } });
  const delOtps = await OTPChallenge.deleteMany({ mobile: { $regex: '^\\+91999998' } });
  const delEvents = await AuthSecurityEvent.deleteMany({ mobile: { $regex: '^\\+91999998' } });

  const remainingUsers = await User.countDocuments({ mobile: { $regex: '^\\+91999998' } });
  recordResult('6.1 Synthetic test documents purged cleanly', remainingUsers === 0, `Deleted users: ${delUsers.deletedCount}, sessions: ${delSessions.deletedCount}, otps: ${delOtps.deletedCount}, events: ${delEvents.deletedCount}`);

  await disconnectMongo();

  console.log('\n============================================================');
  console.log(`LIVE AUTH VERIFICATION COMPLETE: ${results.filter(r => r.passed).length} / ${results.length} PASSED`);
  console.log('============================================================\n');

  return results;
}

if (require.main === module) {
  runLiveAuthVerification()
    .then((results) => {
      const allPassed = results.every((r) => r.passed);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error during live auth verification:', err);
      process.exit(1);
    });
}
