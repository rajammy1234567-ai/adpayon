import { performance } from 'node:perf_hooks';
import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';

export interface TransactionStepMetrics {
  claimAssignmentMs: number;
  reserveCapMs: number;
  insertEvidenceMs: number;
  insertCompletionMs: number;
  insertEventMs: number;
  totalCallbackMs: number;
}

export interface VerificationDiagnostic {
  attemptCount: number;
  retries: number;
  totalTxMs: number;
  cumulativeFailedAttemptsMs: number;
  finalAttemptDurationMs: number;
  remainingOverheadMs: number;
  commitDurationMs: number; // Retained for backwards compatibility; represents remainingOverheadMs
  steps: TransactionStepMetrics;
  hasTransientError: boolean;
  ordering?: 'CURRENT' | 'CANDIDATE';
  queueWaitMs?: number;
  queueDepth?: number;
}

export interface PoolDiagnosticMetrics {
  checkoutsTotal: number;
  checkoutWaitMsTotal: number;
  checkoutAvgWaitMs: number;
  checkoutMaxWaitMs: number;
  checkoutFailures: number;
  writeConflictsTotal: number;
  transientErrorsTotal: number;
}

/**
 * Low-overhead, test-only transaction & driver connection pool instrumentation.
 * Strictly disabled by default in production.
 * Response emission is restricted exclusively to authorized isolated load tests on adpayon_test.
 */
export class TransactionDiagnosticsTracker {
  private static instance: TransactionDiagnosticsTracker | null = null;
  private isListeningToPool = false;
  private clientRef: any = null;

  // Stored bound handlers for reliable detachment during harness teardown
  private onCheckedOutHandler: ((event: any) => void) | null = null;
  private onCheckOutFailedHandler: (() => void) | null = null;
  private onCommandFailedHandler: ((event: any) => void) | null = null;

  public checkoutsTotal = 0;
  public checkoutWaitMsTotal = 0;
  public checkoutMaxWaitMs = 0;
  public checkoutFailures = 0;
  public writeConflictsTotal = 0;
  public transientErrorsTotal = 0;

  /**
   * Safe environment check: Enabled ONLY when NODE_ENV !== 'production' AND LOAD_TEST_DIAGNOSTICS === 'true'.
   */
  static isEnabled(): boolean {
    const isProd = env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
    return (
      !isProd &&
      process.env.LOAD_TEST_DIAGNOSTICS === 'true'
    );
  }

  /**
   * Strict security gate:
   * Diagnostics response payload is ONLY permitted when ALL of the following criteria are met:
   * 1. NODE_ENV !== 'production' (Never in production)
   * 2. LOAD_TEST_DIAGNOSTICS === 'true' (Explicit environment flag)
   * 3. Live active MongoDB connection databaseName === 'adpayon_test' (Isolated test database ONLY - strictly forbidden on adpayon_dev and adpayon_sandbox)
   * 4. req.headers['x-load-test-diagnostics'] === 'true' (Explicit client test-runner authorization header)
   */
  static isRequestAuthorized(req: Request): boolean {
    if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') return false;
    if (process.env.LOAD_TEST_DIAGNOSTICS !== 'true') return false;

    const activeDbName = mongoose.connection.db?.databaseName;
    if (!activeDbName || activeDbName !== 'adpayon_test') return false;

    return req.headers['x-load-test-diagnostics'] === 'true';
  }

  static getInstance(): TransactionDiagnosticsTracker {
    if (!this.instance) {
      this.instance = new TransactionDiagnosticsTracker();
    }
    return this.instance;
  }

