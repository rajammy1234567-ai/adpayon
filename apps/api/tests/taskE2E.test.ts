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
  AdminAuditLog,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 6E: Safe End-to-End Task Completion Workflow', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  // Distinct synthetic phone numbers isolated for this test execution
  const runId = Math.floor(10000 + Math.random() * 90000);
  const adminMobile = `+917${runId}1001`;
  const user1Mobile = `+917${runId}1002`;
  const user2Mobile = `+917${runId}1003`;

  let adminToken: string;
  let user1Token: string;
  let user2Token: string;

  let adminUser: any;
  let standardUser1: any;
  let standardUser2: any;

  let syntheticCampaignId: string;
  let syntheticTaskId: string;
  let user1ClickId: string;
  let user1AssignmentId: string;

  before(async () => {
    // 1. Strict Isolation Check: Must connect strictly to adpayon_test, NEVER adpayon_dev
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation not configured';
      console.warn(`\n[BLOCKED INTEGRATION TEST] E2E Task Suite: ${blockReason}\n`);
      return;
    }

    // 2. Start HTTP server on disposable port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 3. Seed synthetic testing identities in adpayon_test
    adminUser = await User.create({
      mobile: adminMobile,
      name: 'E2E Synthetic Admin',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashAdmin123',
      role: 'ADMIN',
      status: 'ACTIVE',
      referralCode: `ADM${runId}`,
    });
    tracker.trackUser(adminUser._id, adminMobile);
    adminToken = generateAccessToken({
      userId: adminUser._id.toString(),
      role: adminUser.role,
      mobile: adminUser.mobile,
    });

    standardUser1 = await User.create({
      mobile: user1Mobile,
      name: 'E2E Earner User One',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser1',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR${runId}1`,
    });
    tracker.trackUser(standardUser1._id, user1Mobile);
    user1Token = generateAccessToken({
      userId: standardUser1._id.toString(),
      role: standardUser1.role,
      mobile: standardUser1.mobile,
    });

    standardUser2 = await User.create({
      mobile: user2Mobile,
      name: 'E2E Earner User Two',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashUser2',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `USR${runId}2`,
    });
    tracker.trackUser(standardUser2._id, user2Mobile);
    user2Token = generateAccessToken({
      userId: standardUser2._id.toString(),
      role: standardUser2.role,
      mobile: standardUser2.mobile,
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (isSuiteBlocked) {
      return;
    }
    // Clean up all seeded test documents strictly in adpayon_test
    await tracker.safeCleanup();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('1. Admin creates synthetic campaign in DRAFT status', async (t) => {
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
        name: 'Synthetic E2E Test Campaign',
        advertiserName: 'Synthetic QA Advertiser Ltd',
        description: 'Automated E2E test verification campaign in adpayon_test',
        advertiserBudgetPaise: 1000000, // Synthetic budget in paise
        authorizedAgreementRef: 'AGR-E2E-SYNTH-001',
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.campaign.status, 'DRAFT'); // Always starts in DRAFT
    assert.ok(body.data.campaign.webhookSecret);

    syntheticCampaignId = body.data.campaign.id;
    tracker.trackCampaign(syntheticCampaignId);

    // Verify audit log entry
    const audit = await AdminAuditLog.findOne({
      targetId: syntheticCampaignId,
      action: 'CREATE_CAMPAIGN',
    });
    assert.ok(audit);
    tracker.trackAuditLog(audit._id);
  });

  it('2. Admin creates synthetic task; publication is guarded while campaign is in DRAFT', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Create synthetic task with exactly 10 PTS reward and 1s dwell time
    const res = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: syntheticCampaignId,
        title: 'E2E Synthetic Task — 10 PTS',
        description: 'Complete verified in-app engagement action',
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 10, // Exactly 10 promotional points
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 3, // 3s wall-clock dwell time to account for Atlas cloud network latency
        instructions: 'Open task card and maintain view for 1 second to verify engagement.',
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.task.status, 'DRAFT');
    assert.equal(body.data.task.rewardPoints, 10);

    syntheticTaskId = body.data.task.id;
    tracker.trackTask(syntheticTaskId);

    // Publication guard: Must reject publication if parent campaign is DRAFT
    const publishRes = await fetch(`${baseUrl}/api/admin/tasks/${syntheticTaskId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(publishRes.status, 400);
    const publishBody = (await publishRes.json()) as any;
    assert.equal(publishBody.error.code, 'CAMPAIGN_NOT_ACTIVE');
  });

  it('3. Admin activates campaign and publishes synthetic task', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Activate campaign with verified agreementRef
    const activateRes = await fetch(`${baseUrl}/api/admin/campaigns/${syntheticCampaignId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        authorizedAgreementRef: 'AGR-E2E-SYNTH-001',
      }),
    });

    assert.equal(activateRes.status, 200);
    const activateBody = (await activateRes.json()) as any;
    assert.equal(activateBody.data.campaign.status, 'ACTIVE');

    // Publish task
    const publishRes = await fetch(`${baseUrl}/api/admin/tasks/${syntheticTaskId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(publishRes.status, 200);
    const publishBody = (await publishRes.json()) as any;
    assert.equal(publishBody.data.task.status, 'PUBLISHED');
  });

  it('4. User sees published task in live mobile feed with 10 PTS and eligibility true', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(feedRes.status, 200);
    const feedBody = (await feedRes.json()) as any;
    assert.equal(feedBody.success, true);
    assert.ok(Array.isArray(feedBody.data.tasks));

    const taskInFeed = feedBody.data.tasks.find((t: any) => t.id === syntheticTaskId);
    assert.ok(taskInFeed, 'Published task must appear in user feed');
    assert.equal(taskInFeed.rewardPoints, 10);
    assert.equal(taskInFeed.dwellTimeSeconds, 3);
    assert.equal(taskInFeed.isEligible, true);
    assert.equal(taskInFeed.completedToday, 0);
    assert.equal(taskInFeed.hasActiveAssignment, false);
  });

  it('5. User starts task and receives secure assignment clickId token', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const startRes = await fetch(`${baseUrl}/api/tasks/${syntheticTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    assert.equal(startBody.success, true);
    assert.ok(startBody.data.assignment);
    assert.ok(startBody.data.assignment.clickId.startsWith('clk_'));
    assert.equal(startBody.data.assignment.status, 'ASSIGNED');

    user1ClickId = startBody.data.assignment.clickId;
    user1AssignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(user1AssignmentId);
  });

  it('6. Duplicate start request is rejected with HTTP 409 DUPLICATE_ACTIVE_ASSIGNMENT', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const dupRes = await fetch(`${baseUrl}/api/tasks/${syntheticTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(dupRes.status, 409);
    const dupBody = (await dupRes.json()) as any;
    assert.equal(dupBody.error.code, 'DUPLICATE_ACTIVE_ASSIGNMENT');
    assert.ok(dupBody.error.details);
    assert.equal(dupBody.error.details.assignmentId, user1AssignmentId);
    assert.equal(dupBody.error.details.clickId, user1ClickId);
    assert.ok(dupBody.error.details.assignedAt);
    assert.ok(dupBody.error.details.expiresAt);
    assert.equal(dupBody.data.assignmentId, user1AssignmentId);
  });

  it('6b. App reload during active assignment: Feed returns hasActiveAssignment with assignedAt', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(feedRes.status, 200);
    const feedBody = (await feedRes.json()) as any;
    const task = feedBody.data.tasks.find((t: any) => t.id === syntheticTaskId);
    assert.ok(task);
    assert.equal(task.hasActiveAssignment, true);
    assert.ok(task.activeAssignment);
    assert.equal(task.activeAssignment.id, user1AssignmentId);
    assert.ok(task.activeAssignment.assignedAt);
  });

  it('6c. Resume existing assignment: Status endpoint returns active assignment with elapsed time capability', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const statusRes = await fetch(`${baseUrl}/api/tasks/${syntheticTaskId}/status`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as any;
    assert.equal(statusBody.success, true);
    assert.equal(statusBody.data.hasAssignment, true);
    assert.equal(statusBody.data.assignment.id, user1AssignmentId);
    assert.ok(statusBody.data.assignment.assignedAt);
    assert.equal(statusBody.data.assignment.isExpired, false);
  });

  it('7. Anti-speedrun: Immediate verification before elapsed dwell time is rejected with HTTP 400', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Call verify-action immediately (< 100ms elapsed vs 1000ms required)
    const fastRes = await fetch(`${baseUrl}/api/tasks/${syntheticTaskId}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(fastRes.status, 400);
    const fastBody = (await fastRes.json()) as any;
    assert.equal(fastBody.error.code, 'INSUFFICIENT_DWELL_TIME');

    // Confirm 0 completion records exist
    const count = await TaskCompletion.countDocuments({
      taskId: syntheticTaskId,
      userId: standardUser1._id,
    });
    assert.equal(count, 0);
  });

  it('8. Timing compliance: Verification succeeds after dwell time and awards exactly 10 PTS', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Wait required wall-clock dwell time (3100ms > 3000ms)
    await new Promise((resolve) => setTimeout(resolve, 3100));

    const verifyRes = await fetch(`${baseUrl}/api/tasks/${syntheticTaskId}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.success, true);
    assert.equal(verifyBody.data.completion.status, 'VERIFIED');
    assert.equal(verifyBody.data.completion.rewardPoints, 10);

    tracker.trackCompletion(verifyBody.data.completion.id);

    // Verify exactly one completion record exists in database
    const count = await TaskCompletion.countDocuments({
      taskId: syntheticTaskId,
      userId: standardUser1._id,
    });
    assert.equal(count, 1);
  });

  it('9. Replay protection: Repeated verification attempt does not create duplicate points', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const replayRes = await fetch(`${baseUrl}/api/tasks/${syntheticTaskId}/verify-action`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    // Assignment was already marked COMPLETED, so no active assignment exists
    assert.equal(replayRes.status, 404);
    const replayBody = (await replayRes.json()) as any;
    assert.equal(replayBody.error.code, 'NO_ACTIVE_ASSIGNMENT');

    // Confirm still exactly 1 completion record
    const count = await TaskCompletion.countDocuments({
      taskId: syntheticTaskId,
      userId: standardUser1._id,
    });
    assert.equal(count, 1);
  });

  it('10. Task history reflects the verified completion with +10 PTS', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const historyRes = await fetch(`${baseUrl}/api/tasks/history`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(historyRes.status, 200);
    const historyBody = (await historyRes.json()) as any;
    assert.equal(historyBody.success, true);

    const completion = historyBody.data.completions.find((c: any) => c.task?.id === syntheticTaskId);
    assert.ok(completion, 'Completed task must appear in history');
    assert.equal(completion.status, 'VERIFIED');
    assert.equal(completion.rewardPoints, 10);
    assert.equal(completion.verificationMethod, 'FIRST_PARTY_ACTION');
  });

  it('11. User feed updates to reflect daily cap reached', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    assert.equal(feedRes.status, 200);
    const feedBody = (await feedRes.json()) as any;
    const taskInFeed = feedBody.data.tasks.find((t: any) => t.id === syntheticTaskId);

    assert.ok(taskInFeed);
    assert.equal(taskInFeed.completedToday, 1);
    assert.equal(taskInFeed.isEligible, false);
    assert.equal(taskInFeed.ineligibilityReason, 'Daily completion limit reached');
  });

  it('12. Lifecycle: Admin pauses task and it immediately disappears from user feeds', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Admin pauses task
    const pauseRes = await fetch(`${baseUrl}/api/admin/tasks/${syntheticTaskId}/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(pauseRes.status, 200);

    // Fresh user (user2) checks feed: paused task must be completely omitted
    const feedRes = await fetch(`${baseUrl}/api/tasks/feed`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });

    assert.equal(feedRes.status, 200);
    const feedBody = (await feedRes.json()) as any;
    const taskInFeed = feedBody.data.tasks.find((t: any) => t.id === syntheticTaskId);
    assert.equal(taskInFeed, undefined, 'Paused task must not appear in user feed');
  });

  it('13. Concurrent start attempts: Exactly one request succeeds with 201 and concurrent attempts receive 409 DUPLICATE_ACTIVE_ASSIGNMENT', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Create a fresh published task for concurrency testing
    const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: syntheticCampaignId,
        title: 'E2E Concurrency Test Task',
        description: 'Verify concurrency guards',
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 10,
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 1,
      }),
    });
    assert.equal(createRes.status, 201);
    const createBody = (await createRes.json()) as any;
    const concurTaskId = createBody.data.task.id;
    tracker.trackTask(concurTaskId);

    // Publish task
    await fetch(`${baseUrl}/api/admin/tasks/${concurTaskId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Fire 3 simultaneous start requests from user2
    const results = await Promise.all([
      fetch(`${baseUrl}/api/tasks/${concurTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user2Token}` },
      }),
      fetch(`${baseUrl}/api/tasks/${concurTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user2Token}` },
      }),
      fetch(`${baseUrl}/api/tasks/${concurTaskId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user2Token}` },
      }),
    ]);

    const statuses = results.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 201).length;
    const dupCount = statuses.filter((s) => s === 409).length;

    assert.equal(successCount, 1, 'Exactly one concurrent request must succeed with 201');
    assert.equal(dupCount, 2, 'Other concurrent requests must be rejected with 409');

    // Retrieve assignment created
    const successIndex = statuses.indexOf(201);
    const successBody = (await results[successIndex].json()) as any;
    const assignmentId = successBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Verify 409 bodies provide recovery payload
    for (let i = 0; i < results.length; i++) {
      if (i !== successIndex) {
        const dupBody = (await results[i].json()) as any;
        assert.equal(dupBody.error.code, 'DUPLICATE_ACTIVE_ASSIGNMENT');
        assert.equal(dupBody.error.details.assignmentId, assignmentId);
      }
    }
  });

  it('14. Expired assignment handling: Expired assignment transitions status to EXPIRED and allows restarting', async (t) => {
    if (isSuiteBlocked) {
      t.skip(blockReason);
      return;
    }

    // Create another task
    const createRes = await fetch(`${baseUrl}/api/admin/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        campaignId: syntheticCampaignId,
        title: 'E2E Expiry Test Task',
        description: 'Verify expiry handling',
        category: 'IN_APP_ACTION',
        verificationMethod: 'FIRST_PARTY_ACTION',
        rewardPoints: 10,
        totalCap: 10,
        dailyCapPerUser: 1,
        dwellTimeSeconds: 1,
      }),
    });
    const createBody = (await createRes.json()) as any;
    const expiryTaskId = createBody.data.task.id;
    tracker.trackTask(expiryTaskId);

    await fetch(`${baseUrl}/api/admin/tasks/${expiryTaskId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Start task assignment
    const startRes = await fetch(`${baseUrl}/api/tasks/${expiryTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Simulate assignment expiry by setting expiresAt into the past
    await TaskAssignment.updateOne(
      { _id: new Types.ObjectId(assignmentId) },
      { $set: { expiresAt: new Date(Date.now() - 60000) } }
    );

    // Query status: must reflect EXPIRED and isExpired: true
    const statusRes = await fetch(`${baseUrl}/api/tasks/${expiryTaskId}/status`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as any;
    assert.equal(statusBody.data.assignment.status, 'EXPIRED');
    assert.equal(statusBody.data.assignment.isExpired, true);

    // Starting the task again succeeds with 201 because the previous assignment expired
    const restartRes = await fetch(`${baseUrl}/api/tasks/${expiryTaskId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(restartRes.status, 201);
    const restartBody = (await restartRes.json()) as any;
    assert.notEqual(restartBody.data.assignment.id, assignmentId);
    tracker.trackAssignment(restartBody.data.assignment.id);
  });
});
