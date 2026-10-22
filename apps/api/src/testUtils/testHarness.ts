import { Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import mongoose from 'mongoose';
import { app } from '../app';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from './dbIsolation';
import { TransactionDiagnosticsTracker } from './loadTestDiagnostics';

export interface HarnessLifecycleState {
  dbConnected: boolean;
  dbVerified: boolean;
  serverStarted: boolean;
  syntheticRecordsCreated: boolean;
}

/**
 * Reusable isolated test harness helper for automated integration and lifecycle tests.
 * Manages HTTP test server lifecycle, in-flight request draining, and scoped DB teardown.
 */
export class ConcurrencyLoadTestHarness {
  protected server: Server | null = null;
  protected port: number;
  protected requestTimeoutMs: number;
  protected inFlightRequestsCount = 0;
  protected baseUrl = '';
  protected tracker = new TestOwnershipTracker();

  public lifecycle: HarnessLifecycleState = {
    dbConnected: false,
    dbVerified: false,
    serverStarted: false,
    syntheticRecordsCreated: false,
  };

  constructor(customPort?: number, customTimeoutMs?: number) {
    this.port = customPort || parseInt(process.env.LOAD_TEST_PORT || '5099', 10);
    this.requestTimeoutMs = customTimeoutMs || parseInt(process.env.LOAD_TEST_TIMEOUT_MS || '8000', 10);
    if (this.port === 5000 || this.port === 5001) {
      throw new Error(`SECURITY VIOLATION: Port ${this.port} is reserved for Dev/Sandbox. Load harness forbidden on this port.`);
    }
  }

  public getTracker(): TestOwnershipTracker {
    return this.tracker;
  }

  /**
   * Initializes test server and verifies isolated database connection.
   */
  async initialize(): Promise<void> {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_TEST_DB_NAME = 'adpayon_test';

    if (!process.env.MONGODB_MAX_POOL_SIZE) {
      process.env.MONGODB_MAX_POOL_SIZE = '20';
    }

    const isolation = await assertTestDatabaseIsolation();
    if (!isolation.allowed) {
      throw new Error(`CRITICAL SECURITY FAILURE: Database isolation check failed: ${isolation.reason}`);
    }

    this.lifecycle.dbConnected = mongoose.connection.readyState === 1;
    const activeDbName = mongoose.connection.db?.databaseName;
    if (activeDbName !== 'adpayon_test') {
      await mongoose.disconnect().catch(() => {});
      this.lifecycle.dbConnected = false;
      this.lifecycle.dbVerified = false;
      throw new Error(`CRITICAL SECURITY FAILURE: Connected to '${activeDbName}' instead of 'adpayon_test'. Aborting.`);
    }

    this.lifecycle.dbVerified = true;

    if (TransactionDiagnosticsTracker.isEnabled()) {
      TransactionDiagnosticsTracker.getInstance().attachClientListeners();
    }

    await new Promise<void>((resolve, reject) => {
      this.server = app.listen(this.port, '127.0.0.1', () => {
        this.lifecycle.serverStarted = true;
        this.baseUrl = `http://127.0.0.1:${this.port}/api`;
        resolve();
      });

      this.server.on('request', (_req, res) => {
        this.inFlightRequestsCount++;
        let decremented = false;
        const markHandlerComplete = () => {
          if (!decremented) {
            decremented = true;
            this.inFlightRequestsCount = Math.max(0, this.inFlightRequestsCount - 1);
          }
        };

        const originalEnd = res.end;
        res.end = function (...args: any[]) {
          markHandlerComplete();
          return (originalEnd as any).apply(this, args);
        };

        res.once('finish', markHandlerComplete);
      });

      this.server.on('error', (err) => {
        this.lifecycle.serverStarted = false;
        reject(err);
      });
    });
  }

  /**
   * Gracefully awaits active in-flight request handlers and database transactions.
   */
  async drainInFlight(timeoutMs = 10000): Promise<boolean> {
    if (this.inFlightRequestsCount <= 0) return true;
    const drainStart = performance.now();
    while (this.inFlightRequestsCount > 0) {
      if (performance.now() - drainStart > timeoutMs) {
        return false;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  }

  /**
   * Safely purges all tracked records created during the test run.
   */
  async cleanup(): Promise<void> {
    // 1. Stop accepting new HTTP connections immediately
    let serverClosePromise: Promise<void> | null = null;
    if (this.server) {
      serverClosePromise = new Promise<void>((resolve) => {
        this.server?.close(() => {
          this.lifecycle.serverStarted = false;
          resolve();
        });
      });
      if (typeof (this.server as any)?.closeIdleConnections === 'function') {
        (this.server as any).closeIdleConnections();
      }
    }

    // 2. Await active in-flight request handlers and database transactions with bounded drain timeout
    const DRAIN_TIMEOUT_MS = 10000;
    const cleanDrain = await this.drainInFlight(DRAIN_TIMEOUT_MS);

    if (this.server) {
      if (cleanDrain) {
        if (typeof (this.server as any)?.closeIdleConnections === 'function') {
          (this.server as any).closeIdleConnections();
        }
      } else {
        if (typeof (this.server as any)?.closeAllConnections === 'function') {
          (this.server as any).closeAllConnections();
        }
      }

      if (serverClosePromise) {
        await Promise.race([
          serverClosePromise,
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      }
      this.server = null;
    }

    // 3. Database Purge Decision Based on Lifecycle & Tracked Records
    const hasTrackedRecords = this.tracker.hasTrackedRecords();

    if (!hasTrackedRecords) {
      // No synthetic records were created or tracked. Database purge safely skipped.
    } else {
      if (!cleanDrain) {
        const recoveryInfo = this.tracker.getRecoveryInfo();
        throw new Error(`CLEANUP BLOCKER: In-flight transactions un-drained. Tracked IDs preserved: ${recoveryInfo.taskIds.join(', ')}`);
      }

      const activeDb = mongoose.connection.db?.databaseName;
      const isDbReady = mongoose.connection.readyState === 1 && activeDb === 'adpayon_test';

      if (!isDbReady) {
        const recoveryInfo = this.tracker.getRecoveryInfo();
        throw new Error(`CLEANUP BLOCKER: Database unavailable for cleanup. Tracked IDs preserved: ${recoveryInfo.taskIds.join(', ')}`);
      }

      await this.tracker.safeCleanup();
    }

    // 4. Detach diagnostic driver event listeners during teardown
    if (TransactionDiagnosticsTracker.isEnabled()) {
      TransactionDiagnosticsTracker.getInstance().detachClientListeners();
    }

    // 5. Safely disconnect isolated Mongoose connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
      this.lifecycle.dbConnected = false;
      this.lifecycle.dbVerified = false;
    }
  }
}