  /**
   * Attaches native MongoDB driver connection pool and command failure listeners.
   * In MongoDB Driver 7.x, ConnectionCheckedOutEvent natively exposes durationMS.
   */
  attachClientListeners(): void {
    if (!TransactionDiagnosticsTracker.isEnabled() || this.isListeningToPool) {
      return;
    }

    try {
      const client = mongoose.connection.getClient();
      if (!client || typeof (client as any).on !== 'function') return;

      this.clientRef = client;
      this.isListeningToPool = true;

      this.onCheckedOutHandler = (event: any) => {
        this.checkoutsTotal++;
        if (event && typeof event.durationMS === 'number') {
          const waitMs = event.durationMS;
          this.checkoutWaitMsTotal += waitMs;
          this.checkoutMaxWaitMs = Math.max(this.checkoutMaxWaitMs, waitMs);
        }
      };

      this.onCheckOutFailedHandler = () => {
        this.checkoutFailures++;
      };

      // Track exact driver-observed command failures (WriteConflict code 112 / TransientTransactionError)
      this.onCommandFailedHandler = (event: any) => {
        const failure = event?.failure;
        if (!failure) return;

        const isWriteConflict =
          failure.code === 112 ||
          failure.codeName === 'WriteConflict' ||
          (typeof failure.message === 'string' && failure.message.includes('WriteConflict'));

        const isTransient =
          isWriteConflict ||
          (typeof failure.hasErrorLabel === 'function' && failure.hasErrorLabel('TransientTransactionError')) ||
          (Array.isArray(failure.errorLabels) && failure.errorLabels.includes('TransientTransactionError'));

        if (isWriteConflict) {
          this.writeConflictsTotal++;
        }
        if (isTransient) {
          this.transientErrorsTotal++;
        }
      };

      (client as any).on('connectionCheckedOut', this.onCheckedOutHandler);
      (client as any).on('connectionCheckOutFailed', this.onCheckOutFailedHandler);
      (client as any).on('commandFailed', this.onCommandFailedHandler);
    } catch {
      // Ignored if client not ready yet
    }
  }

  /**
   * Detaches driver event listeners to prevent memory leaks and repeated callbacks across test stages.
   */
  detachClientListeners(): void {
    if (!this.isListeningToPool || !this.clientRef) {
      return;
    }

    try {
      if (this.onCheckedOutHandler && typeof this.clientRef.removeListener === 'function') {
        this.clientRef.removeListener('connectionCheckedOut', this.onCheckedOutHandler);
      }
      if (this.onCheckOutFailedHandler && typeof this.clientRef.removeListener === 'function') {
        this.clientRef.removeListener('connectionCheckOutFailed', this.onCheckOutFailedHandler);
      }
      if (this.onCommandFailedHandler && typeof this.clientRef.removeListener === 'function') {
        this.clientRef.removeListener('commandFailed', this.onCommandFailedHandler);
      }
    } catch {
      // Ignored if client already closed
    } finally {
      this.onCheckedOutHandler = null;
      this.onCheckOutFailedHandler = null;
      this.onCommandFailedHandler = null;
      this.clientRef = null;
      this.isListeningToPool = false;
    }
  }

  getPoolMetrics(): PoolDiagnosticMetrics {
    return {
      checkoutsTotal: this.checkoutsTotal,
      checkoutWaitMsTotal: Number(this.checkoutWaitMsTotal.toFixed(2)),
      checkoutAvgWaitMs:
        this.checkoutsTotal > 0
          ? Number((this.checkoutWaitMsTotal / this.checkoutsTotal).toFixed(2))
          : 0,
      checkoutMaxWaitMs: Number(this.checkoutMaxWaitMs.toFixed(2)),
      checkoutFailures: this.checkoutFailures,
      writeConflictsTotal: this.writeConflictsTotal,
      transientErrorsTotal: this.transientErrorsTotal,
    };
  }

  reset(): void {
    this.checkoutsTotal = 0;
    this.checkoutWaitMsTotal = 0;
    this.checkoutMaxWaitMs = 0;
    this.checkoutFailures = 0;
    this.writeConflictsTotal = 0;
    this.transientErrorsTotal = 0;
  }
}

