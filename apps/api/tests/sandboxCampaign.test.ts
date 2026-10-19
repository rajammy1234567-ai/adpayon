process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import mongoose from 'mongoose';
import { app } from '../src/app';
import {
  User,
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  VerificationEvidence,
  AdminAuditLog,
} from '../src/models';
import { env } from '../src/config/env';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 7E: Sandbox Campaign & Task Isolation Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}7001`;
  const userMobile = `+917${runId}7002`;

  let adminToken: string;
  let userToken: string;

  let adminUser: any;
  let standardUser: any;

  before(async () => {
    // 1. Strict Isolation Check: Must connect to disposable test database, NEVER adpayon_dev or adpayon_sandbox
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Sandbox Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start HTTP server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 3. Setup test users
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'Sandbox Admin QA',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin7E',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM7E${runId.toString().slice(0, 4)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: adminUser.role, mobile: adminUser.mobile });

    standardUser = await User.create({
      mobile: userMobile,
      name: 'Sandbox Tester Earner',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser7E',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR7E${runId.toString().slice(0, 4)}`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(standardUser._id, userMobile);
    userToken = generateAccessToken({ userId: standardUser._id.toString(), role: standardUser.role, mobile: standardUser.mobile });
  });

  after(async () => {
    if (isSuiteBlocked) {
      return;
    }

    await tracker.safeCleanup();

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Security Guard: Server rejects creating sandbox campaign outside sandbox environment (HTTP 403)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Current test environment is NODE_ENV=test and adpayon_test
    const res = await fetch(`${baseUrl}/api/admin/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: '[SANDBOX] Illicit Test Campaign',
        advertiserName: 'Synthetic Labs',
        advertiserBudgetPaise: 0,
        isSandbox: true,
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'SANDBOX_CAMPAIGNS_FORBIDDEN');
  });

  it('2. Security Guard: Server rejects activating sandbox campaign outside sandbox environment (HTTP 403)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Directly insert an isSandbox campaign in test DB to simulate an existing record
    const draftSandboxCampaign = await Campaign.create({
      name: '[SANDBOX] Pre-existing QA Campaign',
      advertiserName: 'Synthetic QA Entity',
      status: 'DRAFT',
      isSandbox: true,
      advertiserBudgetPaise: 0,
      spentBudgetPaise: 0,
      authorizedAgreementRef: 'SANDBOX_INTERNAL_QA',
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      createdBy: adminUser._id,
    });
    tracker.trackCampaign(draftSandboxCampaign._id);

    // Attempt to activate outside sandbox
    const activateRes = await fetch(`${baseUrl}/api/admin/campaigns/${draftSandboxCampaign._id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
      }),
    });

    assert.equal(activateRes.status, 403);
    const activateBody = (await activateRes.json()) as any;
    assert.equal(activateBody.error.code, 'SANDBOX_CAMPAIGNS_FORBIDDEN');
  });

  it('3. Invariant: Commercial non-sandbox campaign still strictly requires verified non-zero budget and agreement ref', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // 3A: Create without agreement ref rejected
    const noAgreementRes = await fetch(`${baseUrl}/api/admin/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Commercial Campaign 1',
        advertiserName: 'Real Corp Pvt Ltd',
        advertiserBudgetPaise: 100000,
        isSandbox: false,
      }),
    });
    assert.equal(noAgreementRes.status, 400);

    // 3B: Create valid commercial campaign in DRAFT
    const createRes = await fetch(`${baseUrl}/api/admin/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Commercial Campaign Valid',
        advertiserName: 'Real Corp Pvt Ltd',
        advertiserBudgetPaise: 500000,
        authorizedAgreementRef: 'AGR-COMMERCIAL-2026-01',
        isSandbox: false,
      }),
    });
    assert.equal(createRes.status, 201);
    const createBody = (await createRes.json()) as any;
    const commercialCampId = createBody.data.campaign.id;
    tracker.trackCampaign(new mongoose.Types.ObjectId(commercialCampId));

    // 3C: Attempt to activate with budget 0 is rejected
    const zeroBudgetActivateRes = await fetch(`${baseUrl}/api/admin/campaigns/${commercialCampId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        advertiserBudgetPaise: 0,
      }),
    });
    assert.equal(zeroBudgetActivateRes.status, 400);
    const zeroBudgetBody = (await zeroBudgetActivateRes.json()) as any;
    assert.equal(zeroBudgetBody.error.code, 'BUDGET_REQUIRED');

    // 3D: Activate with valid non-zero budget and agreement succeeds
    const validActivateRes = await fetch(`${baseUrl}/api/admin/campaigns/${commercialCampId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        advertiserBudgetPaise: 500000,
      }),
    });
    assert.equal(validActivateRes.status, 200);
    const validActivateBody = (await validActivateRes.json()) as any;
    assert.equal(validActivateBody.data.campaign.status, 'ACTIVE');
  });

  it('4. Sandbox Lifecycle in Sandbox Environment: Zero-budget synthetic campaign creation, activation and task publication', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Temporarily switch environment variables to sandbox identity
    const prevNodeEnv = env.NODE_ENV;
    const prevDbName = env.MONGODB_DB_NAME;
    (env as any).NODE_ENV = 'sandbox';
    (env as any).MONGODB_DB_NAME = 'adpayon_sandbox';

    try {
      // 4A: Reject sandbox campaign with budget > 0
      const nonZeroSandboxRes = await fetch(`${baseUrl}/api/admin/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: '[SANDBOX] Illegal Funded Campaign',
          advertiserName: 'Synthetic QA Labs',
          advertiserBudgetPaise: 50000,
          isSandbox: true,
        }),
      });
      assert.equal(nonZeroSandboxRes.status, 400);
      const nonZeroBody = (await nonZeroSandboxRes.json()) as any;
      assert.equal(nonZeroBody.error.code, 'SANDBOX_BUDGET_MUST_BE_ZERO');

      // 4B: Successfully create synthetic sandbox campaign with ₹0 budget & default QA agreement ref
      const createSandboxRes = await fetch(`${baseUrl}/api/admin/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: '[SANDBOX] Internal QA Campaign',
          advertiserName: 'ADPAYON QA Synthetic Entity',
          advertiserBudgetPaise: 0,
          isSandbox: true,
        }),
      });
      assert.equal(createSandboxRes.status, 201);
      const createSandboxBody = (await createSandboxRes.json()) as any;
      assert.equal(createSandboxBody.data.campaign.isSandbox, true);
      assert.equal(createSandboxBody.data.campaign.advertiserBudgetPaise, 0);
      assert.equal(createSandboxBody.data.campaign.authorizedAgreementRef, 'SANDBOX_INTERNAL_QA');
      const sandboxCampId = createSandboxBody.data.campaign.id;
      tracker.trackCampaign(new mongoose.Types.ObjectId(sandboxCampId));

      // 4C: Activate sandbox campaign without needing fake agreement contract or funding
      const activateSandboxRes = await fetch(`${baseUrl}/api/admin/campaigns/${sandboxCampId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: 'ACTIVE',
        }),
      });
      assert.equal(activateSandboxRes.status, 200);
      const activateSandboxBody = (await activateSandboxRes.json()) as any;
      assert.equal(activateSandboxBody.data.campaign.status, 'ACTIVE');
      assert.equal(activateSandboxBody.data.campaign.isSandbox, true);

      // 4D: Reject creating task under sandbox campaign with external webhook URL
      const rejectWebhookTaskRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: sandboxCampId,
          title: '[SANDBOX] Prohibited Webhook Task',
          description: 'Testing external URL rejection',
          category: 'IN_APP_ACTION',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 10,
          totalCap: 10,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 5,
          externalActionUrl: 'https://external-advertiser.com/postback',
        }),
      });
      assert.equal(rejectWebhookTaskRes.status, 400);
      const rejectWebhookBody = (await rejectWebhookTaskRes.json()) as any;
      assert.equal(rejectWebhookBody.error.code, 'SANDBOX_NO_EXTERNAL_WEBHOOKS');

      // 4E: Successfully create Phase 7E sandbox QA task
      // Title: [SANDBOX] Explore ADPAYON Features
      // Category: IN_APP_ACTION, Verification: FIRST_PARTY_ACTION
      // Reward: 10 non-withdrawable PTS, Dwell: 30s, Total Cap: 10, Daily: 1
      const createQaTaskRes = await fetch(`${baseUrl}/api/admin/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          campaignId: sandboxCampId,
          title: '[SANDBOX] Explore ADPAYON Features',
          description: 'Explore ADPAYON platform features in the physical Android sandbox environment.',
          instructions: '1. Launch app. 2. Explore features for 30s. 3. Tap complete.',
          category: 'IN_APP_ACTION',
          verificationMethod: 'FIRST_PARTY_ACTION',
          rewardPoints: 10,
          totalCap: 10,
          dailyCapPerUser: 1,
          dwellTimeSeconds: 30,
          targeting: { minAncestryDepth: 0, kycRequired: false },
        }),
      });
      assert.equal(createQaTaskRes.status, 201);
      const createQaTaskBody = (await createQaTaskRes.json()) as any;
      const sandboxTaskId = createQaTaskBody.data.task.id;
      tracker.trackTask(new mongoose.Types.ObjectId(sandboxTaskId));

      // 4F: Publish the sandbox task
      const publishRes = await fetch(`${baseUrl}/api/admin/tasks/${sandboxTaskId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(publishRes.status, 200);
      const publishBody = (await publishRes.json()) as any;
      assert.equal(publishBody.data.task.status, 'PUBLISHED');

      // 4G: Feed in sandbox mode exposes the sandbox task
      const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.equal(feedRes.status, 200);
      const feedBody = (await feedRes.json()) as any;
      const foundTask = feedBody.data.tasks.find((t: any) => t.id === sandboxTaskId);
      assert.ok(foundTask, 'Published sandbox task must be present in sandbox user feed');
      assert.equal(foundTask.rewardPoints, 10);
      assert.equal(foundTask.isEligible, true);

      // 4H: User starts sandbox task and receives assignment clickId
      const startRes = await fetch(`${baseUrl}/api/tasks/${sandboxTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      assert.ok(startBody.data.assignment.clickId);
      tracker.trackAssignment(new mongoose.Types.ObjectId(startBody.data.assignment.id));
    } finally {
      // Always restore environment variables
      (env as any).NODE_ENV = prevNodeEnv;
      (env as any).MONGODB_DB_NAME = prevDbName;
    }
  });

  it('5. Environment Isolation: Sandbox task is strictly hidden from feeds and rejected outside sandbox environment', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Create an active sandbox campaign and published task directly
    const sandboxCampaign = await Campaign.create({
      name: '[SANDBOX] Active QA Camp',
      advertiserName: 'Synthetic QA Entity',
      status: 'ACTIVE',
      isSandbox: true,
      advertiserBudgetPaise: 0,
      spentBudgetPaise: 0,
      authorizedAgreementRef: 'SANDBOX_INTERNAL_QA',
      webhookSecret: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      createdBy: adminUser._id,
    });
    tracker.trackCampaign(sandboxCampaign._id);

    const sandboxTask = await Task.create({
      campaignId: sandboxCampaign._id,
      title: '[SANDBOX] Test Task Non-Sandbox Feed Check',
      description: 'Must not appear in dev/test feed',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 10,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 5,
      createdBy: adminUser._id,
    });
    tracker.trackTask(sandboxTask._id);

    // 5A: In test/dev environment, user feed must NOT contain this task
    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(feedRes.status, 200);
    const feedBody = (await feedRes.json()) as any;
    const taskInFeed = feedBody.data.tasks.find((t: any) => t.id === sandboxTask._id.toString());
    assert.equal(taskInFeed, undefined, 'Sandbox task must never appear in user feed outside sandbox');

    // 5B: Direct start attempt outside sandbox is rejected (HTTP 403)
    const startRes = await fetch(`${baseUrl}/api/tasks/${sandboxTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(startRes.status, 403);
    const startBody = (await startRes.json()) as any;
    assert.equal(startBody.error.code, 'FORBIDDEN_OUTSIDE_SANDBOX');

    // 5C: Direct verify attempt outside sandbox is rejected (HTTP 403)
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${sandboxTask._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(verifyRes.status, 403);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.error.code, 'FORBIDDEN_OUTSIDE_SANDBOX');
  });
});
