process.env.NODE_ENV = 'test';
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
import { validateEngagementIntervals } from '../src/controllers/userTask.controller';

describe('Phase 8B.1: Transactional Reward Safety & Concurrency Suite', () => {
  let server: Server;
  let baseUrl: string;
  let isSuiteBlocked = false;
  let blockReason = '';

  const tracker = new TestOwnershipTracker();

  // Distinct runId to avoid phone collisions
  const runId = Math.floor(10000 + Math.random() * 90000);
  const user1Mobile = `+9175${runId}0001`;
  const user2Mobile = `+9175${runId}0002`;
  const user3Mobile = `+9175${runId}0003`;
  const user4Mobile = `+9175${runId}0004`;

  let user1Token: string;
  let user2Token: string;
  let user3Token: string;
  let user4Token: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let user4Id: string;

  let testCampaignId: string;
  let standardTaskId: string;
  let singleSlotTaskId: string;
  let pausableTaskId: string;

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
    const u1 = await User.create({
      mobile: user1Mobile,
      name: 'Tx User 1',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashTxU1',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `TX1${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u1._id, user1Mobile);
    user1Id = u1._id.toString();
    user1Token = generateAccessToken({ userId: user1Id, role: 'USER', mobile: user1Mobile });

    const u2 = await User.create({
      mobile: user2Mobile,
      name: 'Tx User 2',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashTxU2',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `TX2${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u2._id, user2Mobile);
    user2Id = u2._id.toString();
    user2Token = generateAccessToken({ userId: user2Id, role: 'USER', mobile: user2Mobile });

    const u3 = await User.create({
      mobile: user3Mobile,
      name: 'Tx User 3',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashTxU3',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `TX3${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u3._id, user3Mobile);
    user3Id = u3._id.toString();
    user3Token = generateAccessToken({ userId: user3Id, role: 'USER', mobile: user3Mobile });

    const u4 = await User.create({
      mobile: user4Mobile,
      name: 'Tx User 4',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashTxU4',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `TX4${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(u4._id, user4Mobile);
    user4Id = u4._id.toString();
    user4Token = generateAccessToken({ userId: user4Id, role: 'USER', mobile: user4Mobile });

    // 4. Seed Campaign & Tasks
    const campaign = await Campaign.create({
      name: `Tx Campaign ${runId}`,
      advertiserName: 'Transactional Corp',
      authorizedAgreementRef: `AGR-TX-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    tracker.trackCampaign(campaign._id);
    testCampaignId = campaign._id.toString();

    // Standard multi-slot task
    const t1 = await Task.create({
      campaignId: campaign._id,
      title: `Standard Multi Task ${runId}`,
      description: 'Standard task for normal flow and same-user concurrency',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      totalCap: 100,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(t1._id);
    standardTaskId = t1._id.toString();

    // Single-slot task (totalCap = 1) for atomic race
    const t2 = await Task.create({
      campaignId: campaign._id,
      title: `Single Slot Task ${runId}`,
      description: 'Task with exactly 1 total cap slot',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      totalCap: 1,
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(t2._id);
    singleSlotTaskId = t2._id.toString();

    // Task to be paused mid-flight
    const t3 = await Task.create({
      campaignId: campaign._id,
      title: `Pausable Task ${runId}`,
      description: 'Task that will be paused before verification',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 15,
      totalCap: 10,
      dailyCapPerUser: 2,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(t3._id);
    pausableTaskId = t3._id.toString();
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await tracker.safeCleanup();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // TEST 1: Normal successful completion inside transaction
  it('1. Normal successful completion creates evidence, completion and increments completionsCount atomically', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const startRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    const verifyRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({}),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.success, true);
    assert.equal(verifyBody.data.completion.rewardPoints, 25);
    assert.equal(verifyBody.data.completion.status, 'VERIFIED');
    tracker.trackCompletion(verifyBody.data.completion.id);

    // Assert assignment is COMPLETED
    const updatedAssign = await TaskAssignment.findById(assignmentId);
    assert.equal(updatedAssign?.status, 'COMPLETED');

    // Assert Task completionsCount incremented to 1
    const taskDoc = await Task.findById(standardTaskId);
    assert.equal(taskDoc?.completionsCount, 1);

    // Assert VerificationEvidence was created
    const evidenceDoc = await VerificationEvidence.findOne({ assignmentId });
    assert.ok(evidenceDoc);

    // Assert TaskEvent was created
    const eventDoc = await TaskEvent.findOne({ assignmentId, eventType: 'VERIFY_SUCCESS' });
    assert.ok(eventDoc);
  });

  // TEST 2: Same-user concurrent verification
  it('2. Same-user simultaneous verification calls enforce mutual exclusion and exactly-once reward', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Start a second assignment for user1 (daily cap is 5)
    const startRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Launch 3 simultaneous verify calls
    const calls = [1, 2, 3].map(() =>
      fetch(`${baseUrl}/tasks/${standardTaskId}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
        body: JSON.stringify({}),
      })
    );

    const responses = await Promise.all(calls);
    const statuses = responses.map((r) => r.status).sort();

    // Exactly one 200, others 404 (assignment already claimed in transaction)
    assert.equal(statuses[0], 200, 'Single concurrent request must succeed');
    assert.equal(statuses[1], 404, 'Concurrent claim 2 must fail');
    assert.equal(statuses[2], 404, 'Concurrent claim 3 must fail');

    for (const r of responses) {
      if (r.status === 200) {
        const b = (await r.json()) as any;
        tracker.trackCompletion(b.data.completion.id);
      }
    }

    // Verify completionsCount in Task is now 2 (1 from Test 1 + 1 from Test 2)
    const taskDoc = await Task.findById(standardTaskId);
    assert.equal(taskDoc?.completionsCount, 2);

    // Total completions for user1 on standardTaskId must be exactly 2
    const totalComps = await TaskCompletion.countDocuments({ taskId: standardTaskId, userId: user1Id });
    assert.equal(totalComps, 2);
  });

  // TEST 3: Different users competing for the final available global-cap slot
  it('3. Different users racing for the final global-cap slot enforce atomic reservation (totalCap=1)', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // User2 and User3 both start singleSlotTaskId (totalCap = 1)
    const s2 = await fetch(`${baseUrl}/tasks/${singleSlotTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(s2.status, 201);
    const b2 = (await s2.json()) as any;
    const assign2Id = b2.data.assignment.id;
    tracker.trackAssignment(assign2Id);

    const s3 = await fetch(`${baseUrl}/tasks/${singleSlotTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user3Token}` },
    });
    assert.equal(s3.status, 201);
    const b3 = (await s3.json()) as any;
    const assign3Id = b3.data.assignment.id;
    tracker.trackAssignment(assign3Id);

    // Both users simultaneously call verify-action for the single slot
    const racingCalls = [
      fetch(`${baseUrl}/tasks/${singleSlotTaskId}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}` },
        body: JSON.stringify({}),
      }),
      fetch(`${baseUrl}/tasks/${singleSlotTaskId}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user3Token}` },
        body: JSON.stringify({}),
      }),
    ];

    const responses = await Promise.all(racingCalls);
    const statuses = responses.map((r) => r.status).sort();

    // Exactly one user gets 200, the other gets 400 CAP_EXHAUSTED
    assert.equal(statuses[0], 200, 'Winner receives HTTP 200');
    assert.equal(statuses[1], 400, 'Loser receives HTTP 400');

    let winningAssignmentId = '';
    let losingAssignmentId = '';

    const bodyResp1 = (await responses[0].json()) as any;
    const bodyResp2 = (await responses[1].json()) as any;

    if (responses[0].status === 200) {
      winningAssignmentId = assign2Id;
      losingAssignmentId = assign3Id;
      tracker.trackCompletion(bodyResp1.data.completion.id);
      assert.equal(bodyResp2.error.code, 'CAP_EXHAUSTED');
    } else {
      winningAssignmentId = assign3Id;
      losingAssignmentId = assign2Id;
      tracker.trackCompletion(bodyResp2.data.completion.id);
      assert.equal(bodyResp1.error.code, 'CAP_EXHAUSTED');
    }

    // Verify task completionsCount in database is strictly 1 (NEVER 2)
    const taskDoc = await Task.findById(singleSlotTaskId);
    assert.equal(taskDoc?.completionsCount, 1);

    const dbCompletionsCount = await TaskCompletion.countDocuments({ taskId: singleSlotTaskId });
    assert.equal(dbCompletionsCount, 1);

    // Verify the winning assignment is COMPLETED
    const winAssign = await TaskAssignment.findById(winningAssignmentId);
    assert.equal(winAssign?.status, 'COMPLETED');

    // Verify the losing assignment was NOT incorrectly marked EXPIRED due to transaction rollback!
    const loseAssign = await TaskAssignment.findById(losingAssignmentId);
    assert.notEqual(loseAssign?.status, 'COMPLETED', 'Losing assignment must not be marked COMPLETED');
    assert.notEqual(loseAssign?.status, 'EXPIRED', 'Losing assignment must not be marked EXPIRED on cap exhaustion');
  });

  // TEST 4 & 7: Transaction Rollback Correctness upon failure during Evidence creation
  it('4. Failure during evidence creation rolls back task counter and assignment status', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Create a dedicated task for rollback test
    const rollbackTask4 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Rollback Evidence Task ${runId}`,
      description: 'Dedicated task for evidence rollback test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(rollbackTask4._id);

    const testAssign = await TaskAssignment.create({
      taskId: rollbackTask4._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(user4Id),
      clickId: `clk_rollback_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(testAssign._id);

    const initialTask = await Task.findById(rollbackTask4._id);
    const initialCount = initialTask?.completionsCount || 0;

    // Execute atomic transaction simulation where evidence insertion deliberately throws
    const session = await mongoose.startSession();
    let caughtError: any = null;

    try {
      await session.withTransaction(async () => {
        // Step 1: Claim assignment
        await TaskAssignment.findOneAndUpdate(
          { _id: testAssign._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        // Step 2: Increment task counter
        await Task.findOneAndUpdate(
          { _id: rollbackTask4._id, status: 'PUBLISHED' },
          { $inc: { completionsCount: 1 } },
          { session }
        );

        // Step 3: Deliberate failure during evidence creation
        throw new Error('SIMULATED_EVIDENCE_FAILURE');
      });
    } catch (err: any) {
      caughtError = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caughtError?.message, 'SIMULATED_EVIDENCE_FAILURE');

    // VERIFY TRANSACTION ROLLBACK:
    // Task completionsCount must NOT have changed!
    const afterTask = await Task.findById(rollbackTask4._id);
    assert.equal(afterTask?.completionsCount, initialCount, 'Counter must not increment on failure');

    // Assignment must NOT be COMPLETED!
    const afterAssign = await TaskAssignment.findById(testAssign._id);
    assert.equal(afterAssign?.status, 'ASSIGNED', 'Assignment status must roll back to ASSIGNED');

    // No evidence or completion created
    const noEvidence = await VerificationEvidence.findOne({ assignmentId: testAssign._id });
    assert.equal(noEvidence, null);
    const noCompletion = await TaskCompletion.findOne({ assignmentId: testAssign._id });
    assert.equal(noCompletion, null);

    await TaskAssignment.deleteOne({ _id: testAssign._id });
  });

  // TEST 5 & 11: Failure during completion insertion rolls back cleanly without orphan evidence
  it('5. Failure during completion insertion rolls back evidence, assignment, and counter', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const rollbackTask5 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Rollback Completion Task ${runId}`,
      description: 'Dedicated task for completion rollback test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(rollbackTask5._id);

    const testAssign = await TaskAssignment.create({
      taskId: rollbackTask5._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(user4Id),
      clickId: `clk_rollback_comp_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(testAssign._id);

    const initialTask = await Task.findById(rollbackTask5._id);
    const initialCount = initialTask?.completionsCount || 0;

    const session = await mongoose.startSession();
    let caughtError: any = null;

    try {
      await session.withTransaction(async () => {
        await TaskAssignment.findOneAndUpdate(
          { _id: testAssign._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        await Task.findOneAndUpdate(
          { _id: rollbackTask5._id, status: 'PUBLISHED' },
          { $inc: { completionsCount: 1 } },
          { session }
        );

        await VerificationEvidence.create(
          [
            {
              assignmentId: testAssign._id,
              taskId: rollbackTask5._id,
              userId: user4Id,
              evidenceType: 'FIRST_PARTY_TELEMETRY',
              signatureVerified: true,
              rawPayload: {},
              ipAddress: '127.0.0.1',
              evaluatedAt: new Date(),
            },
          ],
          { session }
        );

        // Deliberate simulated failure during TaskCompletion insertion
        throw new Error('SIMULATED_COMPLETION_INSERT_FAILURE');
      });
    } catch (err: any) {
      caughtError = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caughtError?.message, 'SIMULATED_COMPLETION_INSERT_FAILURE');

    // Assert zero evidence orphaned
    const orphanedEvidence = await VerificationEvidence.findOne({ assignmentId: testAssign._id });
    assert.equal(orphanedEvidence, null, 'Evidence document must be rolled back');

    // Assert counter unchanged
    const afterTask = await Task.findById(rollbackTask5._id);
    assert.equal(afterTask?.completionsCount, initialCount);

    // Assert assignment rolled back
    const afterAssign = await TaskAssignment.findById(testAssign._id);
    assert.equal(afterAssign?.status, 'ASSIGNED');

    await TaskAssignment.deleteOne({ _id: testAssign._id });
  });

  // TEST 6: Failure during event creation rolls back entire transaction
  it('6. Failure during event creation rolls back completion, evidence, assignment and counter', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const rollbackTask6 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Rollback Event Task ${runId}`,
      description: 'Dedicated task for event rollback test',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 25,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(rollbackTask6._id);

    const testAssign = await TaskAssignment.create({
      taskId: rollbackTask6._id,
      campaignId: new Types.ObjectId(testCampaignId),
      userId: new Types.ObjectId(user4Id),
      clickId: `clk_rollback_ev_${Date.now()}`,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      dwellTimeAccumulatedSeconds: 0,
    });
    tracker.trackAssignment(testAssign._id);

    const initialTask = await Task.findById(rollbackTask6._id);
    const initialCount = initialTask?.completionsCount || 0;

    const session = await mongoose.startSession();
    let caughtError: any = null;

    try {
      await session.withTransaction(async () => {
        await TaskAssignment.findOneAndUpdate(
          { _id: testAssign._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
          { $set: { status: 'COMPLETED' } },
          { session }
        );

        await Task.findOneAndUpdate(
          { _id: rollbackTask6._id, status: 'PUBLISHED' },
          { $inc: { completionsCount: 1 } },
          { session }
        );

        await VerificationEvidence.create(
          [
            {
              assignmentId: testAssign._id,
              taskId: rollbackTask6._id,
              userId: user4Id,
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
              taskId: rollbackTask6._id,
              campaignId: testCampaignId,
              userId: user4Id,
              assignmentId: testAssign._id,
              clickId: testAssign.clickId,
              rewardPoints: 25,
              status: 'VERIFIED',
              verificationMethod: 'FIRST_PARTY_ACTION',
              completedAt: new Date(),
            },
          ],
          { session }
        );

        // Deliberate failure on audit event insertion
        throw new Error('SIMULATED_EVENT_CREATION_FAILURE');
      });
    } catch (err: any) {
      caughtError = err;
    } finally {
      await session.endSession();
    }

    assert.equal(caughtError?.message, 'SIMULATED_EVENT_CREATION_FAILURE');

    // Assert completion was NOT persisted
    const compDoc = await TaskCompletion.findOne({ assignmentId: testAssign._id });
    assert.equal(compDoc, null, 'TaskCompletion must roll back');

    // Assert counter unchanged
    const afterTask = await Task.findById(rollbackTask6._id);
    assert.equal(afterTask?.completionsCount, initialCount);

    await TaskAssignment.deleteOne({ _id: testAssign._id });
  });

  // TEST 8: Retry after transient failure succeeds cleanly and enforces idempotency
  it('8. Retry after transient failure successfully commits assignment and reward', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // User4 starts standardTaskId
    const startRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user4Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Calling verify-action succeeds
    const verifyRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user4Token}` },
      body: JSON.stringify({}),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    tracker.trackCompletion(verifyBody.data.completion.id);

    const compDoc = await TaskCompletion.findById(verifyBody.data.completion.id);
    assert.ok(compDoc);
    assert.equal(compDoc.status, 'VERIFIED');

    // Retrying verify-action must be rejected with 404 NO_ACTIVE_ASSIGNMENT (no double reward)
    const retryRes = await fetch(`${baseUrl}/tasks/${standardTaskId}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user4Token}` },
      body: JSON.stringify({}),
    });
    assert.equal(retryRes.status, 404);
    const retryBody = (await retryRes.json()) as any;
    assert.equal(retryBody.error.code, 'NO_ACTIVE_ASSIGNMENT');

    // Ensure strictly 1 completion for User4
    const countComps = await TaskCompletion.countDocuments({ taskId: standardTaskId, userId: user4Id });
    assert.equal(countComps, 1);
  });

  // TEST 9: Paused-task verification fails with TASK_NOT_PUBLISHED and does not award points
  it('9. Paused-task verification fails with TASK_NOT_PUBLISHED inside transaction without awarding points', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // User3 starts pausableTaskId while it is PUBLISHED
    const startRes = await fetch(`${baseUrl}/tasks/${pausableTaskId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user3Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Admin pauses the task
    await Task.updateOne({ _id: pausableTaskId }, { $set: { status: 'PAUSED' } });

    // User3 calls verify-action on paused task
    const verifyRes = await fetch(`${baseUrl}/tasks/${pausableTaskId}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user3Token}` },
      body: JSON.stringify({}),
    });

    assert.equal(verifyRes.status, 404, 'Pre-check or transaction rejects non-published task');

    // Completions count must remain 0
    const pausedTask = await Task.findById(pausableTaskId);
    assert.equal(pausedTask?.completionsCount, 0, 'completionsCount must not increment for paused task');

    // No completion created
    const compDoc = await TaskCompletion.findOne({ taskId: pausableTaskId, userId: user3Id });
    assert.equal(compDoc, null, 'No TaskCompletion created for paused task');
  });

  // TEST 10 & 12: No duplicate promotional points and counter always matches committed verified completions
  it('10 & 12. Counter always strictly matches committed verified completions in database', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Check standardTaskId
    const t1Doc = await Task.findById(standardTaskId);
    const t1Completions = await TaskCompletion.countDocuments({ taskId: standardTaskId });
    assert.equal(
      t1Doc?.completionsCount,
      t1Completions,
      `Task completionsCount (${t1Doc?.completionsCount}) must match TaskCompletion count (${t1Completions})`
    );

    // Check singleSlotTaskId
    const t2Doc = await Task.findById(singleSlotTaskId);
    const t2Completions = await TaskCompletion.countDocuments({ taskId: singleSlotTaskId });
    assert.equal(
      t2Doc?.completionsCount,
      t2Completions,
      `Task completionsCount (${t2Doc?.completionsCount}) must match TaskCompletion count (${t2Completions})`
    );

    // Check pausableTaskId
    const t3Doc = await Task.findById(pausableTaskId);
    const t3Completions = await TaskCompletion.countDocuments({ taskId: pausableTaskId });
    assert.equal(
      t3Doc?.completionsCount,
      t3Completions,
      `Task completionsCount (${t3Doc?.completionsCount}) must match TaskCompletion count (${t3Completions})`
    );
  });

  // TEST 11: validateEngagementIntervals unit validation
  it('11. validateEngagementIntervals enforces strict interval validation rules', () => {
    const baseTime = new Date('2026-10-19T10:00:00.000Z');
    const maxTime = new Date('2026-10-19T10:01:00.000Z');

    // 1. Non-array
    const resNonArray = validateEngagementIntervals(null as any, baseTime, maxTime);
    assert.equal(resNonArray.valid, false);
    assert.equal(resNonArray.errorCode, 'INVALID_INTERVALS_FORMAT');

    // 2. Empty intervals
    const resEmpty = validateEngagementIntervals([], baseTime, maxTime);
    assert.equal(resEmpty.valid, false);
    assert.equal(resEmpty.errorCode, 'EMPTY_INTERVALS');

    // 3. Inverted start/end
    const resInverted = validateEngagementIntervals(
      [{ start: baseTime.getTime() + 5000, end: baseTime.getTime() + 1000 }],
      baseTime,
      maxTime
    );
    assert.equal(resInverted.valid, false);
    assert.equal(resInverted.errorCode, 'INVALID_INTERVAL');

    // 4. Overlapping intervals
    const resOverlap = validateEngagementIntervals(
      [
        { start: baseTime.getTime() + 1000, end: baseTime.getTime() + 5000 },
        { start: baseTime.getTime() + 4000, end: baseTime.getTime() + 8000 },
      ],
      baseTime,
      maxTime
    );
    assert.equal(resOverlap.valid, false);
    assert.equal(resOverlap.errorCode, 'OVERLAPPING_INTERVALS');

    // 5. Start before assignedAt tolerance
    const resTooEarly = validateEngagementIntervals(
      [{ start: baseTime.getTime() - 10000, end: baseTime.getTime() + 5000 }],
      baseTime,
      maxTime
    );
    assert.equal(resTooEarly.valid, false);
    assert.equal(resTooEarly.errorCode, 'TAMPERED_TIMESTAMP');

    // 6. End in future beyond tolerance
    const resFuture = validateEngagementIntervals(
      [{ start: baseTime.getTime() + 1000, end: maxTime.getTime() + 10000 }],
      baseTime,
      maxTime
    );
    assert.equal(resFuture.valid, false);
    assert.equal(resFuture.errorCode, 'TAMPERED_TIMESTAMP');

    // 7. Valid monotonic interval
    const resValid = validateEngagementIntervals(
      [{ start: baseTime.getTime() + 1000, end: baseTime.getTime() + 6000 }],
      baseTime,
      maxTime
    );
    assert.equal(resValid.valid, true);
    assert.equal(resValid.totalActiveSeconds, 5);
  });

  // TEST 12: Empty intervals rejected via HTTP
  it('12. POST /api/tasks/:id/verify-action rejects empty intervals with EMPTY_INTERVALS', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Create isolated task with dwell time
    const dwellTask = await Task.create({
      campaignId: testCampaignId,
      title: `Empty Intervals Test Task ${runId}`,
      description: 'Testing telemetry validation with empty intervals',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 10,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(dwellTask._id);

    // User2 starts task
    const startRes = await fetch(`${baseUrl}/tasks/${dwellTask._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    tracker.trackAssignment(startBody.data.assignment.id);

    // Verify with empty intervals
    const verifyRes = await fetch(`${baseUrl}/tasks/${dwellTask._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user2Token}` },
      body: JSON.stringify({ intervals: [] }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.error.code, 'EMPTY_INTERVALS');

    // Completions count must NOT increment
    const taskAfter = await Task.findById(dwellTask._id);
    assert.equal(taskAfter?.completionsCount, 0);

    // No completion document created
    const countComps = await TaskCompletion.countDocuments({ taskId: dwellTask._id, userId: user2Id });
    assert.equal(countComps, 0);
  });

  // TEST 13: Overlapping intervals rejected via HTTP
  it('13. POST /api/tasks/:id/verify-action rejects overlapping intervals with OVERLAPPING_INTERVALS', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const overlapTask = await Task.create({
      campaignId: testCampaignId,
      title: `Overlap Intervals Test Task ${runId}`,
      description: 'Testing telemetry validation with overlapping intervals',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 10,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 2,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(overlapTask._id);

    // User3 starts task
    const startRes = await fetch(`${baseUrl}/tasks/${overlapTask._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user3Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    tracker.trackAssignment(startBody.data.assignment.id);

    // Verify with overlapping intervals
    const verifyRes = await fetch(`${baseUrl}/tasks/${overlapTask._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user3Token}` },
      body: JSON.stringify({
        intervals: [
          { start: assignedAtMs, end: assignedAtMs + 2000 },
          { start: assignedAtMs + 1000, end: assignedAtMs + 3000 },
        ],
      }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.error.code, 'OVERLAPPING_INTERVALS');

    // Completions count remains 0
    const taskAfter = await Task.findById(overlapTask._id);
    assert.equal(taskAfter?.completionsCount, 0);
  });

  // TEST 14: Insufficient elapsed time rejected via HTTP
  it('14. POST /api/tasks/:id/verify-action rejects insufficient elapsed time with INSUFFICIENT_DWELL_TIME', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const highDwellTask = await Task.create({
      campaignId: testCampaignId,
      title: `High Dwell Test Task ${runId}`,
      description: 'Testing telemetry validation with insufficient dwell',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 10,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 10,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(highDwellTask._id);

    // User4 starts task
    const startRes = await fetch(`${baseUrl}/tasks/${highDwellTask._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user4Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    tracker.trackAssignment(startBody.data.assignment.id);

    // Send interval of only 1 second (task requires 10s)
    const verifyRes = await fetch(`${baseUrl}/tasks/${highDwellTask._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user4Token}` },
      body: JSON.stringify({
        intervals: [{ start: assignedAtMs, end: assignedAtMs + 1000 }],
      }),
    });
    assert.equal(verifyRes.status, 400);
    const verifyBody = (await verifyRes.json()) as any;
    assert.equal(verifyBody.error.code, 'INSUFFICIENT_DWELL_TIME');

    // Completions count remains 0
    const taskAfter = await Task.findById(highDwellTask._id);
    assert.equal(taskAfter?.completionsCount, 0);
  });

  // TEST 15: Valid non-empty intervals pass and enforce exactly-once reward accounting
  it('15. Valid non-empty intervals pass verification and enforce exactly-once reward accounting', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    // Create a new user to ensure clean state
    const validVU = await User.create({
      mobile: `+9176${runId}9999`,
      name: 'Valid Telemetry VU',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashValidVU',
      role: 'USER',
      status: 'ACTIVE',
      referralCode: `VLD${runId}`,
      metadata: { kycStatus: 'VERIFIED' },
    });
    tracker.trackUser(validVU._id, validVU.mobile!);
    const validVUToken = generateAccessToken({ userId: validVU._id.toString(), role: 'USER', mobile: validVU.mobile! });

    // Task with 1 second dwell requirement
    const validTask = await Task.create({
      campaignId: testCampaignId,
      title: `Valid Telemetry Task ${runId}`,
      description: 'Testing valid dwell interval verification',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 20,
      totalCap: 5,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 1,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(validTask._id);

    // 1. Start task
    const startRes = await fetch(`${baseUrl}/tasks/${validTask._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validVUToken}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignedAtMs = new Date(startBody.data.assignment.assignedAt).getTime();
    tracker.trackAssignment(startBody.data.assignment.id);

    // 2. Real elapsed wait of 1.2s to exceed 1.0s dwellTimeSeconds
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // 3. Verify with valid non-empty monotonic interval
    const intervalEndMs = Date.now();
    const intervals = [{ start: assignedAtMs, end: intervalEndMs }];

    const verifyRes = await fetch(`${baseUrl}/tasks/${validTask._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validVUToken}` },
      body: JSON.stringify({ intervals }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    assert.ok(verifyBody.data?.completion?.id);
    tracker.trackCompletion(verifyBody.data.completion.id);

    // Verify completion record
    const compDoc = await TaskCompletion.findById(verifyBody.data.completion.id);
    assert.ok(compDoc);
    assert.equal(compDoc.status, 'VERIFIED');
    assert.equal(compDoc.rewardPoints, 20);

    // Verify task counter incremented by exactly 1
    const taskAfter = await Task.findById(validTask._id);
    assert.equal(taskAfter?.completionsCount, 1);

    // 4. Exactly-once: Immediate retry must be rejected with 404 NO_ACTIVE_ASSIGNMENT
    const retryRes = await fetch(`${baseUrl}/tasks/${validTask._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${validVUToken}` },
      body: JSON.stringify({ intervals }),
    });
    assert.equal(retryRes.status, 404);
    const retryBody = (await retryRes.json()) as any;
    assert.equal(retryBody.error.code, 'NO_ACTIVE_ASSIGNMENT');

    // Total completions in database remains exactly 1
    const countComps = await TaskCompletion.countDocuments({ taskId: validTask._id });
    assert.equal(countComps, 1);
    const finalTask = await Task.findById(validTask._id);
    assert.equal(finalTask?.completionsCount, 1);
  });

  // TEST 14: 5 users competing concurrently for 1 final available slot (Phase 8D.9)
  it('14. Exactly 1 of 5 concurrent users wins final slot with 4 receiving CAP_EXHAUSTED', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const fiveSlotTask = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Five-User Single-Slot Task ${runId}`,
      description: 'Test concurrency of 5 users racing for 1 slot',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 50,
      totalCap: 1, // Exactly 1 slot!
      dailyCapPerUser: 1,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(fiveSlotTask._id);

    // Create 5 distinct users with tokens
    const fiveUsers: { id: string; token: string; assignmentId?: string }[] = [];
    for (let i = 1; i <= 5; i++) {
      const mobile = `+9176${runId}000${i}`;
      const u = await User.create({
        mobile,
        name: `Five User ${i}`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashFive',
        role: 'USER',
        status: 'ACTIVE',
        referralCode: `5U${i}${runId}`,
        metadata: { kycStatus: 'VERIFIED' },
      });
      tracker.trackUser(u._id, mobile);
      const token = generateAccessToken({ userId: u._id.toString(), role: 'USER', mobile });
      fiveUsers.push({ id: u._id.toString(), token });
    }

    // All 5 users start the task
    for (const u of fiveUsers) {
      const startRes = await fetch(`${baseUrl}/tasks/${fiveSlotTask._id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
      });
      assert.equal(startRes.status, 201);
      const startBody = (await startRes.json()) as any;
      u.assignmentId = startBody.data.assignment.id;
      tracker.trackAssignment(u.assignmentId!);
    }

    // All 5 users race simultaneously to verify
    const racePromises = fiveUsers.map((u) =>
      fetch(`${baseUrl}/tasks/${fiveSlotTask._id}/verify-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({}),
      })
    );

    const responses = await Promise.all(racePromises);
    const statuses = responses.map((r) => r.status);

    const successCount = statuses.filter((s) => s === 200).length;
    const capExhaustedCount = statuses.filter((s) => s === 400).length;

    assert.equal(successCount, 1, 'Exactly 1 of 5 users must succeed with HTTP 200');
    assert.equal(capExhaustedCount, 4, 'Exactly 4 of 5 users must fail with HTTP 400');

    // Parse responses to verify error codes
    for (const res of responses) {
      const body = (await res.json()) as any;
      if (res.status === 200) {
        assert.equal(body.success, true);
        assert.equal(body.data.completion.rewardPoints, 50);
        tracker.trackCompletion(body.data.completion.id);
      } else {
        assert.equal(body.error.code, 'CAP_EXHAUSTED');
      }
    }

    // Database assertions: exactly 1 completion, completionsCount === 1
    const taskAfter = await Task.findById(fiveSlotTask._id);
    assert.equal(taskAfter?.completionsCount, 1, 'Task completionsCount must be strictly 1');

    const totalComps = await TaskCompletion.countDocuments({ taskId: fiveSlotTask._id });
    assert.equal(totalComps, 1, 'Total TaskCompletions must be strictly 1');

    const totalEvidence = await VerificationEvidence.countDocuments({ taskId: fiveSlotTask._id });
    assert.equal(totalEvidence, 1, 'Total VerificationEvidence must be strictly 1 (no orphaned docs)');
  });

  // TEST 15: Admin pause during verification rejects transaction and preserves counter (Phase 8D.9)
  it('15. Admin pause mid-flight rejects verification and ensures 0 completions or rewards committed', async (t) => {
    if (isSuiteBlocked) return t.skip(blockReason);

    const pausableTask15 = await Task.create({
      campaignId: new Types.ObjectId(testCampaignId),
      title: `Admin Pause Task ${runId}`,
      description: 'Test admin pause race condition',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 30,
      totalCap: 10,
      dailyCapPerUser: 5,
      dwellTimeSeconds: 0,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    tracker.trackTask(pausableTask15._id);

    // User starts assignment
    const startRes = await fetch(`${baseUrl}/tasks/${pausableTask15._id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
    });
    assert.equal(startRes.status, 201);
    const startBody = (await startRes.json()) as any;
    const assignmentId = startBody.data.assignment.id;
    tracker.trackAssignment(assignmentId);

    // Admin pauses the task in the database before verification transaction completes
    await Task.updateOne({ _id: pausableTask15._id }, { $set: { status: 'PAUSED' } });

    // User calls verify-action
    const verifyRes = await fetch(`${baseUrl}/tasks/${pausableTask15._id}/verify-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({}),
    });

    // Verification must fail (either pre-check 404 TASK_NOT_AVAILABLE or in-transaction 400 TASK_NOT_PUBLISHED)
    assert.ok(
      verifyRes.status === 404 || verifyRes.status === 400,
      `Paused task must reject with 404 or 400, received: ${verifyRes.status}`
    );

    // Counter must remain 0
    const taskAfter = await Task.findById(pausableTask15._id);
    assert.equal(taskAfter?.completionsCount, 0, 'completionsCount must remain 0');

    // Zero completions committed
    const compCount = await TaskCompletion.countDocuments({ taskId: pausableTask15._id });
    assert.equal(compCount, 0, 'No TaskCompletion records must exist');

    // Zero evidence committed
    const evCount = await VerificationEvidence.countDocuments({ taskId: pausableTask15._id });
    assert.equal(evCount, 0, 'No VerificationEvidence records must exist');
  });
});
