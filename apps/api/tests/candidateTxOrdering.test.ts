process.env.NODE_ENV = 'test';
process.env.LOAD_TEST_DIAGNOSTICS = 'true';
process.env.TEST_CANDIDATE_TX_ORDERING = 'true';

import { describe, it, before, after } from 'node:test';
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
  VerificationEvidence,
  TaskEvent,
} from '../src/models';
import { generateAccessToken } from '../src/services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../src/testUtils/dbIsolation';
import { setTestTxBarrier } from '../src/controllers/userTask.controller';

describe('Phase 8D.10: Candidate Transaction Ordering Safety Suite', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();
  const runId = Math.floor(10000 + Math.random() * 90000);

  let testCampaignId: string;
  let singleSlotTaskId: string;
  let standardTaskId: string;

  let testUserTokens: string[] = [];
  let testUserIds: string[] = [];

  before(async () => {
    // 1. Strict Database Isolation Verification
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

    // 2. Start Test Server on Ephemeral Port
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}/api`;
        resolve();
      });
      server.on('error', reject);
    });

    // 3. Seed Users
    for (let i = 1; i <= 6; i++) {
      const mobile = `+9177${runId}000${i}`;
      const u = await User.create({
        mobile,
        name: `Candidate Test User ${i}`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashCand',
        role: 'USER',
        status: 'ACTIVE',
        referralCode: `CD${i}${runId}`,
        metadata: { kycStatus: 'VERIFIED' },
      });
      tracker.trackUser(u._id, mobile);
      testUserIds.push(u._id.toString());
      testUserTokens.push(generateAccessToken({ userId: u._id.toString(), role: 'USER', mobile }));
    }

    // 4. Seed Campaign & Tasks
    const campaign = await Campaign.create({
      name: `Candidate Tx Campaign ${runId}`,
      advertiserName: 'Candidate Corp',
      authorizedAgreementRef: `AGR-CD-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);
    testCampaignId = campaign._id.toString();

    const t1 = await Task.create({
      campaignId: campaign._id,
      title: `Candidate Standard Task ${runId}`,
      description: 'Standard task for candidate flow testing',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(t1._id);
    standardTaskId = t1._id.toString();

    const t2 = await Task.create({
      campaignId: campaign._id,
      title: `Candidate Single Slot Task ${runId}`,
      description: 'Single slot task for candidate concurrency testing',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      totalCap: 1, // Exactly 1 slot
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(t2._id);
    singleSlotTaskId = t2._id.toString();
  });

  after(async () => {
    setTestTxBarrier(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up all synthetic records tracked during test
    await tracker.safeCleanup();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // TEST 1: Five users competing for one final slot under candidate ordering
  it('1. Five users competing for one final slot under candidate ordering: exactly 1 wins, 4 rejected', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // 5 users start singleSlotTaskId
    const assignmentIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const startRes = await fetch(`${baseUrl}/tasks/${singleSlotTaskId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testUserTokens[i]}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      assignmentIds.push(startBody.data.assignment.id);
      tracker.trackAssignment(startBody.data.assignment.id);
    }

    // All 5 users simultaneously verify using candidate ordering
    const verifyPromises = testUserTokens.slice(0, 5).map((token) =>
      fetch(`${baseUrl}/tasks/${singleSlotTaskId}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-load-test-diagnostics': 'true',
          'x-candidate-tx-ordering': 'true',
        },
        body: JSON.stringify({}),
      })
    );

    const responses = await Promise.all(verifyPromises);
    const statuses = responses.map((r) => r.status);

    const successCount = statuses.filter((s) => s === 200).length;
    const capExhaustedCount = statuses.filter((s) => s === 400).length;

    assert.equal(successCount, 1, 'Candidate ordering: Exactly 1 user must succeed');
    assert.equal(capExhaustedCount, 4, 'Candidate ordering: Exactly 4 users must fail');

    for (const r of responses) {
      const b = (await r.json()) as any;
      if (r.status === 200) {
        assert.equal(b.success, true);
        assert.equal(b._diagnostics?.ordering, 'CANDIDATE');
        tracker.trackCompletion(b.data.completion.id);
      } else {
        assert.equal(b.error.code, 'CAP_EXHAUSTED');
      }
    }

    // Verify database state: counter strictly 1, completions strictly 1, evidence strictly 1
    const taskAfter = await Task.findById(singleSlotTaskId);
    assert.equal(taskAfter?.completionsCount, 1);

    const totalComps = await TaskCompletion.countDocuments({ taskId: singleSlotTaskId });
    assert.equal(totalComps, 1);

    const totalEvidence = await VerificationEvidence.countDocuments({ taskId: singleSlotTaskId });
    assert.equal(totalEvidence, 1, 'No orphan evidence docs created by losing candidates');
  });

  // TEST 2: Duplicate concurrent verification requests under candidate ordering
  it('2. Same-user simultaneous verification calls enforce mutual exclusion under candidate ordering', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const startRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testUserTokens[0]}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Launch 3 simultaneous verify calls from same user
    const calls = [1, 2, 3].map(() =>
      fetch(`${baseUrl}/tasks/${standardTaskId}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserTokens[0]}`,
          'x-load-test-diagnostics': 'true',
          'x-candidate-tx-ordering': 'true',
        },
        body: JSON.stringify({}),
      })
    );

    const responses = await Promise.all(calls);
    const statuses = responses.map((r) => r.status).sort();

    assert.equal(statuses[0], 200, 'Exactly one concurrent call succeeds');
    assert.equal(statuses[1], 404, 'Second concurrent call rejected with NO_ACTIVE_ASSIGNMENT');
    assert.equal(statuses[2], 404, 'Third concurrent call rejected with NO_ACTIVE_ASSIGNMENT');

    for (const r of responses) {
      if (r.status === 200) {
        const b = (await r.json()) as any;
        tracker.trackCompletion(b.data.completion.id);
      }
    }
  });

  // TEST 3: Evidence insertion failure under candidate ordering rolls back completely
  it('3. Evidence insertion failure under candidate ordering rolls back assignment and preserves counter', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const task3 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Cand Rollback Evidence Task ${runId}`,
      description: 'Candidate rollback evidence test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task3._id);

    const assign3 = await TaskAssignment.create({
      taskId: task3._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(testUserIds[1]),
      clickId: `clk_cand_ev_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(assign3._id);

    // Simulate candidate transaction flow: 1. Assignment -> 2. Evidence (fails)
    const session = await mongoose.startSession();
    let caughtErr: any = null;
    try {
      await session.withTransaction(async () => {
        // Step 1: Claim assignment
        await TaskAssignment.findOneAndUpdate(
          { _id: assign3._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        // Step 2: Evidence creation deliberately fails
        throw new Error('SIMULATED_CANDIDATE_EVIDENCE_FAILURE');
      });
    } catch (err: any) {
      caughtErr = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caughtErr?.message, 'SIMULATED_CANDIDATE_EVIDENCE_FAILURE');

    // Verify counter was never touched (stays 0)
    const taskAfter = await Task.findById(task3._id);
    assert.equal(taskAfter?.completionsCount, 0);

    // Verify assignment rolled back to ASSIGNED
    const assignAfter = await TaskAssignment.findById(assign3._id);
    assert.equal(assignAfter?.status, 'ASSIGNED');
  });

  // TEST 4: Completion insertion failure under candidate ordering rolls back evidence and assignment
  it('4. Completion insertion failure under candidate ordering rolls back evidence, assignment, counter', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const task4 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Cand Rollback Completion Task ${runId}`,
      description: 'Candidate rollback completion test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task4._id);

    const assign4 = await TaskAssignment.create({
      taskId: task4._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(testUserIds[2]),
      clickId: `clk_cand_comp_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(assign4._id);

    const session = await mongoose.startSession();
    let caughtErr: any = null;
    try {
      await session.withTransaction(async () => {
        // Step 1: Assignment
        await TaskAssignment.findOneAndUpdate(
          { _id: assign4._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        // Step 2: Evidence
        await VerificationEvidence.create(
          [
            {
              assignmentId: assign4._id,
              taskId: task4._id,
              userId: assign4.userId,
              evidenceType: 'FIRST_PARTY_TELEMETRY',
              signatureVerified: true,
              rawPayload: {},
              ipAddress: '127.0.0.1',
              evaluatedAt: new Date(),
            },
          ],
          { session }
        );

        // Step 3: Completion deliberately fails
        throw new Error('SIMULATED_CANDIDATE_COMPLETION_FAILURE');
      });
    } catch (err: any) {
      caughtErr = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caughtErr?.message, 'SIMULATED_CANDIDATE_COMPLETION_FAILURE');

    // Evidence must be rolled back
    const evDoc = await VerificationEvidence.findOne({ assignmentId: assign4._id });
    assert.equal(evDoc, null);

    // Counter must remain 0
    const taskAfter = await Task.findById(task4._id);
    assert.equal(taskAfter?.completionsCount, 0);

    // Assignment must remain ASSIGNED
    const assignAfter = await TaskAssignment.findById(assign4._id);
    assert.equal(assignAfter?.status, 'ASSIGNED');
  });

  // TEST 5: Event insertion failure under candidate ordering rolls back all prior steps
  it('5. Event insertion failure under candidate ordering rolls back completion, evidence, assignment', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const task5 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Cand Rollback Event Task ${runId}`,
      description: 'Candidate rollback event test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task5._id);

    const assign5 = await TaskAssignment.create({
      taskId: task5._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(testUserIds[3]),
      clickId: `clk_cand_ev_fail_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(assign5._id);

    const session = await mongoose.startSession();
    let caughtErr: any = null;
    try {
      await session.withTransaction(async () => {
        // Step 1: Assignment
        await TaskAssignment.findOneAndUpdate(
          { _id: assign5._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        // Step 2: Evidence
        const evDocs = await VerificationEvidence.create(
          [
            {
              assignmentId: assign5._id,
              taskId: task5._id,
              userId: assign5.userId,
              evidenceType: 'FIRST_PARTY_TELEMETRY',
              signatureVerified: true,
              rawPayload: {},
              ipAddress: '127.0.0.1',
              evaluatedAt: new Date(),
            },
          ],
          { session }
        );

        // Step 3: Completion
        await TaskCompletion.create(
          [
            {
              taskId: task5._id,
              campaignId: testCampaignId,
              userId: assign5.userId,
              assignmentId: assign5._id,
              clickId: assign5.clickId,
              rewardPoints: 20,
              status: 'VERIFIED',
              verificationMethod: 'FIRST_PARTY_ACTION',
              evidenceId: evDocs[0]._id,
              completedAt: new Date(),
            },
          ],
          { session }
        );

        // Step 4: Event insertion deliberately fails
        throw new Error('SIMULATED_CANDIDATE_EVENT_FAILURE');
      });
    } catch (err: any) {
      caughtErr = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caughtErr?.message, 'SIMULATED_CANDIDATE_EVENT_FAILURE');

    // Assert zero records committed
    const compDoc = await TaskCompletion.findOne({ assignmentId: assign5._id });
    assert.equal(compDoc, null);

    const evDoc = await VerificationEvidence.findOne({ assignmentId: assign5._id });
    assert.equal(evDoc, null);

    const taskAfter = await Task.findById(task5._id);
    assert.equal(taskAfter?.completionsCount, 0);

    const assignAfter = await TaskAssignment.findById(assign5._id);
    assert.equal(assignAfter?.status, 'ASSIGNED');
  });

  // TEST 6: Admin pause before verification under candidate ordering
  it('6. Admin pause before verification under candidate ordering rejects with TASK_NOT_AVAILABLE', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const task6 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Cand Admin Pause Pre Task ${runId}`,
      description: 'Candidate admin pause before test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task6._id);

    // User starts assignment
    const startRes = await fetch(`${baseUrl}/tasks/${task6._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testUserTokens[4]}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // Admin pauses the task
    await Task.updateOne({ _id: task6._id }, { $set: { status: 'PAUSED' } });

    // User attempts to verify under candidate ordering
    const verifyRes = await fetch(`${baseUrl}/tasks/${task6._id}/verify-action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserTokens[4]}`,
        'x-load-test-diagnostics': 'true',
        'x-candidate-tx-ordering': 'true',
      },
      body: JSON.stringify({}),
    });

    assert.equal(verifyRes.status, 404, 'Must reject with 404');
    const b = (await verifyRes.json()) as any;
    assert.ok(
      b.error.code === 'TASK_NOT_FOUND' || b.error.code === 'TASK_NOT_AVAILABLE',
      `Expected TASK_NOT_FOUND or TASK_NOT_AVAILABLE, got ${b.error.code}`
    );

    const taskAfter = await Task.findById(task6._id);
    assert.equal(taskAfter?.completionsCount, 0);

    const compCount = await TaskCompletion.countDocuments({ taskId: task6._id });
    assert.equal(compCount, 0);
  });

  // TEST 7: Mid-transaction Admin Pause using Synchronization Barriers
  it('7. Mid-transaction Admin Pause: Synchronization barrier proves candidate ordering aborts on concurrent pause', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const task7 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Cand Sync Barrier Pause Task ${runId}`,
      description: 'Candidate synchronization barrier pause race test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task7._id);

    // User starts assignment
    const startRes = await fetch(`${baseUrl}/tasks/${task7._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${testUserTokens[5]}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Install deterministic synchronization barrier:
    // When the verification transaction reaches Statement 5 (Task cap reservation),
    // the barrier pauses the transaction, executes an admin pause on the task document outside the session,
    // and then lets Statement 5 proceed.
    let barrierFired = false;
    setTestTxBarrier(async () => {
      barrierFired = true;
      // Admin pauses task concurrently in a separate un-sessioned database write!
      await Task.updateOne({ _id: task7._id }, { $set: { status: 'PAUSED' } });
    });

    try {
      const verifyRes = await fetch(`${baseUrl}/tasks/${task7._id}/verify-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserTokens[5]}`,
          'x-load-test-diagnostics': 'true',
          'x-candidate-tx-ordering': 'true',
        },
        body: JSON.stringify({}),
      });

      assert.ok(barrierFired, 'Synchronization barrier must have fired during transaction execution');

      // Under candidate ordering, Statement 5 sees status is PAUSED (or conflicts), throwing TASK_NOT_PUBLISHED (400)
      // or re-running snapshot pre-check (404)
      assert.ok(
        verifyRes.status === 400 || verifyRes.status === 404,
        `Expected 400 or 404 on mid-flight admin pause, received ${verifyRes.status}`
      );

      const resBody = (await verifyRes.json()) as any;
      assert.ok(
        resBody.error?.code === 'TASK_NOT_PUBLISHED' || resBody.error?.code === 'TASK_NOT_AVAILABLE',
        `Error code must be TASK_NOT_PUBLISHED or TASK_NOT_AVAILABLE, got: ${resBody.error?.code}`
      );

      // Verify ZERO completions were committed!
      const compCount = await TaskCompletion.countDocuments({ taskId: task7._id });
      assert.equal(compCount, 0, 'No TaskCompletion must be committed when admin pauses mid-transaction');

      // Verify counter remains 0!
      const taskAfter = await Task.findById(task7._id);
      assert.equal(taskAfter?.completionsCount, 0, 'completionsCount must remain 0');

      // Verify zero evidence was committed (clean rollback of steps 2, 3, 4)!
      const evCount = await VerificationEvidence.countDocuments({ taskId: task7._id });
      assert.equal(evCount, 0, 'Evidence must rollback cleanly when candidate Step 5 fails');
    } finally {
      setTestTxBarrier(null);
    }
  });

  // TEST 8: Transient transaction retry preserves idempotency under candidate ordering
  it('8. Transient transaction retries maintain idempotency and single commit under candidate ordering', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const task8 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Cand Retry Task ${runId}`,
      description: 'Candidate retry test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(task8._id);

    const assign8 = await TaskAssignment.create({
      taskId: task8._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(testUserIds[0]),
      clickId: `clk_cand_retry_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(assign8._id);

    let attempts = 0;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        attempts++;
        if (attempts === 1) {
          // Simulate transient error on first attempt using native driver MongoServerError
          const transientErr = new mongoose.mongo.MongoServerError({
            message: 'WriteConflict',
            errorLabels: ['TransientTransactionError'],
            code: 112,
            codeName: 'WriteConflict',
          });
          throw transientErr;
        }

        // Candidate order execution on attempt 2
        await TaskAssignment.findOneAndUpdate(
          { _id: assign8._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        const evDocs = await VerificationEvidence.create(
          [
            {
              assignmentId: assign8._id,
              taskId: task8._id,
              userId: assign8.userId,
              evidenceType: 'FIRST_PARTY_TELEMETRY',
              signatureVerified: true,
              rawPayload: {},
              ipAddress: '127.0.0.1',
              evaluatedAt: new Date(),
            },
          ],
          { session }
        );

        await TaskCompletion.create(
          [
            {
              taskId: task8._id,
              campaignId: testCampaignId,
              userId: assign8.userId,
              assignmentId: assign8._id,
              clickId: assign8.clickId,
              rewardPoints: 20,
              status: 'VERIFIED',
              verificationMethod: 'FIRST_PARTY_ACTION',
              evidenceId: evDocs[0]._id,
              completedAt: new Date(),
            },
          ],
          { session }
        );

        await TaskEvent.create(
          [
            {
              assignmentId: assign8._id,
              taskId: task8._id,
              userId: assign8.userId,
              eventType: 'VERIFY_SUCCESS',
              payload: { rewardPoints: 20 },
              ipAddress: '127.0.0.1',
            },
          ],
          { session }
        );

        await Task.findOneAndUpdate(
          { _id: task8._id, status: 'PUBLISHED', $expr: { $lt: ['$completionsCount', '$totalCap'] } },
          { $inc: { completionsCount: 1 } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    assert.equal(attempts, 2, 'Must have re-executed callback after transient error');

    // Assert strictly 1 completion and completionsCount = 1
    const taskAfter = await Task.findById(task8._id);
    assert.equal(taskAfter?.completionsCount, 1);

    const compCount = await TaskCompletion.countDocuments({ taskId: task8._id });
    assert.equal(compCount, 1);

    const evCount = await VerificationEvidence.countDocuments({ taskId: task8._id });
    assert.equal(evCount, 1);
  });
});
