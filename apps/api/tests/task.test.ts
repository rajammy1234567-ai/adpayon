process.env.NODE_ENV = 'test';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
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
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Admin Task Engine & Verification Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  // Distinct synthetic phone numbers dedicated exclusively to this test run
  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}0001`;
  const user1Mobile = `+917${runId}0002`;
  const user2Mobile = `+917${runId}0003`;

  let adminToken: string;
  let user1Token: string;
  let user2Token: string;

  let adminUser: any;
  let standardUser1: any;
  let standardUser2: any;

  let testCampaignId: string;
  let testCampaignSecret: string;
  let testTaskId: string;
  let partnerTaskId: string;
  let user1ClickId: string;
  let user1AssignmentId: string;

  before(async () => {
    // 1. Strict Isolation Check: Must connect to disposable test database, NEVER adpayon_dev
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] Task Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start HTTP server only if safe test database isolation is guaranteed
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // 3. Setup test users and track ownership explicitly
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'System Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin123',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM${runId.toString().slice(0, 5)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: adminUser.role, mobile: adminUser.mobile });

    standardUser1 = await User.create({
      mobile: user1Mobile,
      name: 'Test Earner 1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser1',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR${runId.toString().slice(0, 5)}1`,
      metadata: { kycStatus: 'VERIFIED', language: 'en' },
    });
    tracker.trackUser(standardUser1._id, user1Mobile);
    user1Token = generateAccessToken({ userId: standardUser1._id.toString(), role: standardUser1.role, mobile: standardUser1.mobile });

    standardUser2 = await User.create({
      mobile: user2Mobile,
      name: 'Test Earner 2 (Unverified KYC)',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser2',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR${runId.toString().slice(0, 5)}2`,
      metadata: { kycStatus: 'NOT_SUBMITTED', language: 'hi' },
    });
    tracker.trackUser(standardUser2._id, user2Mobile);
    user2Token = generateAccessToken({ userId: standardUser2._id.toString(), role: standardUser2.role, mobile: standardUser2.mobile });
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

  it('1. Admin role restriction: Standard user cannot create campaign (HTTP 403)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Token}`, // Non-admin user token
      },
      body: JSON.stringify({
        name: 'Unauthorized Campaign',
        advertiserName: 'Bad Actor',
        advertiserBudgetPaise: 500000,
        authorizedAgreementRef: 'AGR-UNAUTH-001',
      }),
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'FORBIDDEN_ADMIN_ONLY');
  });

  it('2. POST /api/admin/campaigns creates campaign in DRAFT state with generated webhookSecret', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/campaigns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Fintech App Installs Q4',
        advertiserName: 'Bharat Fintech Ltd',
        description: 'Targeted banking app registration and onboarding',
        advertiserBudgetPaise: 5000000, // 50,000 INR
        authorizedAgreementRef: 'AGR-FINTECH-2026-001',
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.campaign.status, 'DRAFT'); // Always starts in DRAFT
    assert.equal(body.data.campaign.advertiserBudgetPaise, 5000000);
    assert.ok(body.data.campaign.webhookSecret); // Returned on creation
    assert.equal(typeof body.data.campaign.webhookSecret, 'string');

    testCampaignId = body.data.campaign.id;
    testCampaignSecret = body.data.campaign.webhookSecret;
    tracker.trackCampaign(testCampaignId);

    // Verify audit log entry was created
    const audit = await AdminAuditLog.findOne({
      targetId: testCampaignId,
      action: 'CREATE_CAMPAIGN',
    });
    assert.ok(audit);
    tracker.trackAuditLog(audit._id);
  });

  it('3. POST /api/admin/tasks creates task in DRAFT state under campaign', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Task 1: In-app engagement action
    const res = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: testCampaignId,
        title: 'Watch Fintech Onboarding Video',
        description: 'Learn about secure digital banking features',
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 250, // 250 non-withdrawable promotional points
        totalCap: 50,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 1, // 1 second for fast reliable test verification
        targeting: {
          kycRequired: true,
        },
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.task.status, 'DRAFT');
    assert.equal(body.data.task.rewardPoints, 250);
    assert.equal(body.data.task.targeting.kycRequired, true);

    testTaskId = body.data.task.id;
    tracker.trackTask(testTaskId);

    // Task 2: Partner webhook conversion task
    const partnerRes = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: testCampaignId,
        title: 'Complete Partner App Registration',
        description: 'Register account on partner mobile banking app',
        category: 'PARTNER_WEBHOOK',
        verificationMethod: 'AUTHENTICATED_WEBHOOK',
        rewardPoints: 1000,
        totalCap: 100,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 0,
        externalActionUrl: 'https://partner.example.com/signup?click_id={click_id}&user_id={user_id}',
      }),
    });

    assert.equal(partnerRes.status, 201);
    const partnerBody = (await partnerRes.json()) as any;
    partnerTaskId = partnerBody.data.task.id;
    tracker.trackTask(partnerTaskId);

    // Task 3: Regression test: create DRAFT first-party task without partner URL, with blank description resolving from instructions
    const regressionRes = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: testCampaignId,
        title: 'ADPAYON Test Task 01',
        instructions: 'Open app and navigate through categories for 30s',
        description: '', // Blank string: should be safely preprocessed and resolved from instructions
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 10,
        dwellTimeSeconds: 30,
        totalCap: 10,
        dailyCapPerUser: 1,
        externalActionUrl: '', // Blank partner URL: should be preprocessed to undefined without failing url validation
        targeting: {
          minAncestryDepth: 0,
        },
      }),
    });

    assert.equal(regressionRes.status, 201);
    const regressionBody = (await regressionRes.json()) as any;
    assert.equal(regressionBody.success, true);
    assert.equal(regressionBody.data.task.status, 'DRAFT');
    assert.equal(regressionBody.data.task.title, 'ADPAYON Test Task 01');
    assert.equal(regressionBody.data.task.description, 'Open app and navigate through categories for 30s');
    assert.equal(regressionBody.data.task.instructions, 'Open app and navigate through categories for 30s');
    assert.equal(regressionBody.data.task.externalActionUrl, undefined);
    tracker.trackTask(regressionBody.data.task.id);

    // Validation error regression check: field-specific validation error
    const invalidRes = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: testCampaignId,
        title: 'x', // Too short (min 3)
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 10,
        totalCap: 10,
      }),
    });

    assert.equal(invalidRes.status, 400);
    const invalidBody = (await invalidRes.json()) as any;
    assert.equal(invalidBody.error.code, 'VALIDATION_ERROR');
    assert.ok(invalidBody.error.fieldErrors?.title);
    assert.ok(invalidBody.error.message.includes('title:'));
  });

  it('4. Safe publication rule: Cannot publish task if parent campaign is in DRAFT (HTTP 400)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/tasks/${testTaskId}/publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CAMPAIGN_NOT_ACTIVE');
  });

  it('5. PATCH /api/admin/campaigns/:id activates campaign with verified agreementRef', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/campaigns/${testCampaignId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.campaign.status, 'ACTIVE');
  });

  it('6. POST /api/admin/tasks/:id/publish publishes tasks successfully once campaign is ACTIVE', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Publish Task 1
    const res1 = await fetch(`${baseUrl}/api/admin/tasks/${testTaskId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as any;
    assert.equal(body1.success, true);
    assert.equal(body1.data.task.status, 'PUBLISHED');

    // Publish Task 2
    const res2 = await fetch(`${baseUrl}/api/admin/tasks/${partnerTaskId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.success, true);
    assert.equal(body2.data.task.status, 'PUBLISHED');
  });

  it('7. GET /api/tasks/feed returns published task to eligible users and filters by targeting', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // User 1 (KYC verified) should see task as eligible
    const res1 = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as any;
    assert.equal(body1.success, true);

    const taskItem = body1.data.tasks.find((item: any) => item.id === testTaskId);
    assert.ok(taskItem);
    assert.equal(taskItem.isEligible, true);
    assert.equal(taskItem.rewardPoints, 250);

    // User 2 (KYC not submitted) should see task marked inEligible
    const res2 = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as any;
    const taskItem2 = body2.data.tasks.find((item: any) => item.id === testTaskId);
    assert.ok(taskItem2);
    assert.equal(taskItem2.isEligible, false);
    assert.equal(taskItem2.ineligibilityReason, 'KYC verification required');
  });

  it('8. POST /api/tasks/:id/start creates TaskAssignment with unique clickId', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/tasks/${testTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.data.assignment.clickId);
    assert.ok(body.data.assignment.clickId.startsWith('clk_'));
    assert.equal(body.data.assignment.status, 'ASSIGNED');

    user1ClickId = body.data.assignment.clickId;
    user1AssignmentId = body.data.assignment.id;
    tracker.trackAssignment(user1AssignmentId);

    // Verify TaskAssignment exists in test DB
    const assignment = await TaskAssignment.findById(user1AssignmentId);
    assert.ok(assignment);
    assert.equal(assignment.clickId, user1ClickId);
  });

  it('9. Duplicate active assignment prevention: User cannot start the same task concurrently (HTTP 409)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/tasks/${testTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'DUPLICATE_ACTIVE_ASSIGNMENT');
    assert.equal(body.data.clickId, user1ClickId);
  });

  it('10. First-party action verification: Rejects if elapsed dwell time is insufficient (HTTP 400)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Force assignment dwell time requirement check by creating a new task with high dwell time
    const highDwellTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Long 60s Video Engagement',
      description: 'Must watch full video for 60 seconds',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 500,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 60, // 60 seconds required
      createdBy: adminUser._id,
    });
    tracker.trackTask(highDwellTask._id);

    // Start assignment on high-dwell task
    const startRes = await fetch(`${baseUrl}/api/tasks/${highDwellTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // Immediate attempt to verify should fail with INSUFFICIENT_DWELL_TIME
    const verifyRes = await fetch(`${baseUrl}/api/tasks/${highDwellTask._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(verifyRes.status, 400);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.success, false);
    assert.equal(verifyBody.error.code, 'INSUFFICIENT_DWELL_TIME');
  });

  it('11. First-party action verification: Succeeds when dwell time requirement is satisfied and marks COMPLETED', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Wait 1.1s so dwell time of testTaskId (1s) is satisfied
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await fetch(`${baseUrl}/api/tasks/${testTaskId}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.completion.status, 'VERIFIED');
    assert.equal(body.data.completion.rewardPoints, 250);

    const completionId = body.data.completion.id;
    tracker.trackCompletion(completionId);

    // Verify task completion count incremented
    const updatedTask = await Task.findById(testTaskId);
    assert.equal(updatedTask?.completionsCount, 1);

    // Verify assignment updated to COMPLETED
    const updatedAssignment = await TaskAssignment.findById(user1AssignmentId);
    assert.equal(updatedAssignment?.status, 'COMPLETED');
  });

  let partnerClickId: string;
  let partnerAssignmentId: string;

  it('12. Partner webhook postback: Rejects request with missing or invalid HMAC signature (HTTP 401)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Start partner task assignment first
    const startRes = await fetch(`${baseUrl}/api/tasks/${partnerTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    partnerClickId = startBody.data.assignment.clickId;
    partnerAssignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(partnerAssignmentId);

    const payload = JSON.stringify({
      clickId: partnerClickId,
      externalTransactionId: `TX_${runId}_001`,
      timestamp: new Date().toISOString(),
    });

    // 12.1 Missing signature
    const resNoSig = await fetch(`${baseUrl}/api/webhooks/tasks/postback/${testCampaignId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(resNoSig.status, 401);

    // 12.2 Invalid signature
    const resBadSig = await fetch(`${baseUrl}/api/webhooks/tasks/postback/${testCampaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: payload,
    });
    assert.equal(resBadSig.status, 401);
  });

  it('13. Partner webhook postback: Successfully processes valid HMAC-SHA256 signed postback', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const payload = JSON.stringify({
      clickId: partnerClickId,
      externalTransactionId: `TX_${runId}_001`,
      timestamp: new Date().toISOString(),
    });

    // Compute genuine HMAC-SHA256 signature using campaign secret
    const validSignature = crypto
      .createHmac('sha256', testCampaignSecret)
      .update(Buffer.from(payload))
      .digest('hex');

    const res = await fetch(`${baseUrl}/api/webhooks/tasks/postback/${testCampaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': validSignature,
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.rewardPoints, 1000);

    const completionId = body.data.completionId;
    tracker.trackCompletion(completionId);

    // Verify VerificationEvidence was stored with verified signature
    const evidence = await VerificationEvidence.findOne({ externalTransactionId: `TX_${runId}_001` });
    assert.ok(evidence);
    assert.equal(evidence.signatureVerified, true);
    tracker.trackEvidence(evidence._id);
  });

  it('14. Webhook replay prevention: Rejects duplicate externalTransactionId (HTTP 409)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const payload = JSON.stringify({
      clickId: partnerClickId,
      externalTransactionId: `TX_${runId}_001`, // Replaying identical transaction ID
      timestamp: new Date().toISOString(),
    });

    const signature = crypto
      .createHmac('sha256', testCampaignSecret)
      .update(Buffer.from(payload))
      .digest('hex');

    const res = await fetch(`${baseUrl}/api/webhooks/tasks/postback/${testCampaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signature,
      },
      body: payload,
    });

    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'DUPLICATE_TRANSACTION');
  });

  it('15. Completion idempotency: Re-submitting postback for same clickId returns already processed without double-incrementing', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Supply a fresh externalTransactionId but identical clickId
    const payload = JSON.stringify({
      clickId: partnerClickId,
      externalTransactionId: `TX_${runId}_002`,
      timestamp: new Date().toISOString(),
    });

    const signature = crypto
      .createHmac('sha256', testCampaignSecret)
      .update(Buffer.from(payload))
      .digest('hex');

    const taskBefore = await Task.findById(partnerTaskId);
    const countBefore = taskBefore?.completionsCount;

    const res = await fetch(`${baseUrl}/api/webhooks/tasks/postback/${testCampaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signature,
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.idempotent, true);

    // Verify completions count was NOT double-incremented
    const taskAfter = await Task.findById(partnerTaskId);
    assert.equal(taskAfter?.completionsCount, countBefore);
  });

  it('16. Global totalCap enforcement: Task rejects start when cap is exhausted', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Create a task with totalCap = 1 and completionsCount = 1
    const cappedTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Exhausted Cap Task',
      description: 'Already completed by other users',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 1,
      completionsCount: 1, // Cap met
      dailyCapPerUser: 1,
      createdBy: adminUser._id,
    });
    tracker.trackTask(cappedTask._id);

    const res = await fetch(`${baseUrl}/api/tasks/${cappedTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CAP_EXHAUSTED');
  });

  it('17. POST /api/admin/tasks/:id/pause hides task from user feed', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const pauseRes = await fetch(`${baseUrl}/api/admin/tasks/${testTaskId}/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(pauseRes.status, 200);

    // Check user feed: paused task should no longer appear
    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const feedBody = (await feedRes.json()) as any;
    const taskInFeed = feedBody.data.tasks.find((item: any) => item.id === testTaskId);
    assert.equal(taskInFeed, undefined);
  });

  it('18. Manual review: Admin can review flagged completion and update status with audit trail', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Create a completion in FLAGGED status
    const flaggedAssignment = await TaskAssignment.create({
      taskId: new Types.ObjectId(partnerTaskId),
      campaignId: new Types.ObjectId(testCampaignId),
      userId: standardUser2._id,
      clickId: `clk_flagged_${runId}`,
      status: 'COMPLETED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 10,
    });
    tracker.trackAssignment(flaggedAssignment._id);

    const flaggedCompletion = await TaskCompletion.create({
      taskId: new Types.ObjectId(partnerTaskId),
      campaignId: new Types.ObjectId(testCampaignId),
      userId: standardUser2._id,
      assignmentId: flaggedAssignment._id,
      clickId: flaggedAssignment.clickId,
      rewardPoints: 1000,
      status: 'FLAGGED',
      verificationMethod: 'MANUAL_REVIEW',
      completedAt: new Date(),
    });
    tracker.trackCompletion(flaggedCompletion._id);

    // Admin reviews and approves
    const reviewRes = await fetch(`${baseUrl}/api/admin/tasks/completions/${flaggedCompletion._id}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'VERIFIED',
        adminReviewNotes: 'Manual verification approved after partner confirmation check',
      }),
    });

    assert.equal(reviewRes.status, 200);
    const reviewBody = (await reviewRes.json()) as any;
    assert.equal(reviewBody.success, true);
    assert.equal(reviewBody.data.completion.status, 'VERIFIED');
    assert.equal(reviewBody.data.completion.reviewedBy, adminUser._id.toString());
  });

  it('19. GET /api/tasks/history returns paginated completions and promotional points', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const historyRes = await fetch(`${baseUrl}/api/tasks/history?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(historyRes.status, 200);
    const body = (await historyRes.json()) as any;
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.completions));
    assert.ok(body.data.completions.length >= 1);
    assert.ok(body.data.completions[0].rewardPoints > 0);
    assert.ok(body.data.pagination.total >= 1);
  });

  it('20. GET /api/tasks/:id/status returns active assignment status for user', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const statusRes = await fetch(`${baseUrl}/api/tasks/${testTaskId}/status`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(statusRes.status, 200);
    const body = (await statusRes.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.hasAssignment, true);
    assert.ok(body.data.assignment.clickId);
  });

  it('21. Security & Lifecycle: Rejects starting DRAFT or PAUSED tasks (HTTP 404)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Attempt starting paused task (testTaskId was paused in test 17)
    const pausedRes = await fetch(`${baseUrl}/api/tasks/${testTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    });

    assert.equal(pausedRes.status, 404);
    const pausedBody = (await pausedRes.json()) as any;
    assert.equal(pausedBody.error.code, 'TASK_NOT_AVAILABLE');
  });

  it('22. Security: Unauthorized requests to /api/tasks/* return HTTP 401 Unauthorized', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const unauthFeed = await fetch(`${baseUrl}/api/tasks/feed`);
    assert.equal(unauthFeed.status, 401);

    const unauthStart = await fetch(`${baseUrl}/api/tasks/${testTaskId}/start`, { method: 'POST' });
    assert.equal(unauthStart.status, 401);

    const unauthHistory = await fetch(`${baseUrl}/api/tasks/history`);
    assert.equal(unauthHistory.status, 401);
  });

  it('23. Admin Completion Monitor: GET /api/admin/tasks/completions returns 200 with populated data', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const res = await fetch(`${baseUrl}/api/admin/tasks/completions?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.completions));
    assert.ok(body.data.completions.length >= 1);
    assert.ok(body.data.pagination);
    assert.equal(body.data.pagination.page, 1);
    assert.ok(body.data.pagination.total >= 1);

    // Verify first completion has populated details
    const first = body.data.completions[0];
    assert.ok(first.id);
    assert.ok(first.rewardPoints > 0);
    assert.ok(first.status);
    assert.ok(first.verificationMethod);
    assert.ok(first.userId);
  });

  it('24. Admin Completion Monitor: Filter by status and verificationMethod returns filtered results', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Filter by VERIFIED status
    const verifiedRes = await fetch(`${baseUrl}/api/admin/tasks/completions?status=VERIFIED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(verifiedRes.status, 200);
    const verifiedBody = (await verifiedRes.json()) as any;
    assert.equal(verifiedBody.success, true);
    for (const c of verifiedBody.data.completions) {
      assert.equal(c.status, 'VERIFIED');
    }

    // Filter by FIRST_PARTY_ACTION method
    const methodRes = await fetch(`${baseUrl}/api/admin/tasks/completions?verificationMethod=FIRST_PARTY_ACTION`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(methodRes.status, 200);
    const methodBody = (await methodRes.json()) as any;
    assert.equal(methodBody.success, true);
    for (const c of methodBody.data.completions) {
      assert.equal(c.verificationMethod, 'FIRST_PARTY_ACTION');
    }

    // Filter by ALL should not restrict
    const allRes = await fetch(`${baseUrl}/api/admin/tasks/completions?status=ALL&verificationMethod=ALL`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(allRes.status, 200);
    const allBody = (await allRes.json()) as any;
    assert.equal(allBody.success, true);
  });

  it('25. Admin Completion Monitor: Rejects invalid query filters with HTTP 400', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Invalid verificationMethod
    const invalidMethodRes = await fetch(`${baseUrl}/api/admin/tasks/completions?verificationMethod=INVALID_METHOD`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(invalidMethodRes.status, 400);
    const invalidMethodBody = (await invalidMethodRes.json()) as any;
    assert.equal(invalidMethodBody.success, false);
    assert.equal(invalidMethodBody.error.code, 'INVALID_VERIFICATION_METHOD');

    // Invalid status
    const invalidStatusRes = await fetch(`${baseUrl}/api/admin/tasks/completions?status=INVALID_STATUS`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(invalidStatusRes.status, 400);
    const invalidStatusBody = (await invalidStatusRes.json()) as any;
    assert.equal(invalidStatusBody.success, false);
    assert.equal(invalidStatusBody.error.code, 'INVALID_STATUS');

    // Invalid taskId format
    const invalidTaskIdRes = await fetch(`${baseUrl}/api/admin/tasks/completions?taskId=not_an_object_id`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(invalidTaskIdRes.status, 400);
    const invalidTaskIdBody = (await invalidTaskIdRes.json()) as any;
    assert.equal(invalidTaskIdBody.success, false);
    assert.equal(invalidTaskIdBody.error.code, 'INVALID_ID');

    // Invalid campaignId format
    const invalidCampIdRes = await fetch(`${baseUrl}/api/admin/tasks/completions?campaignId=not_an_object_id`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(invalidCampIdRes.status, 400);
    const invalidCampIdBody = (await invalidCampIdRes.json()) as any;
    assert.equal(invalidCampIdBody.success, false);
    assert.equal(invalidCampIdBody.error.code, 'INVALID_ID');
  });

  it('26. Security: Unauthorized and non-admin requests to /api/admin/tasks/completions return 401/403', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // No token -> 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/tasks/completions`);
    assert.equal(unauthRes.status, 401);

    // Standard user token (non-admin) -> 403
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/tasks/completions`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(forbiddenRes.status, 403);
    const forbiddenBody = (await forbiddenRes.json()) as any;
    assert.equal(forbiddenBody.error.code, 'FORBIDDEN_ADMIN_ONLY');
  });

  it('27. Route Ordering Regression: GET /api/admin/tasks/:id works and does not shadow /completions', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // GET /api/admin/tasks/:id with valid task ID returns 200 and task details
    const taskDetailsRes = await fetch(`${baseUrl}/api/admin/tasks/${testTaskId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(taskDetailsRes.status, 200);
    const taskDetailsBody = (await taskDetailsRes.json()) as any;
    assert.equal(taskDetailsBody.success, true);
    assert.equal(taskDetailsBody.data.task.id, testTaskId);

    // GET /api/admin/tasks/completions returns 200 and completion data (NOT 400 INVALID_ID)
    const completionsRes = await fetch(`${baseUrl}/api/admin/tasks/completions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(completionsRes.status, 200);
    const completionsBody = (await completionsRes.json()) as any;
    assert.equal(completionsBody.success, true);
    assert.ok(Array.isArray(completionsBody.data.completions));
  });

  it('28. Foreground Security: Normal foreground completion succeeds with valid non-overlapping intervals', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const fgTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: '2s Foreground Verification Test',
      description: 'Active dwell verification',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      createdBy: adminUser._id,
    });
    tracker.trackTask(fgTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${fgTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const now = Date.now();
    const intervals = [{ start: assignedAtMs, end: now }];

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${fgTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ intervals }),
    });

    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.success, true);
    assert.equal(verifyBody.data.completion.status, 'VERIFIED');
    tracker.trackCompletion(verifyBody.data.completion.id);

    // Check evidence record stored telemetry
    const evidence = await VerificationEvidence.findOne({ assignmentId: startBody.data.assignment.id });
    assert.ok(evidence);
    assert.equal((evidence.rawPayload as any).verifiedIntervalsCount, 1);
    assert.ok((evidence.rawPayload as any).totalActiveSeconds >= 2);
  });

  it('29. Foreground Security: Phone backgrounded during countdown fails if foreground time is insufficient', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const fgTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: '2s Foreground Backgrounding Test',
      description: 'Active dwell test with backgrounding',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      createdBy: adminUser._id,
    });
    tracker.trackTask(fgTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${fgTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    // Wait 2.1s wall-clock to simulate elapsed time while in background
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Client reports user was only in foreground for 500ms before backgrounding
    const intervals = [{ start: assignedAtMs, end: assignedAtMs + 500 }];

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${fgTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ intervals }),
    });

    assert.equal(verifyRes.status, 400);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.success, false);
    assert.equal(verifyBody.error.code, 'INSUFFICIENT_DWELL_TIME');
  });

  it('30. Foreground Security: Phone backgrounded/locked and resumed satisfies requirement through cumulative intervals', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const fgTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: '2s Foreground Resume Test',
      description: 'Active dwell test with pause/resume',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      createdBy: adminUser._id,
    });
    tracker.trackTask(fgTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${fgTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();

    // Interval 1: 1000ms active in foreground
    const int1Start = assignedAtMs;
    const int1End = assignedAtMs + 1000;

    // Inactive / background gap of 1000ms (locked screen or home screen)
    // Interval 2: Resumed after gap, active for 1200ms
    const int2Start = assignedAtMs + 2000;
    const int2End = assignedAtMs + 3200;

    // Total wall clock required = 3200ms
    await new Promise((resolve) => setTimeout(resolve, 3300));

    const intervals = [
      { start: int1Start, end: int1End },
      { start: int2Start, end: int2End },
    ];

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${fgTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ intervals }),
    });

    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.success, true);
    assert.equal(verifyBody.data.completion.status, 'VERIFIED');
    tracker.trackCompletion(verifyBody.data.completion.id);
  });

  it('31. Heartbeat & Reload: Client heartbeat updates dwell progress and status endpoint returns remaining seconds', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const hbTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: '5s Heartbeat & Reload Test',
      description: 'Heartbeat progress persistence',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 5,
      createdBy: adminUser._id,
    });
    tracker.trackTask(hbTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${hbTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Send heartbeat saving 1s of active dwell
    const hbRes = await fetch(`${baseUrl}/api/tasks/${hbTask._id}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intervals: [{ start: assignedAtMs, end: assignedAtMs + 1000 }],
        activeDurationSeconds: 1,
      }),
    });

    assert.equal(hbRes.status, 200);
    const hbBody = (await hbRes.json()) as any;
    assert.equal(hbBody.success, true);
    assert.equal(hbBody.data.dwellTimeAccumulatedSeconds, 1);
    assert.equal(hbBody.data.remainingDwellSeconds, 4);

    // Simulate App Reload: Query GET /api/tasks/:id/status
    const statusRes = await fetch(`${baseUrl}/api/tasks/${hbTask._id}/status`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as any;
    assert.equal(statusBody.data.assignment.dwellTimeAccumulatedSeconds, 1);
    assert.equal(statusBody.data.assignment.remainingDwellSeconds, 4);
  });

  it('32. Security: Rejects tampered timestamps (early start, future end, or duration > wall clock)', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const tamperTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Tampered Timestamp Test',
      description: 'Tamper resistance',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      createdBy: adminUser._id,
    });
    tracker.trackTask(tamperTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${tamperTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();

    // 1. Start time before assignedAt (past tolerance)
    const earlyStartRes = await fetch(`${baseUrl}/api/tasks/${tamperTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intervals: [{ start: assignedAtMs - 10000, end: assignedAtMs + 2000 }],
      }),
    });
    assert.equal(earlyStartRes.status, 400);
    const earlyBody = (await earlyStartRes.json()) as any;
    assert.equal(earlyBody.error.code, 'TAMPERED_TIMESTAMP');

    // 2. End time in the far future
    const futureEndRes = await fetch(`${baseUrl}/api/tasks/${tamperTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intervals: [{ start: assignedAtMs, end: Date.now() + 60000 }],
      }),
    });
    assert.equal(futureEndRes.status, 400);
    const futureBody = (await futureEndRes.json()) as any;
    assert.equal(futureBody.error.code, 'TAMPERED_TIMESTAMP');

    // 3. Claiming 30 seconds active dwell when only 100ms has elapsed
    const wallClockViolatedRes = await fetch(`${baseUrl}/api/tasks/${tamperTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intervals: [{ start: assignedAtMs, end: assignedAtMs + 30000 }],
      }),
    });
    assert.equal(wallClockViolatedRes.status, 400);
    const wallClockBody = (await wallClockViolatedRes.json()) as any;
    assert.equal(wallClockBody.error.code, 'TAMPERED_TIMESTAMP');
  });

  it('33. Security: Rejects overlapping intervals with HTTP 400 OVERLAPPING_INTERVALS', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const overlapTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Overlap Test',
      description: 'Overlap resistance',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      createdBy: adminUser._id,
    });
    tracker.trackTask(overlapTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${overlapTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Second interval starts before first interval ends
    const overlappingIntervals = [
      { start: assignedAtMs, end: assignedAtMs + 1500 },
      { start: assignedAtMs + 1000, end: assignedAtMs + 2000 },
    ];

    const overlapRes = await fetch(`${baseUrl}/api/tasks/${overlapTask._id}/verify-action`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ intervals: overlappingIntervals }),
    });

    assert.equal(overlapRes.status, 400);
    const overlapBody = (await overlapRes.json()) as any;
    assert.equal(overlapBody.error.code, 'OVERLAPPING_INTERVALS');
  });

  it('34. Rate Limiting: Rejects excessive heartbeat frequency (<500ms) with HTTP 429', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const rateTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Heartbeat Rate Limit Test',
      description: 'Heartbeat throttling',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 10,
      createdBy: adminUser._id,
    });
    tracker.trackTask(rateTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${rateTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // Pre-seed lastHeartbeatAt to 100ms ago (< 500ms interval) to verify rate-limiting deterministically
    await TaskAssignment.findByIdAndUpdate(startBody.data.assignment.id, {
      lastHeartbeatAt: new Date(Date.now() - 100),
    });

    // Immediate heartbeat (<500ms from previous): should be rate-limited with HTTP 429
    const hbLimited = await fetch(`${baseUrl}/api/tasks/${rateTask._id}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activeDurationSeconds: 1 }),
    });
    assert.equal(hbLimited.status, 429);
    const hbLimitedBody = (await hbLimited.json()) as any;
    assert.equal(hbLimitedBody.error.code, 'HEARTBEAT_RATE_LIMITED');

    // Heartbeat sent after required interval has elapsed (600ms ago): should succeed with HTTP 200
    await TaskAssignment.findByIdAndUpdate(startBody.data.assignment.id, {
      lastHeartbeatAt: new Date(Date.now() - 600),
    });

    const hbSuccess = await fetch(`${baseUrl}/api/tasks/${rateTask._id}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activeDurationSeconds: 1 }),
    });
    assert.equal(hbSuccess.status, 200);
  });

  it('35. Replay Protection: Duplicate verification of already completed task returns HTTP 404', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const replayTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Replay Protection Test',
      description: 'Idempotency and replay defense',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 1,
      createdBy: adminUser._id,
    });
    tracker.trackTask(replayTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${replayTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    // First verification succeeds
    const v1 = await fetch(`${baseUrl}/api/tasks/${replayTask._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(v1.status, 200);
    const v1Body = (await v1.json()) as any;
    tracker.trackCompletion(v1Body.data.completion.id);

    // Duplicate replay verification fails
    const v2 = await fetch(`${baseUrl}/api/tasks/${replayTask._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(v2.status, 404);
    const v2Body = (await v2.json()) as any;
    assert.equal(v2Body.error.code, 'NO_ACTIVE_ASSIGNMENT');
  });

  it('36. Assignment Expiry: Expired assignment rejects verification and heartbeat with HTTP 400', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const expireTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Expired Assignment Test',
      description: 'Expiry enforcement',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 1,
      createdBy: adminUser._id,
    });
    tracker.trackTask(expireTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${expireTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // Force expire the assignment in DB
    await TaskAssignment.findByIdAndUpdate(startBody.data.assignment.id, {
      expiresAt: new Date(Date.now() - 60000),
    });

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${expireTask._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(verifyRes.status, 400);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.error.code, 'ASSIGNMENT_EXPIRED');

    const hbRes = await fetch(`${baseUrl}/api/tasks/${expireTask._id}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activeDurationSeconds: 1 }),
    });
    assert.equal(hbRes.status, 400);
    const hbBody = (await hbRes.json()) as any;
    assert.equal(hbBody.error.code, 'ASSIGNMENT_EXPIRED');
  });

  it('37. Security: Unauthorized access to assignment by other users is denied', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const isoTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Assignment Isolation Test',
      description: 'Cross-user boundary',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 1,
      createdBy: adminUser._id,
    });
    tracker.trackTask(isoTask._id);

    // User 1 starts task
    const startRes = await fetch(`${baseUrl}/api/tasks/${isoTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // User 2 (different user) attempts to verify or heartbeat User 1's assignment
    const user2Verify = await fetch(`${baseUrl}/api/tasks/${isoTask._id}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(user2Verify.status, 404);
    const user2VerifyBody = (await user2Verify.json()) as any;
    assert.equal(user2VerifyBody.error.code, 'NO_ACTIVE_ASSIGNMENT');

    const user2Hb = await fetch(`${baseUrl}/api/tasks/${isoTask._id}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user2Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activeDurationSeconds: 1 }),
    });
    assert.equal(user2Hb.status, 404);
    const user2HbBody = (await user2Hb.json()) as any;
    assert.equal(user2HbBody.error.code, 'NO_ACTIVE_ASSIGNMENT');

    // Unauthenticated request
    const unauthVerify = await fetch(`${baseUrl}/api/tasks/${isoTask._id}/verify-action`, {
      method: 'POST',
    });
    assert.equal(unauthVerify.status, 401);
  });

  it('38. Concurrency: Concurrent completion attempts result in exactly 1 reward grant', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const concTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: 'Concurrent Verification Test',
      description: 'Race condition prevention',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 100,
      status: 'PUBLISHED',
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 1,
      createdBy: adminUser._id,
    });
    tracker.trackTask(concTask._id);

    const startRes = await fetch(`${baseUrl}/api/tasks/${concTask._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Fire 3 simultaneous verify requests
    const responses = await Promise.all([
      fetch(`${baseUrl}/api/tasks/${concTask._id}/verify-action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      }),
      fetch(`${baseUrl}/api/tasks/${concTask._id}/verify-action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      }),
      fetch(`${baseUrl}/api/tasks/${concTask._id}/verify-action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
      }),
    ]);

    const statuses = responses.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 200).length;
    const notFoundCount = statuses.filter((s) => s === 404).length;

    assert.equal(successCount, 1, 'Exactly one concurrent verification request must succeed');
    assert.equal(notFoundCount, 2, 'Other concurrent requests must return 404 NO_ACTIVE_ASSIGNMENT');

    for (const r of responses) {
      if (r.status === 200) {
        const body = (await r.json()) as any;
        tracker.trackCompletion(body.data.completion.id);
      }
    }
  });
});
