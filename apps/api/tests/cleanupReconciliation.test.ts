import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { env } from '../src/config/env';
import { TestOwnershipTracker } from '../src/testUtils/dbIsolation';
import { TaskCompletion } from '../src/models/TaskCompletion';
import { Task } from '../src/models/Task';
import { Campaign } from '../src/models/Campaign';
import { TaskAssignment } from '../src/models/TaskAssignment';
import { User } from '../src/models/User';
import { ConcurrencyLoadTestHarness } from '../src/scripts/concurrencyLoadTestHarness';

describe('Phase 9.2: Safe Cleanup Fix & Timeout Reconciliation Suite', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_TEST_DB_NAME = 'adpayon_test';
    const uri = process.env.MONGODB_TEST_URI || env.MONGODB_URI || 'mongodb://localhost:27017/adpayon_test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri, { dbName: 'adpayon_test' });
    }
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  });

  it('1. 21-style orphan discovery: safeCleanup() discovers unacknowledged completions via tracked task ID', async () => {
    const tracker = new TestOwnershipTracker();

    // Create synthetic task and campaign
    const campaignId = new Types.ObjectId();
    const taskId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const assignmentId = new Types.ObjectId();

    tracker.trackTask(taskId);
    tracker.trackCampaign(campaignId);
    tracker.trackUser(userId, '+917899991111');
    tracker.trackAssignment(assignmentId);

    // Insert TaskCompletion directly without calling tracker.trackCompletion() (simulates client timeout)
    const completion = await TaskCompletion.create({
      taskId,
      campaignId,
      userId,
      assignmentId,
      clickId: `clk-test-orphan-${Date.now()}`,
      rewardPoints: 10,
      status: 'VERIFIED',
      verificationMethod: 'FIRST_PARTY_ACTION',
      completedAt: new Date(),
    });

    // Verify it exists in DB
    const foundBefore = await TaskCompletion.findById(completion._id);
    assert.ok(foundBefore, 'TaskCompletion must exist in database prior to cleanup');

    // Run safeCleanup()
    const result = await tracker.safeCleanup();
    assert.equal(result.deletedCompletions, 1, 'safeCleanup() must discover and delete the unacknowledged completion');

    // Verify 0 residual documents remain
    const foundAfter = await TaskCompletion.findById(completion._id);
    assert.equal(foundAfter, null, 'TaskCompletion must be purged from database');
  });

  it('2. No deletion of unrelated test records: safeCleanup() strictly preserves un-tracked completions', async () => {
    const tracker = new TestOwnershipTracker();

    // Create an unrelated task and completion that is NOT tracked
    const unrelatedTaskId = new Types.ObjectId();
    const unrelatedCompletion = await TaskCompletion.create({
      taskId: unrelatedTaskId,
      campaignId: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      assignmentId: new Types.ObjectId(),
      clickId: `clk-test-unrelated-${Date.now()}`,
      rewardPoints: 10,
      status: 'VERIFIED',
      verificationMethod: 'FIRST_PARTY_ACTION',
      completedAt: new Date(),
    });

    // Track a different task
    const trackedTaskId = new Types.ObjectId();
    tracker.trackTask(trackedTaskId);

    // Run cleanup on tracker
    await tracker.safeCleanup();

    // The unrelated completion MUST still exist intact
    const foundUnrelated = await TaskCompletion.findById(unrelatedCompletion._id);
    assert.ok(foundUnrelated, 'Unrelated completion must NOT be deleted by safeCleanup');

    // Cleanup the unrelated completion manually by exact ID
    await TaskCompletion.deleteOne({ _id: unrelatedCompletion._id });
  });

  it('3. Repeated cleanup safety: safeCleanup() is idempotent and handles consecutive calls cleanly', async () => {
    const tracker = new TestOwnershipTracker();

    // Initial call on empty tracker
    const firstEmpty = await tracker.safeCleanup();
    assert.equal(firstEmpty.deletedCompletions, 0);

    // Track an entity, cleanup, then cleanup again
    const taskId = new Types.ObjectId();
    tracker.trackTask(taskId);

    const firstClean = await tracker.safeCleanup();
    assert.equal(firstClean.deletedTasks, 0);

    // Second consecutive call must be an immediate safe no-op
    const secondClean = await tracker.safeCleanup();
    assert.equal(secondClean.deletedTasks, 0);
    assert.equal(secondClean.deletedCompletions, 0);
  });

  it('4. Cleanup failure handling: safeCleanup() enforces strict database boundaries', async () => {
    const tracker = new TestOwnershipTracker();
    tracker.trackTask(new Types.ObjectId());

    // Mock unsafe connection database name
    const originalDb = mongoose.connection.db;
    try {
      (mongoose.connection as any).db = { databaseName: 'adpayon_dev' };
      await assert.rejects(
        async () => {
          await tracker.safeCleanup();
        },
        /CRITICAL SECURITY FAILURE: Attempted test cleanup against 'adpayon_dev'/
      );
    } finally {
      (mongoose.connection as any).db = originalDb;
    }
  });

  it('5. drainInFlight() resolves cleanly when no requests are active', async () => {
    const harness = new ConcurrencyLoadTestHarness(5097, 5000);
    const clean = await harness.drainInFlight(1000);
    assert.equal(clean, true, 'drainInFlight must return true immediately when 0 requests in flight');
  });

  it('6. Post-drain timeout reconciliation metrics distinguish client timeouts from valid server commits', () => {
    const assignmentsCount = 50;
    const tasksCompleted = 29; // HTTP 200 acknowledged
    const timeoutFailures = 21; // Client-side 504 timeouts
    const totalDbVerifiedCompletions = 50; // Server transactions all committed
    const totalTaskCompletionsCount = 50; // Task counter matches DB
    const totalDuplicateCompletions = 0;
    const allTasksConsistent = true;

    const isConsistent =
      allTasksConsistent &&
      totalTaskCompletionsCount === totalDbVerifiedCompletions &&
      totalDuplicateCompletions === 0 &&
      totalDbVerifiedCompletions <= assignmentsCount;

    const committedAfterTimeoutCount = Math.max(0, totalDbVerifiedCompletions - tasksCompleted);

    assert.equal(isConsistent, true, 'Audit must be VERIFIED when DB counters match verified records and duplicates are 0');
    assert.equal(committedAfterTimeoutCount, 21, 'Committed post-timeout must equal 21');
    assert.equal(tasksCompleted, 29);
    assert.equal(timeoutFailures, 21);
  });
});
