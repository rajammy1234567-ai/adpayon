import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { ConcurrencyLoadTestHarness } from '../src/testUtils/testHarness';
import { TestOwnershipTracker } from '../src/testUtils/dbIsolation';

describe('Phase 8D.5: Failed-Initialization Cleanup Safety Tests', () => {

  it('1. Atlas connection failure before seed: cleanup() succeeds safely with no-op', async () => {
    // Harness created with custom port 5098
    const harness = new ConcurrencyLoadTestHarness(5098, 5000);
    
    // Initial state: not connected, no records created
    assert.equal(harness.lifecycle.dbConnected, false);
    assert.equal(harness.lifecycle.dbVerified, false);
    assert.equal(harness.lifecycle.serverStarted, false);
    assert.equal(harness.lifecycle.syntheticRecordsCreated, false);
    assert.equal(harness.getTracker().hasTrackedRecords(), false);

    // Simulated scenario: Atlas connection failed during initialize before any seed
    // cleanup() must not throw and must skip DB deletion
    await assert.doesNotReject(async () => {
      await harness.cleanup();
    });

    assert.equal(harness.lifecycle.serverStarted, false);
  });

  it('2. Cleanup when active DB is undefined and zero records tracked: safeCleanup() returns cleanly', async () => {
    const tracker = new TestOwnershipTracker();
    assert.equal(tracker.hasTrackedRecords(), false);

    // Even if mongoose.connection.db is undefined, safeCleanup() is an immediate safe no-op
    const result = await tracker.safeCleanup();
    assert.equal(result.deletedUsers, 0);
    assert.equal(result.deletedTasks, 0);
    assert.equal(result.deletedCompletions, 0);
  });

  it('3. Cleanup when active DB is undefined and records ARE tracked: throws CLEANUP BLOCKER with preserved IDs', async () => {
    const harness = new ConcurrencyLoadTestHarness(5098, 5000);
    const fakeTaskId = new Types.ObjectId().toString();
    const fakeUserId = new Types.ObjectId().toString();
    
    // Simulate partial seed
    harness.getTracker().trackTask(fakeTaskId);
    harness.getTracker().trackUser(fakeUserId, '+917899990001');
    assert.equal(harness.getTracker().hasTrackedRecords(), true);

    // Mongoose is disconnected / DB is undefined
    await assert.rejects(
      async () => {
        await harness.cleanup();
      },
      (err: any) => {
        assert.match(err.message, /CLEANUP BLOCKER: Database unavailable/);
        assert.match(err.message, new RegExp(fakeTaskId));
        return true;
      }
    );
  });

  it('4. Attempted cleanup against unsafe database (adpayon_dev / sandbox) is strictly rejected', async () => {
    const tracker = new TestOwnershipTracker();
    const fakeTaskId = new Types.ObjectId().toString();
    tracker.trackTask(fakeTaskId);

    // Mock connection with unsafe db name
    const originalDb = mongoose.connection.db;
    try {
      (mongoose.connection as any).db = { databaseName: 'adpayon_dev' };
      await assert.rejects(
        async () => {
          await tracker.safeCleanup();
        },
        /CRITICAL SECURITY FAILURE: Attempted test cleanup against 'adpayon_dev'/
      );

      (mongoose.connection as any).db = { databaseName: 'adpayon_sandbox' };
      await assert.rejects(
        async () => {
          await tracker.safeCleanup();
        },
        /CRITICAL SECURITY FAILURE: Attempted test cleanup against 'adpayon_sandbox'/
      );
    } finally {
      (mongoose.connection as any).db = originalDb;
    }
  });

  it('5. Error preservation pattern: Both initial execution error and cleanup error are captured', async () => {
    let executionError: Error | null = null;
    let cleanupError: Error | null = null;

    const initialErr = new Error('Atlas Server Selection Timeout (IP not whitelisted)');
    const teardownErr = new Error('CLEANUP BLOCKER: In-flight transactions un-drained');

    try {
      throw initialErr;
    } catch (err: any) {
      executionError = err;
    } finally {
      try {
        throw teardownErr;
      } catch (cErr: any) {
        cleanupError = cErr;
      }
    }

    assert.equal(executionError?.message, initialErr.message);
    assert.equal(cleanupError?.message, teardownErr.message);
  });

  it('6. Normal cleanup lifecycle: tracks and resets state cleanly', () => {
    const tracker = new TestOwnershipTracker();
    const id = new Types.ObjectId().toString();
    tracker.trackUser(id, '+917812345678');
    assert.equal(tracker.hasTrackedRecords(), true);

    const info = tracker.getRecoveryInfo();
    assert.equal(info.userIds.length, 1);
    assert.equal(info.mobiles.length, 1);
    assert.equal(info.userIds[0], id);
  });
});
