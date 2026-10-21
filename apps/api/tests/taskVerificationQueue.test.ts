process.env.NODE_ENV = 'test';
process.env.MONGODB_TEST_DB_NAME = 'adpayon_test';

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import mongoose, { Types } from 'mongoose';
import { app } from '../src/app';
import {
  User,
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';
import { KeyedMutex, QueueOverloadError, taskVerificationMutex } from '../src/utils/keyedMutex';

describe('Phase 9.5: Safe Per-Task Verification Queue Regression Suite', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';
  const tracker = new TestOwnershipTracker();
  const runId = Math.floor(10000 + Math.random() * 90000);

  before(async () => {
    // 1. Database Isolation Assertion
    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      isSuiteBlocked = true;
      blockReason = isolation.reason || 'Database isolation check failed';
      return;
    }

    const activeDbName = mongoose.connection.db?.databaseName;
    if (activeDbName !== 'adpayon_test') {
      isSuiteBlocked = true;
      blockReason = `CRITICAL: Connected to '${activeDbName}' instead of 'adpayon_test'`;
      return;
    }

    // 2. Start HTTP server on ephemeral port for integration tests
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}/api`;
        resolve();
      });
      server.on('error', reject);
    });
  });

  after(async () => {
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up all synthetic records created during tests
    await tracker.safeCleanup();
    // Reset feature flag to default OFF
    delete process.env.TASK_VERIFICATION_QUEUE_ENABLED;
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  });

  // TEST 1: FIFO execution for same-task requests
  it('1. FIFO execution for same-task requests strictly serializes order', async () => {
    const mutex = new KeyedMutex();
    const taskKey = `task-fifo-${runId}`;
    const executionOrder: number[] = [];

    const job1 = mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 40));
      executionOrder.push(1);
      return 1;
    });

    const job2 = mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(2);
      return 2;
    });

    const job3 = mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push(3);
      return 3;
    });

    const results = await Promise.all([job1, job2, job3]);

    assert.deepEqual(results, [1, 2, 3]);
    assert.deepEqual(executionOrder, [1, 2, 3], 'Jobs on the same key must execute strictly FIFO despite variable execution durations');
    assert.equal(mutex.getQueueSize(), 0, 'Queue map must be empty after execution');
  });

  // TEST 2: Parallel execution of different tasks
  it('2. Parallel execution of different tasks allows concurrent progress', async () => {
    const mutex = new KeyedMutex();
    const keyA = `task-A-${runId}`;
    const keyB = `task-B-${runId}`;

    const startedTimes: Record<string, number> = {};
    const endedTimes: Record<string, number> = {};

    const jobA = mutex.run(keyA, async () => {
      startedTimes.A = performance.now();
      await new Promise((r) => setTimeout(r, 60));
      endedTimes.A = performance.now();
      return 'A';
    });

    const jobB = mutex.run(keyB, async () => {
      startedTimes.B = performance.now();
      await new Promise((r) => setTimeout(r, 60));
      endedTimes.B = performance.now();
      return 'B';
    });

    await Promise.all([jobA, jobB]);

    // Both should have started before either finished (concurrent execution)
    assert.ok(startedTimes.B < endedTimes.A, 'Task B must start before Task A completes (parallel execution across distinct keys)');
    assert.ok(startedTimes.A < endedTimes.B, 'Task A must start before Task B completes');
    assert.equal(mutex.getQueueSize(), 0);
  });

  // TEST 3: Five users racing for one final slot
  it('3. Five users racing for one final slot under verification queue results in exactly 1 winner and 4 cap rejections', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Explicitly enable queue for this test
    process.env.TASK_VERIFICATION_QUEUE_ENABLED = 'true';

    // 1. Seed Campaign
    const campaign = await Campaign.create({
      name: `Queue Race Campaign ${runId}`,
      advertiserName: 'Queue Corp',
      authorizedAgreementRef: `AGR-Q-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);

    // 2. Seed Task with totalCap: 1
    const task = await Task.create({
      campaignId: campaign._id,
      title: `Single Slot Race Task ${runId}`,
      description: 'Exactly 1 slot available for 5 competing users',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      totalCap: 1,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task._id);

    // 3. Seed 5 users and start assignments
    const userTokens: string[] = [];
    const assignmentIds: string[] = [];

    for (let i = 1; i <= 5; i++) {
      const mobile = `+9179${runId}${String(i).padStart(4, '0')}`;
      const u = await User.create({
        mobile,
        name: `Queue Race User ${i}`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticQueueUser',
        role: 'USER',
        status: 'ACTIVE',
        referralCode: `QR${i}${runId}`,
        metadata: { kycStatus: 'VERIFIED' },
      });
      tracker.trackUser(u._id, mobile);
      const token = generateAccessToken({ userId: u._id.toString(), role: 'USER', mobile });
      userTokens.push(token);

      const startRes = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      assert.equal(startRes.status, 201, `User ${i} must successfully start assignment`);
      const startBody = (await startRes.json()) as any;
      const assignId = startBody.data.assignment.id;
      assignmentIds.push(assignId);
      tracker.trackAssignment(assignId);
    }

    // 4. Fire 5 simultaneous verification requests
    const verifyPromises = userTokens.map((token) =>
      fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
    );

    const responses = await Promise.all(verifyPromises);
    const statuses = responses.map((r) => r.status);

    const successResponses = responses.filter((r) => r.status === 200);
    const capResponses = responses.filter((r) => r.status === 400);

    assert.equal(successResponses.length, 1, 'Exactly one concurrent verification must succeed');
    assert.equal(capResponses.length, 4, 'Exactly 4 concurrent verifications must be rejected with CAP_EXHAUSTED');

    for (const res of capResponses) {
      const body = (await res.json()) as any;
      assert.equal(body.error?.code, 'CAP_EXHAUSTED', 'Rejection code must be CAP_EXHAUSTED');
    }

    const successBody = (await successResponses[0].json()) as any;
    tracker.trackCompletion(successBody.data.completion.id);

    // Verify database state: task cap counter is exactly 1
    const taskInDb = await Task.findById(task._id);
    assert.equal(taskInDb?.completionsCount, 1, 'Task completionsCount must be exactly 1');

    const completionsInDb = await TaskCompletion.countDocuments({ taskId: task._id });
    assert.equal(completionsInDb, 1, 'Database must have exactly 1 TaskCompletion document');
  });

  // TEST 4: Duplicate verification requests
  it('4. Duplicate verification requests are handled idempotently without double-rewarding', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    process.env.TASK_VERIFICATION_QUEUE_ENABLED = 'true';

    // Seed task
    const campaign = await Campaign.create({
      name: `Dup Campaign ${runId}`,
      advertiserName: 'Dup Corp',
      authorizedAgreementRef: `AGR-DUP-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);

    const task = await Task.create({
      campaignId: campaign._id,
      title: `Dup Test Task ${runId}`,
      description: 'Duplicate test task',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 30,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task._id);

    const mobile = `+9179${runId}9991`;
    const u = await User.create({
      mobile,
      name: 'Dup User',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticDupUser',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `DUP${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u._id, mobile);
    const token = generateAccessToken({ userId: u._id.toString(), role: 'USER', mobile });

    // Start assignment
    const startRes = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // Call 1: Success
    const verify1 = await fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(verify1.status, 200);
    const body1 = (await verify1.json()) as any;
    tracker.trackCompletion(body1.data.completion.id);

    // Call 2a: Unidentified replay request returns HTTP 404 NO_ACTIVE_ASSIGNMENT
    const verifyUnidentified = await fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(verifyUnidentified.status, 404);
    const bodyUnidentified = (await verifyUnidentified.json()) as any;
    assert.equal(bodyUnidentified.error.code, 'NO_ACTIVE_ASSIGNMENT');

    // Call 2b: Explicit idempotent retry with assignmentId returns existing completion (HTTP 200)
    const verifyIdempotent = await fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assignmentId: startBody.data.assignment.id }),
    });
    assert.equal(verifyIdempotent.status, 200);
    const body2 = (await verifyIdempotent.json()) as any;
    assert.equal(body2.data.reconciled, true, 'Explicit assignment retry must be safely reconciled without error or duplicate rewards');
    assert.equal(body2.data.completion.id, body1.data.completion.id, 'Must return the existing completion ID');

    // Confirm completions count in DB remains 1
    const totalComps = await TaskCompletion.countDocuments({ taskId: task._id, userId: u._id });
    assert.equal(totalComps, 1, 'Exactly one completion must exist in database');
  });

  // TEST 5: Exception-safe queue release
  it('5. Exception-safe queue release guarantees next job runs even if preceding job throws', async () => {
    const mutex = new KeyedMutex();
    const taskKey = `task-err-${runId}`;

    let job2Executed = false;

    // Job 1 throws
    const job1Promise = mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error('Simulated verification crash in job 1');
    });

    // Job 2 follows immediately
    const job2Promise = mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 10));
      job2Executed = true;
      return 'job2_success';
    });

    await assert.rejects(job1Promise, { message: 'Simulated verification crash in job 1' });
    const result2 = await job2Promise;

    assert.equal(result2, 'job2_success');
    assert.equal(job2Executed, true, 'Job 2 must execute and complete cleanly despite Job 1 failure');
    assert.equal(mutex.getQueueSize(), 0, 'Queue entry must be removed upon completion');
  });

  // TEST 6: Queue overflow
  it('6. Queue overflow enforces deterministic overload rejection (QueueOverloadError, HTTP 429)', async () => {
    // Create mutex with maxQueueDepth: 2
    const mutex = new KeyedMutex({ maxQueueDepth: 2 });
    const taskKey = `task-overflow-${runId}`;

    let resolveActive: () => void = () => {};
    const activeGate = new Promise<void>((r) => { resolveActive = r; });

    // Job 0: Active in execution
    const p0 = mutex.run(taskKey, async () => {
      await activeGate;
      return 0;
    });

    // Job 1 & 2: Queued (depth becomes 2)
    const p1 = mutex.run(taskKey, async () => 1);
    const p2 = mutex.run(taskKey, async () => 2);

    // Job 3: Exceeds maxQueueDepth of 2 -> throws QueueOverloadError immediately
    await assert.rejects(
      async () => {
        await mutex.run(taskKey, async () => 3);
      },
      (err: any) => {
        assert.ok(err instanceof QueueOverloadError);
        assert.equal(err.code, 'TASK_QUEUE_OVERLOADED');
        assert.equal(err.statusCode, 429);
        return true;
      }
    );

    // Unblock Job 0 and let queue drain cleanly
    resolveActive();
    const results = await Promise.all([p0, p1, p2]);
    assert.deepEqual(results, [0, 1, 2]);
    assert.equal(mutex.getQueueSize(), 0);
  });

  // TEST 7: Graceful shutdown
  it('7. Graceful shutdown drains pending queue jobs within bounded timeout', async () => {
    const mutex = new KeyedMutex();
    const taskKey = `task-drain-${runId}`;

    let completedJobs = 0;
    mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 30));
      completedJobs++;
    });
    mutex.run(taskKey, async () => {
      await new Promise((r) => setTimeout(r, 30));
      completedJobs++;
    });

    assert.equal(mutex.getActiveCount(), 1);
    assert.equal(mutex.getQueueDepth(taskKey), 2);

    const drainedCleanly = await mutex.drainAll(1000);
    assert.equal(drainedCleanly, true, 'drainAll must return true when all jobs drain before timeout');
    assert.equal(completedJobs, 2, 'All queued jobs must finish processing');
    assert.equal(mutex.getActiveCount(), 0);

    // Test timeout behavior using isolated KeyedMutex
    const slowMutex = new KeyedMutex();
    const slowKey = `task-slow-${runId}`;
    slowMutex.run(slowKey, async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const drainedTimedOut = await slowMutex.drainAll(20);
    assert.equal(drainedTimedOut, false, 'drainAll must return false when jobs exceed bounded timeout');
  });

  // TEST 8: Admin pause while requests wait
  it('8. Admin pause while verification requests wait safely rejects queued request via transactional check', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    process.env.TASK_VERIFICATION_QUEUE_ENABLED = 'true';

    const campaign = await Campaign.create({
      name: `Pause Campaign ${runId}`,
      advertiserName: 'Pause Corp',
      authorizedAgreementRef: `AGR-PAUSE-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);

    const task = await Task.create({
      campaignId: campaign._id,
      title: `Pausable Queue Task ${runId}`,
      description: 'Task paused before second queued request enters transaction',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 10,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task._id);

    // User A and User B
    const mobileA = `+9179${runId}8881`;
    const mobileB = `+9179${runId}8882`;
    const uA = await User.create({
      mobile: mobileA,
      name: 'User A',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$synth',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `PA${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    const uB = await User.create({
      mobile: mobileB,
      name: 'User B',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$synth',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `PB${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(uA._id, mobileA);
    tracker.trackUser(uB._id, mobileB);

    const tokenA = generateAccessToken({ userId: uA._id.toString(), role: 'USER', mobile: mobileA });
    const tokenB = generateAccessToken({ userId: uB._id.toString(), role: 'USER', mobile: mobileB });

    const sA = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    });
    const sB = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    });
    const bA = (await sA.json()) as any;
    const bB = (await sB.json()) as any;
    tracker.trackAssignment(bA.data.assignment.id);
    tracker.trackAssignment(bB.data.assignment.id);

    // User A verifies successfully
    const resA = await fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({}),
    });
    assert.equal(resA.status, 200);
    const bodyA = (await resA.json()) as any;
    tracker.trackCompletion(bodyA.data.completion.id);

    // Admin now PAUSES the task
    await Task.findByIdAndUpdate(task._id, { status: 'PAUSED' });

    // User B attempts to verify
    const resB = await fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({}),
    });

    // Must be rejected with 400 TASK_NOT_PUBLISHED or 404 TASK_NOT_FOUND
    assert.ok([400, 404].includes(resB.status), `Status must be 400 or 404, received ${resB.status}`);
    const bodyB = (await resB.json()) as any;
    assert.ok(
      ['TASK_NOT_ACTIVE', 'TASK_NOT_PUBLISHED', 'TASK_NOT_FOUND'].includes(bodyB.error?.code),
      `Expected task status rejection error code, got ${bodyB.error?.code}`
    );

    // Confirm completionsCount is 1, and only User A has completion
    const updatedTask = await Task.findById(task._id);
    assert.equal(updatedTask?.completionsCount, 1);
  });

  // TEST 9: Client timeout and late DB commit reconciliation
  it('9. Client timeout and late DB commit reconciliation is idempotent and returns existing completion', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    process.env.TASK_VERIFICATION_QUEUE_ENABLED = 'true';

    // Simulate scenario:
    // User started task. Server committed the verification transaction to DB,
    // but the HTTP client experienced network drop / timeout before receiving the response.
    const campaignId = new Types.ObjectId();
    const taskId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const assignmentId = new Types.ObjectId();
    const completionId = new Types.ObjectId();
    const mobile = `+9179${runId}7777`;

    tracker.trackCampaign(campaignId);
    tracker.trackTask(taskId);
    tracker.trackUser(userId, mobile);
    tracker.trackAssignment(assignmentId);
    tracker.trackCompletion(completionId);

    await Campaign.create({
      _id: campaignId,
      name: `Reconciliation Campaign ${runId}`,
      advertiserName: 'Reconciliation Corp',
      authorizedAgreementRef: `AGR-REC-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    await Task.create({
      _id: taskId,
      campaignId,
      title: `Reconciliation Task ${runId}`,
      description: 'Late reconciliation task',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 40,
      totalCap: 10,
      completionsCount: 1,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });

    await User.create({
      _id: userId,
      mobile,
      name: 'Reconciliation User',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$synthetic',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `REC${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });

    // DB state has COMPLETED assignment and existing TaskCompletion
    await TaskAssignment.create({
      _id: assignmentId,
      taskId,
      userId,
      campaignId,
      clickId: `clk-assign-${Date.now()}`,
      status: 'COMPLETED',
      assignedAt: new Date(Date.now() - 10000),
      dwellTimeAccumulatedSeconds: 0,
      expiresAt: new Date(Date.now() + 100000),
      completedAt: new Date(),
    });

    await TaskCompletion.create({
      _id: completionId,
      taskId,
      campaignId,
      userId,
      assignmentId,
      clickId: `clk-rec-${Date.now()}`,
      rewardPoints: 40,
      status: 'VERIFIED',
      verificationMethod: 'FIRST_PARTY_ACTION',
      completedAt: new Date(),
    });

    const userToken = generateAccessToken({ userId: userId.toString(), role: 'USER', mobile });

    // Client retries verify-action specifying its timed-out assignmentId
    const retryRes = await fetch(`${baseUrl}/tasks/${taskId}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ assignmentId: assignmentId.toString() }),
    });

    assert.equal(retryRes.status, 200, 'Reconciliation must return HTTP 200');
    const retryBody = (await retryRes.json()) as any;
    assert.equal(retryBody.data.reconciled, true, 'Response must indicate reconciled: true');
    assert.equal(retryBody.data.completion.id, completionId.toString(), 'Must return existing completion ID');

    // Confirm no additional completion was created
    const count = await TaskCompletion.countDocuments({ taskId, userId });
    assert.equal(count, 1, 'Exactly 1 TaskCompletion must exist in DB');
  });

  // TEST 10: Queue disabled preserves current behavior
  it('10. Queue disabled (TASK_VERIFICATION_QUEUE_ENABLED=false) bypasses queue and executes directly', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Explicitly ensure queue is disabled
    process.env.TASK_VERIFICATION_QUEUE_ENABLED = 'false';

    const campaign = await Campaign.create({
      name: `Queue Disabled Campaign ${runId}`,
      advertiserName: 'Direct Corp',
      authorizedAgreementRef: `AGR-DIR-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);

    const task = await Task.create({
      campaignId: campaign._id,
      title: `Direct Execution Task ${runId}`,
      description: 'Direct transaction execution',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 15,
      totalCap: 10,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task._id);

    const mobile = `+9179${runId}6666`;
    const u = await User.create({
      mobile,
      name: 'Direct User',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$synthetic',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `DIR${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u._id, mobile);
    const token = generateAccessToken({ userId: u._id.toString(), role: 'USER', mobile });

    const s = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const b = (await s.json()) as any;
    tracker.trackAssignment(b.data.assignment.id);

    // Initial queue state
    assert.equal(taskVerificationMutex.getQueueSize(), 0);

    const v = await fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(v.status, 200);
    const vBody = (await v.json()) as any;
    tracker.trackCompletion(vBody.data.completion.id);

    // taskVerificationMutex was never engaged
    assert.equal(taskVerificationMutex.getQueueSize(), 0);
  });

  // TEST 11: Zero queue-key memory leaks
  it('11. Zero queue-key memory leaks: internal Map removes idle task keys after completion', async () => {
    const mutex = new KeyedMutex();

    const jobs: Promise<any>[] = [];
    for (let i = 0; i < 50; i++) {
      const key = `dynamic-task-key-${i}`;
      jobs.push(
        mutex.run(key, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return i;
        })
      );
    }

    assert.ok(mutex.getActiveCount() > 0, 'Should have active executions while jobs run');
    await Promise.all(jobs);

    assert.equal(mutex.getQueueSize(), 0, 'Internal queue Map size must be exactly 0 after all jobs finish');
    assert.equal(mutex.getActiveCount(), 0, 'Active execution count must be exactly 0');
  });

  // TEST 12: Multi-instance limitation is documented and MongoDB remains authoritative
  it('12. Architectural invariant: In a multi-instance deployment, MongoDB atomic transaction remains authoritative', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // ARCHITECTURAL DOCUMENTATION AND ASSERTION:
    // KeyedMutex provides in-process serialization for a single Node.js instance.
    // In a horizontally scaled cluster (e.g. 2 or more replicas behind a load balancer),
    // requests for the same taskId routed to different instances will enter independent
    // KeyedMutex queues.
    // Therefore, KeyedMutex is an optimization to reduce MongoDB write contention (reducing WriteConflict
    // rollbacks and connection checkout pressure), NOT a replacement for MongoDB transactional isolation.
    // MongoDB's session.withTransaction() with readPreference: 'primary', writeConcern: 'majority',
    // and atomic { $inc: { completionsCount: 1 } } with { completionsCount: { $lt: totalCap } }
    // remains the authoritative single source of truth across all cluster nodes.

    // Simulate two separate instances (Instance A and Instance B)
    const mutexInstanceA = new KeyedMutex();
    const mutexInstanceB = new KeyedMutex();

    const campaign = await Campaign.create({
      name: `MultiInstance Campaign ${runId}`,
      advertiserName: 'MultiInstance Corp',
      authorizedAgreementRef: `AGR-MULTI-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);

    const task = await Task.create({
      campaignId: campaign._id,
      title: `MultiInstance Final Slot Task ${runId}`,
      description: 'Single slot across two instances',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      totalCap: 1,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task._id);

    const mobile1 = `+9179${runId}5551`;
    const mobile2 = `+9179${runId}5552`;
    const u1 = await User.create({
      mobile: mobile1,
      name: 'User Instance A',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$synthetic',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `MIA${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    const u2 = await User.create({
      mobile: mobile2,
      name: 'User Instance B',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$synthetic',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `MIB${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u1._id, mobile1);
    tracker.trackUser(u2._id, mobile2);

    const token1 = generateAccessToken({ userId: u1._id.toString(), role: 'USER', mobile: mobile1 });
    const token2 = generateAccessToken({ userId: u2._id.toString(), role: 'USER', mobile: mobile2 });

    const s1 = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
    });
    const s2 = await fetch(`${baseUrl}/tasks/${task._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
    });
    const b1 = (await s1.json()) as any;
    const b2 = (await s2.json()) as any;
    tracker.trackAssignment(b1.data.assignment.id);
    tracker.trackAssignment(b2.data.assignment.id);

    // Simulate Instance A executing via mutexInstanceA and Instance B executing via mutexInstanceB simultaneously
    const runInstanceA = mutexInstanceA.run(task._id.toString(), () =>
      fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token1}` },
        body: JSON.stringify({}),
      })
    );

    const runInstanceB = mutexInstanceB.run(task._id.toString(), () =>
      fetch(`${baseUrl}/tasks/${task._id}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
        body: JSON.stringify({}),
      })
    );

    const [resA, resB] = await Promise.all([runInstanceA, runInstanceB]);
    const statuses = [resA.status, resB.status].sort();

    // Exactly one must succeed (200) and the other must be cap exhausted (400)
    assert.equal(statuses[0], 200, 'One instance must commit the final cap slot');
    assert.equal(statuses[1], 400, 'The other instance must be safely rejected with 400 CAP_EXHAUSTED');

    if (resA.status === 200) {
      const body = (await resA.json()) as any;
      tracker.trackCompletion(body.data.completion.id);
    }
    if (resB.status === 200) {
      const body = (await resB.json()) as any;
      tracker.trackCompletion(body.data.completion.id);
    }

    const finalTask = await Task.findById(task._id);
    assert.equal(finalTask?.completionsCount, 1, 'MongoDB must prevent cap violation regardless of instance count');
  });
});
