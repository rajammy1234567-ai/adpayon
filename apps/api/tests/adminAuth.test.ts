import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import {
  User,
  Campaign,
  Task,
  TaskCompletion,
  AdminAuditLog,
  AuthSecurityEvent,
} from '../src/models';
import { hashPassword } from '../src/services/passwordService';
import {
  TestOwnershipTracker,
  assertTestDatabaseIsolation,
} from '../src/testUtils/dbIsolation';

describe('Admin Authentication & MFA Integration Tests', () => {
  const app = createApp();
  let server: Server;
  let baseUrl: string;

  const tracker = new TestOwnershipTracker();
  let isSuiteBlocked = false;
  let blockReason = '';

  const runHex = crypto.randomBytes(4).toString('hex');
  const adminMobile = `+919777${crypto.randomInt(100000, 999999)}`;
  const regularMobile = `+919666${crypto.randomInt(100000, 999999)}`;
  const adminPassword = 'AdminPassword123!';

  let adminUser: any;
  let regularUser: any;
  let mfaSessionToken: string;
  let adminAccessToken: string;
  let adminRefreshToken: string;
  let testCampaignId: string;

  before(async () => {
    // 1. Strict Isolation Check: Must connect to disposable test database, NEVER adpayon_dev
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Admin Auth Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start HTTP server
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 3. Create Admin user with Argon2id hash
    const adminHash = await hashPassword(adminPassword);
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'Super Admin Engineer',
      passwordHash: adminHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM_${runHex}1`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(adminUser._id, adminMobile);

    // 4. Create regular user
    const regularHash = await hashPassword('RegularUser123!');
    regularUser = await User.create({
      mobile: regularMobile,
      name: 'Regular Earner',
      passwordHash: regularHash,
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR_${runHex}2`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(regularUser._id, regularMobile);

    // 5. Create a test campaign for secret reveal testing
    const campaign = await Campaign.create({
      name: `Admin Auth Test Campaign ${runHex}`,
      advertiserName: 'Brand Test Partner',
      advertiserBudgetPaise: 5000000,
      authorizedAgreementRef: `AGR-AUTH-${runHex}`,
      webhookSecret: 'secret_admin_test_webhook_key_xyz',
      status: 'ACTIVE',
      createdBy: adminUser._id,
    });
    testCampaignId = campaign._id.toString();
    tracker.trackCampaign(campaign._id);
  });

  after(async () => {
    if (isSuiteBlocked) {
      return;
    }

    // Clean up ONLY tracked test-owned entities via exact ObjectIds
    await tracker.safeCleanup();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. POST /api/admin/auth/login rejects requests with missing credentials (HTTP 400)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('2. POST /api/admin/auth/login rejects standard user with HTTP 403 Forbidden', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: regularMobile,
        password: 'RegularUser123!',
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('3. POST /api/admin/auth/login rejects incorrect admin password with HTTP 401', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: adminMobile,
        password: 'WrongAdminPassword999!',
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('4. POST /api/admin/auth/login succeeds for valid admin and initiates MFA challenge', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: adminMobile,
        password: adminPassword,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.mfaRequired, true);
    assert.ok(body.data.mfaSessionToken);
    assert.ok(body.data.maskedMobile);

    mfaSessionToken = body.data.mfaSessionToken;
  });

  it('5. POST /api/admin/auth/mfa-verify rejects invalid MFA challenge token (HTTP 401)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaSessionToken: 'invalid.tampered.token.here',
        otp: '123456',
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'MFA_CHALLENGE_EXPIRED');
  });

  it('6. POST /api/admin/auth/mfa-verify rejects incorrect OTP (HTTP 400)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaSessionToken,
        otp: '000000',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_MFA_OTP');
  });

  it('7. POST /api/admin/auth/mfa-verify succeeds with matching OTP and issues admin session', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Retrieve test OTP from Dev OTP provider loopback endpoint
    const otpRes = await fetch(`${baseUrl}/api/dev/otp/${adminMobile}`);
    assert.equal(otpRes.status, 200);
    const otpBody = (await otpRes.json()) as any;
    assert.ok(otpBody.otp, 'Expected OTP from DevOtpProvider');
    const cachedOtp = otpBody.otp;

    const res = await fetch(`${baseUrl}/api/admin/auth/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaSessionToken,
        otp: cachedOtp,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    assert.equal(body.data.admin.role, 'ADMIN');
    assert.ok(Array.isArray(body.data.admin.permissions));

    adminAccessToken = body.data.accessToken;
    adminRefreshToken = body.data.refreshToken;

    // Verify AdminAuditLog recorded the successful login
    const auditRecord = await AdminAuditLog.findOne({
      adminId: adminUser._id,
      action: 'ADMIN_LOGIN_SUCCESS',
    });
    assert.ok(auditRecord);
    tracker.trackAuditLog(auditRecord._id);
  });

  it('8. GET /api/admin/auth/me returns authenticated admin profile', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.admin.id, adminUser._id.toString());
    assert.equal(body.data.admin.role, 'ADMIN');
  });

  it('9. GET /api/admin/metrics returns platform metrics for dashboard', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/metrics`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.data.campaigns);
    assert.ok(body.data.tasks);
    assert.ok(body.data.completions);
    assert.ok(body.data.financial);
    assert.equal(typeof body.data.financial.totalBudgetPaise, 'number');
  });

  it('10. POST /api/admin/campaigns/:id/reveal-secret reveals secret and writes audit log', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/campaigns/${testCampaignId}/reveal-secret`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.webhookSecret, 'secret_admin_test_webhook_key_xyz');

    // Confirm audit log was generated
    const auditRecord = await AdminAuditLog.findOne({
      adminId: adminUser._id,
      action: 'REVEAL_CAMPAIGN_SECRET',
    });
    assert.ok(auditRecord);
    tracker.trackAuditLog(auditRecord._id);
  });

  it('11. GET /api/admin/audit-logs returns paginated audit records', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/audit-logs?limit=10`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.logs));
    assert.ok(body.data.logs.length >= 1);
    assert.ok(body.data.pagination);
  });

  it('12. POST /api/admin/auth/logout terminates admin session', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: adminRefreshToken }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);

    const logoutAudit = await AdminAuditLog.findOne({
      adminId: adminUser._id,
      action: 'ADMIN_LOGOUT',
    });
    assert.ok(logoutAudit);
    tracker.trackAuditLog(logoutAudit._id);
  });
});
