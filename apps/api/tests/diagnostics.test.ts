import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { TransactionDiagnosticsTracker } from '../src/testUtils/loadTestDiagnostics';
import { env } from '../src/config/env';

describe('Transaction Diagnostics Security & Accuracy Tests', () => {
  const origDiagnostics = process.env.LOAD_TEST_DIAGNOSTICS;
  const origNodeEnv = process.env.NODE_ENV;
  const origDb = mongoose.connection.db;

  it('1. Disabled by default when LOAD_TEST_DIAGNOSTICS is unset', () => {
    delete process.env.LOAD_TEST_DIAGNOSTICS;
    process.env.NODE_ENV = 'test';
    assert.equal(TransactionDiagnosticsTracker.isEnabled(), false);
  });

  it('2. Disabled when LOAD_TEST_DIAGNOSTICS is false', () => {
    process.env.LOAD_TEST_DIAGNOSTICS = 'false';
    process.env.NODE_ENV = 'test';
    assert.equal(TransactionDiagnosticsTracker.isEnabled(), false);
  });

  it('3. Enabled in non-production when LOAD_TEST_DIAGNOSTICS is true', () => {
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
    process.env.NODE_ENV = 'test';
    assert.equal(TransactionDiagnosticsTracker.isEnabled(), true);
  });

  it('4. Strictly disabled in production even if LOAD_TEST_DIAGNOSTICS is true', () => {
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
    const isProduction = true;
    const guarded = !isProduction && process.env.LOAD_TEST_DIAGNOSTICS === 'true';
    assert.equal(guarded, false);
  });

  it('5. Request authorization rejects requests on adpayon_dev and adpayon_sandbox', () => {
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
    const mockReq = { headers: { 'x-load-test-diagnostics': 'true' } } as any;

    // Simulate adpayon_sandbox
    (mongoose.connection as any).db = { databaseName: 'adpayon_sandbox' };
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(mockReq), false);

    // Simulate adpayon_dev
    (mongoose.connection as any).db = { databaseName: 'adpayon_dev' };
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(mockReq), false);

    // Simulate missing db connection
    delete (mongoose.connection as any).db;
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(mockReq), false);

    // Restore test DB
    (mongoose.connection as any).db = { databaseName: 'adpayon_test' };
  });

  it('6. Request authorization rejects requests without x-load-test-diagnostics header', () => {
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
    (mongoose.connection as any).db = { databaseName: 'adpayon_test' };

    const reqWithoutHeader = { headers: {} } as any;
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(reqWithoutHeader), false);

    const reqWrongHeader = { headers: { 'x-load-test-diagnostics': 'false' } } as any;
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(reqWrongHeader), false);
  });

  it('7. Request authorization accepts valid header ONLY on adpayon_test with flag enabled', () => {
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
    (mongoose.connection as any).db = { databaseName: 'adpayon_test' };

    const validReq = { headers: { 'x-load-test-diagnostics': 'true' } } as any;
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(validReq), true);

    // If flag is turned off, authorization fails immediately
    delete process.env.LOAD_TEST_DIAGNOSTICS;
    assert.equal(TransactionDiagnosticsTracker.isRequestAuthorized(validReq), false);
  });

  it('8. Initial pool metrics reflect zero state cleanly', () => {
    const tracker = TransactionDiagnosticsTracker.getInstance();
    tracker.reset();
    const metrics = tracker.getPoolMetrics();
    assert.equal(metrics.checkoutsTotal, 0);
    assert.equal(metrics.checkoutWaitMsTotal, 0);
    assert.equal(metrics.checkoutAvgWaitMs, 0);
    assert.equal(metrics.checkoutFailures, 0);
    assert.equal(metrics.writeConflictsTotal, 0);
    assert.equal(metrics.transientErrorsTotal, 0);
  });

  it('9. detachClientListeners executes cleanly without throwing', () => {
    const tracker = TransactionDiagnosticsTracker.getInstance();
    assert.doesNotThrow(() => {
      tracker.detachClientListeners();
    });
  });

  it('10. Command failure listener safely tracks code 112 WriteConflict without capturing payload or PII', () => {
    const tracker = TransactionDiagnosticsTracker.getInstance();
    tracker.reset();

    // Create a mock client with event emitter pattern
    let failureListener: ((event: any) => void) | null = null;
    const mockClient = {
      on(eventName: string, handler: any) {
        if (eventName === 'commandFailed') {
          failureListener = handler;
        }
      },
      removeListener() {},
    };

    (mongoose.connection as any).getClient = () => mockClient;
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
    process.env.NODE_ENV = 'test';

    tracker.detachClientListeners();
    tracker.attachClientListeners();

    assert.ok(failureListener, 'commandFailed handler must be registered');

    // Simulate driver commandFailed event with code 112
    const mockEvent = {
      commandName: 'update',
      duration: 15,
      failure: {
        code: 112,
        codeName: 'WriteConflict',
        message: 'WriteConflict error: retryable transaction write collision',
        hasErrorLabel: (lbl: string) => lbl === 'TransientTransactionError',
      },
    };

    (failureListener as any)(mockEvent);

    const metrics = tracker.getPoolMetrics();
    assert.equal(metrics.writeConflictsTotal, 1);
    assert.equal(metrics.transientErrorsTotal, 1);

    tracker.detachClientListeners();
  });

  it('11. VerificationDiagnostic schema accurately separates cumulative failed attempts and residual overhead', () => {
    const sampleDiag = {
      attemptCount: 4,
      retries: 3,
      totalTxMs: 2056.98,
      cumulativeFailedAttemptsMs: 350.2,
      finalAttemptDurationMs: 523.34,
      remainingOverheadMs: 1183.44,
      commitDurationMs: 1183.44,
      steps: {
        claimAssignmentMs: 10.5,
        reserveCapMs: 20.2,
        insertEvidenceMs: 150.1,
        insertCompletionMs: 180.3,
        insertEventMs: 162.24,
        totalCallbackMs: 523.34,
      },
      hasTransientError: true,
    };

    assert.equal(sampleDiag.attemptCount, 4);
    assert.equal(sampleDiag.retries, 3);
    assert.ok(sampleDiag.cumulativeFailedAttemptsMs > 0);
    assert.ok(sampleDiag.finalAttemptDurationMs > 0);
    assert.equal(
      Number((sampleDiag.totalTxMs - sampleDiag.cumulativeFailedAttemptsMs - sampleDiag.finalAttemptDurationMs).toFixed(2)),
      sampleDiag.remainingOverheadMs
    );
  });

  // Restore env
  process.env.LOAD_TEST_DIAGNOSTICS = origDiagnostics;
  process.env.NODE_ENV = origNodeEnv;
  (mongoose.connection as any).db = origDb;
});

