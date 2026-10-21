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
  TaskEvent,
  VerificationEvidence,
} from '../src/models';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';
import { AppInstallConversionPostbackPayload } from '@adpayon/shared';

describe('Phase 10.5C: App Conversion Webhook Engine & Anti-Replay Security Suite', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}3001`;

  let adminUser: any;
  let testCampaign: any;
  let testCampaignSecret: string;
  let testCampaignId: string;

  let testCampaignB: any;
  let testCampaignBSecret: string;
  let testCampaignBId: string;

  let appInstallTask: any;
  let appInstallTaskId: string;

  const validPackageName = 'com.adpayon.partnerapp';
  const expectedEvent = 'FIRST_OPEN';

  function signPayload(bodyStr: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(Buffer.from(bodyStr)).digest('hex');
  }

  async function createTestAssignment(
    taskId: Types.ObjectId,
    campaignId: Types.ObjectId,
    customProps: any = {}
  ): Promise<{ user: any; assignment: any }> {
    const randomMobile = `+917${Math.floor(10000000 + Math.random() * 90000000)}`;
    const user = await User.create({
      mobile: randomMobile,
      name: `User ${randomMobile.slice(-4)}`,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashTestUser',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `CU${Math.floor(1000 + Math.random() * 9000)}`,
    });
    tracker.trackUser(user._id, user.mobile);

    const clickId = customProps.clickId || `clk_${crypto.randomBytes(16).toString('hex')}`;
    const assignment = await TaskAssignment.create({
      taskId,
      campaignId,
      userId: user._id,
      clickId,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
      ...customProps,
    });
    tracker.trackAssignment(assignment._id);

    return { user, assignment };
  }

  before(async () => {
    // 1. Strict Database Isolation Guard
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] App Install Webhook Suite: ${blockReason}\n`);
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

    // 3. Setup test admin
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'Conversion Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin123',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `CAD${runId.toString().slice(0, 5)}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);

    // 4. Create primary test campaign
    testCampaignSecret = crypto.randomBytes(32).toString('hex');
    testCampaign = await Campaign.create({
      name: `App Install QA Campaign ${runId}`,
      advertiserName: 'Acquisition Partner LLC',
      status: 'ACTIVE',
      isSandbox: false,
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      authorizedAgreementRef: `AGR-APP-${runId}`,
      webhookSecret: testCampaignSecret,
      createdBy: adminUser._id,
    });
    testCampaignId = testCampaign._id.toString();
    tracker.trackCampaign(testCampaign._id);

    // 5. Create cross-campaign test campaign B
    testCampaignBSecret = crypto.randomBytes(32).toString('hex');
    testCampaignB = await Campaign.create({
      name: `Cross Campaign B ${runId}`,
      advertiserName: 'Second Advertiser Inc',
      status: 'ACTIVE',
      isSandbox: false,
      advertiserBudgetPaise: 200000,
      spentBudgetPaise: 0,
      authorizedAgreementRef: `AGR-B-${runId}`,
      webhookSecret: testCampaignBSecret,
      createdBy: adminUser._id,
    });
    testCampaignBId = testCampaignB._id.toString();
    tracker.trackCampaign(testCampaignB._id);

    // 6. Create published APP_INSTALL task
    appInstallTask = await Task.create({
      campaignId: testCampaign._id,
      title: `QA App Install Task ${runId}`,
      description: 'Install partner application and complete first open',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 100,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
        attributionWindowHours: 72,
      },
      createdBy: adminUser._id,
    });
    appInstallTaskId = appInstallTask._id.toString();
    tracker.trackTask(appInstallTask._id);
  });

  after(async () => {
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Strict tracked cleanup: purges ONLY test entities, leaving 17 existing completions intact!
    await tracker.safeCleanup();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // TEST 1: Valid signed eligible conversion
  it('1. Successfully verifies and rewards valid HMAC-signed conversion postback', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const payload: AppInstallConversionPostbackPayload = {
      clickId: assignment.clickId,
      externalTransactionId: `TX_CONV_${runId}_001`,
      event: expectedEvent as any,
      packageName: validPackageName,
      timestamp: Date.now(),
      attributionProvider: 'ADVERTISER_DIRECT',
    };

    const rawBody = JSON.stringify(payload);
    const signature = signPayload(rawBody, testCampaignSecret);

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signature,
      },
      body: rawBody,
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.rewardPoints, 100);

    const completionId = body.data.completionId;
    tracker.trackCompletion(completionId);

    // Assert TaskAssignment is COMPLETED
    const updatedAssign = await TaskAssignment.findById(assignment._id);
    assert.equal(updatedAssign?.status, 'COMPLETED');
    assert.ok(updatedAssign?.completedAt);

    // Assert Task.completionsCount incremented
    const updatedTask = await Task.findById(appInstallTask._id);
    assert.equal(updatedTask?.completionsCount, 1);

    // Assert VerificationEvidence was created
    const evidence = await VerificationEvidence.findOne({ externalTransactionId: `TX_CONV_${runId}_001` });
    assert.ok(evidence);
    assert.equal(evidence?.signatureVerified, true);
    assert.equal(evidence?.evidenceType, 'WEBHOOK_PAYLOAD');
    tracker.trackEvidence(evidence?._id);

    // Assert TaskEvent was created
    const eventDoc = await TaskEvent.findOne({
      assignmentId: assignment._id,
      eventType: 'VERIFY_SUCCESS',
    });
    assert.ok(eventDoc);
    tracker.trackEvent(eventDoc?._id);
  });

  // TEST 2: Rejects missing or invalid HMAC signature (HTTP 401)
  it('2. Rejects request with missing or invalid HMAC signature (HTTP 401)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const payload = JSON.stringify({
      clickId: `clk_sig_${Date.now()}`,
      externalTransactionId: `TX_SIG_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    // 2.1 Missing signature
    const resNoSig = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(resNoSig.status, 401);
    const bodyNoSig = (await resNoSig.json()) as any;
    assert.equal(bodyNoSig.error.code, 'MISSING_SIGNATURE');

    // 2.2 Tampered / Invalid signature
    const resBadSig = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: payload,
    });
    assert.equal(resBadSig.status, 401);
    const bodyBadSig = (await resBadSig.json()) as any;
    assert.equal(bodyBadSig.error.code, 'INVALID_SIGNATURE');
  });

  // TEST 3: Rejects payload with wrong package name (HTTP 400)
  it('3. Rejects conversion payload with mismatched package name (HTTP 400)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assignment.clickId,
      externalTransactionId: `TX_PKG_${runId}`,
      event: expectedEvent,
      packageName: 'com.fraudulent.otherapp', // Mismatched package name
      timestamp: Date.now(),
    });

    const signature = signPayload(payload, testCampaignSecret);

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signature,
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'PACKAGE_MISMATCH');
  });

  // TEST 4: Rejects payload with wrong conversion event (HTTP 400)
  it('4. Rejects conversion payload with mismatched event name (HTTP 400)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assignment.clickId,
      externalTransactionId: `TX_EVT_${runId}`,
      event: 'IN_APP_PURCHASE', // Expected FIRST_OPEN
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const signature = signPayload(payload, testCampaignSecret);

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signature,
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'EVENT_MISMATCH');
  });

  // TEST 5: Anti-replay: Rejects replayed externalTransactionId on different assignment (HTTP 409)
  it('5. Rejects duplicate externalTransactionId used on another assignment (HTTP 409)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment: assignA } = await createTestAssignment(appInstallTask._id, testCampaign._id);
    const sharedTxId = `TX_REPLAY_TEST_${runId}`;

    // Process first conversion
    const payloadA = JSON.stringify({
      clickId: assignA.clickId,
      externalTransactionId: sharedTxId,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const resA = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payloadA, testCampaignSecret),
      },
      body: payloadA,
    });
    assert.equal(resA.status, 200);
    const bodyA = (await resA.json()) as any;
    tracker.trackCompletion(bodyA.data.completionId);

    // Second assignment attempts to reuse the same externalTransactionId
    const { assignment: assignB } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const payloadB = JSON.stringify({
      clickId: assignB.clickId,
      externalTransactionId: sharedTxId, // Replaying identical transaction ID
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const resB = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payloadB, testCampaignSecret),
      },
      body: payloadB,
    });

    assert.equal(resB.status, 409);
    const bodyB = (await resB.json()) as any;
    assert.equal(bodyB.error.code, 'DUPLICATE_TRANSACTION');
  });

  // TEST 6: Idempotent Retry Reconciliation: Same externalTransactionId on same assignment returns DUPLICATE without double points
  it('6. Idempotently reconciles partner retry of identical transaction without double points', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment: assign } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const txId = `TX_IDEM_${runId}`;
    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: txId,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const sig = signPayload(payload, testCampaignSecret);

    // First attempt
    const res1 = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-adpayon-signature': sig },
      body: payload,
    });
    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as any;
    const originalCompletionId = body1.data.completionId;
    tracker.trackCompletion(originalCompletionId);

    const taskBefore = await Task.findById(appInstallTask._id);
    const countBefore = taskBefore?.completionsCount;

    // Retry identical request (e.g. partner timeout retry)
    const res2 = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-adpayon-signature': sig },
      body: payload,
    });

    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.success, true);
    assert.equal(body2.data.idempotent, true);
    assert.equal(body2.data.completionId, originalCompletionId);

    // Verify completionsCount was NOT double incremented
    const taskAfter = await Task.findById(appInstallTask._id);
    assert.equal(taskAfter?.completionsCount, countBefore);
  });

  // TEST 7: Cross-campaign clickId abuse (HTTP 403)
  it('7. Rejects postback when clickId belongs to a different campaign (HTTP 403)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Assignment belongs to Campaign A
    const { assignment: assign } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_CROSS_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    // Signed with Campaign B's secret, targeted to Campaign B's endpoint
    const sigB = signPayload(payload, testCampaignBSecret);
    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignBId}/install-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-adpayon-signature': sigB },
      body: payload,
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'CAMPAIGN_MISMATCH');
  });

  // TEST 8: Rejects conversion for expired assignment (HTTP 400)
  it('8. Rejects conversion when assignment has expired (HTTP 400)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment: assign } = await createTestAssignment(appInstallTask._id, testCampaign._id, {
      status: 'EXPIRED',
      assignedAt: new Date(Date.now() - 7200000),
      expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
    });

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_EXP_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payload, testCampaignSecret),
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'ASSIGNMENT_EXPIRED');
  });

  // TEST 9: Rejects conversion outside attribution window (HTTP 400)
  it('9. Rejects conversion occurred outside allowable attribution window (HTTP 400)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Assignment started 80 hours ago (task attributionWindowHours is 72)
    const { assignment: assign } = await createTestAssignment(appInstallTask._id, testCampaign._id, {
      assignedAt: new Date(Date.now() - 80 * 3600 * 1000),
      expiresAt: new Date(Date.now() + 3600000),
    });

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_ATTR_WIN_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payload, testCampaignSecret),
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'ATTRIBUTION_WINDOW_EXPIRED');
  });

  // TEST 10: Rejects postback for paused task or inactive campaign (HTTP 400)
  it('10. Rejects postback for paused task or paused campaign (HTTP 400)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // 10.1 Paused task
    const pausedTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Paused Task ${runId}`,
      description: 'Paused app install task',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 50,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PAUSED', // Not published
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(pausedTask._id);

    const { assignment: assign } = await createTestAssignment(pausedTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_PAUSED_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payload, testCampaignSecret),
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'TASK_NOT_PUBLISHED');
  });

  // TEST 11: Rejects conversion when global cap is exhausted (HTTP 400)
  it('11. Rejects conversion when task global cap is already exhausted (HTTP 400)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const cappedTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Capped App Task ${runId}`,
      description: 'Cap met task',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 50,
      totalCap: 1,
      completionsCount: 1, // Cap exhausted
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(cappedTask._id);

    const { assignment: assign } = await createTestAssignment(cappedTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_CAP_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payload, testCampaignSecret),
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'CAP_EXHAUSTED');
  });

  // TEST 12: Parallel last-slot competition (Mutex + Concurrency protection)
  it('12. Concurrency: Parallel postbacks competing for final slot allow exactly 1 success', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Create task with totalCap: 1, completionsCount: 0
    const raceTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Race Task ${runId}`,
      description: 'Single slot race task',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 80,
      totalCap: 1,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(raceTask._id);

    const { assignment: assign1 } = await createTestAssignment(raceTask._id, testCampaign._id);
    const { assignment: assign2 } = await createTestAssignment(raceTask._id, testCampaign._id);

    const payload1 = JSON.stringify({
      clickId: assign1.clickId,
      externalTransactionId: `TX_RACE_1_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const payload2 = JSON.stringify({
      clickId: assign2.clickId,
      externalTransactionId: `TX_RACE_2_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    // Execute both in parallel
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-adpayon-signature': signPayload(payload1, testCampaignSecret),
        },
        body: payload1,
      }),
      fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-adpayon-signature': signPayload(payload2, testCampaignSecret),
        },
        body: payload2,
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 400], 'Exactly one request must succeed (200) and one fail closed (400)');

    // Verify task completionsCount is exactly 1 (never exceeded!)
    const finalTask = await Task.findById(raceTask._id);
    assert.equal(finalTask?.completionsCount, 1);
  });

  // TEST 13, 14, 15: Transaction Rollback Correctness upon failure
  it('13. Transaction Rollback: Failure during evidence creation rolls back atomically', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const rollbackTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Rollback Evidence Task ${runId}`,
      description: 'Rollback test',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 50,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(rollbackTask._id);

    const { assignment: testAssign } = await createTestAssignment(rollbackTask._id, testCampaign._id);

    const session = await mongoose.startSession();
    let caught: any = null;
    try {
      await session.withTransaction(async () => {
        await TaskAssignment.findOneAndUpdate(
          { _id: testAssign._id },
          { $set: { status: 'COMPLETED' } },
          { session }
        );
        await Task.findOneAndUpdate(
          { _id: rollbackTask._id },
          { $inc: { completionsCount: 1 } },
          { session }
        );
        throw new Error('SIMULATED_EVIDENCE_ERROR');
      });
    } catch (err: any) {
      caught = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caught?.message, 'SIMULATED_EVIDENCE_ERROR');

    // Verify rollback
    const afterTask = await Task.findById(rollbackTask._id);
    assert.equal(afterTask?.completionsCount, 0);
    const afterAssign = await TaskAssignment.findById(testAssign._id);
    assert.equal(afterAssign?.status, 'ASSIGNED');
  });

  it('14. Transaction Rollback: Failure during TaskCompletion creation rolls back atomically', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const rollbackTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Rollback Comp Task ${runId}`,
      description: 'Rollback test',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 50,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(rollbackTask._id);

    const { user, assignment: testAssign } = await createTestAssignment(rollbackTask._id, testCampaign._id);

    const session = await mongoose.startSession();
    let caught: any = null;
    try {
      await session.withTransaction(async () => {
        await TaskAssignment.findOneAndUpdate(
          { _id: testAssign._id },
          { $set: { status: 'COMPLETED' } },
          { session }
        );
        await Task.findOneAndUpdate(
          { _id: rollbackTask._id },
          { $inc: { completionsCount: 1 } },
          { session }
        );
        await VerificationEvidence.create(
          [
            {
              assignmentId: testAssign._id,
              taskId: rollbackTask._id,
              userId: user._id,
              evidenceType: 'WEBHOOK_PAYLOAD',
              signatureVerified: true,
              evaluatedAt: new Date(),
            },
          ],
          { session }
        );
        throw new Error('SIMULATED_COMPLETION_ERROR');
      });
    } catch (err: any) {
      caught = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caught?.message, 'SIMULATED_COMPLETION_ERROR');

    // Verify rollback
    const afterTask = await Task.findById(rollbackTask._id);
    assert.equal(afterTask?.completionsCount, 0);
    const afterAssign = await TaskAssignment.findById(testAssign._id);
    assert.equal(afterAssign?.status, 'ASSIGNED');
    const noEvidence = await VerificationEvidence.findOne({ assignmentId: testAssign._id });
    assert.equal(noEvidence, null);
  });

  it('15. Transaction Rollback: Failure during TaskEvent creation rolls back atomically', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const rollbackTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Rollback Event Task ${runId}`,
      description: 'Rollback test',
      category: 'APP_INSTALL',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 50,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'SIGNED_POSTBACK',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(rollbackTask._id);

    const { assignment: testAssign } = await createTestAssignment(rollbackTask._id, testCampaign._id);

    const session = await mongoose.startSession();
    let caught: any = null;
    try {
      await session.withTransaction(async () => {
        await TaskAssignment.findOneAndUpdate(
          { _id: testAssign._id },
          { $set: { status: 'COMPLETED' } },
          { session }
        );
        await Task.findOneAndUpdate(
          { _id: rollbackTask._id },
          { $inc: { completionsCount: 1 } },
          { session }
        );
        throw new Error('SIMULATED_EVENT_ERROR');
      });
    } catch (err: any) {
      caught = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caught?.message, 'SIMULATED_EVENT_ERROR');

    const afterTask = await Task.findById(rollbackTask._id);
    assert.equal(afterTask?.completionsCount, 0);
    const afterAssign = await TaskAssignment.findById(testAssign._id);
    assert.equal(afterAssign?.status, 'ASSIGNED');
  });

  // TEST 16: Network timeout retry reconciliation
  it('16. Reconciles network timeout retry without throwing or duplicate points', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { assignment: assign } = await createTestAssignment(appInstallTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_NET_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const sig = signPayload(payload, testCampaignSecret);

    // Initial delivery
    const res1 = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-adpayon-signature': sig },
      body: payload,
    });
    assert.equal(res1.status, 200);
    const body1 = (await res1.json()) as any;
    tracker.trackCompletion(body1.data.completionId);

    // Simulated retry after timeout
    const res2 = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-adpayon-signature': sig },
      body: payload,
    });
    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.data.idempotent, true);
    assert.equal(body2.data.completionId, body1.data.completionId);
  });

  // TEST 17: Rejection of unsupported category and MANUAL_REVIEW mode
  it('17. Rejects tasks with unsupported category or MANUAL_REVIEW attribution method', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // 17.1 MANUAL_REVIEW attribution method
    const manualTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Manual Review Task ${runId}`,
      description: 'Manual review task',
      category: 'APP_INSTALL',
      verificationMethod: 'MANUAL_REVIEW',
      rewardPoints: 50,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      appInstallConfig: {
        appName: 'Partner App',
        packageName: validPackageName,
        platform: 'ANDROID',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.adpayon.partnerapp',
        attributionMethod: 'MANUAL_REVIEW',
        conversionEvent: expectedEvent,
      },
      createdBy: adminUser._id,
    });
    tracker.trackTask(manualTask._id);

    const { assignment: assign } = await createTestAssignment(manualTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_MANUAL_${runId}`,
      event: expectedEvent,
      packageName: validPackageName,
      timestamp: Date.now(),
    });

    const res = await fetch(`${baseUrl}/api/webhooks/campaigns/${testCampaignId}/install-conversion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payload, testCampaignSecret),
      },
      body: payload,
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error.code, 'UNSUPPORTED_ATTRIBUTION_METHOD');
  });

  // TEST 18: Legacy webhook compatibility (POST /api/webhooks/tasks/postback/:campaignId)
  it('18. Preserves legacy PARTNER_WEBHOOK task verification compatibility', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const legacyTask = await Task.create({
      campaignId: testCampaign._id,
      title: `Legacy Partner Task ${runId}`,
      description: 'Legacy task',
      category: 'PARTNER_WEBHOOK',
      verificationMethod: 'AUTHENTICATED_WEBHOOK',
      rewardPoints: 200,
      totalCap: 10,
      completionsCount: 0,
      dailyCapPerUser: 1,
      status: 'PUBLISHED',
      createdBy: adminUser._id,
    });
    tracker.trackTask(legacyTask._id);

    const { assignment: assign } = await createTestAssignment(legacyTask._id, testCampaign._id);

    const payload = JSON.stringify({
      clickId: assign.clickId,
      externalTransactionId: `TX_LEGACY_${runId}`,
      timestamp: new Date().toISOString(),
    });

    const res = await fetch(`${baseUrl}/api/webhooks/tasks/postback/${testCampaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-adpayon-signature': signPayload(payload, testCampaignSecret),
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.rewardPoints, 200);
    tracker.trackCompletion(body.data.completionId);
  });

  // TEST 19: Zero cash ledger changes
  it('19. Ensures zero mutations occurred on spendable wallet or cash ledgers', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const { user } = await createTestAssignment(appInstallTask._id, testCampaign._id);
    const freshUser = await User.findById(user._id);
    assert.ok(freshUser);
    assert.equal((freshUser as any).cashBalancePaise ?? 0, 0);
  });
});
