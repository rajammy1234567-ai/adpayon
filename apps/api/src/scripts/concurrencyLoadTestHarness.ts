import { Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import mongoose, { Types } from 'mongoose';
import { app } from '../app';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  User,
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  VerificationEvidence,
} from '../models';
import { generateAccessToken } from '../services/tokenService';
import { assertTestDatabaseIsolation, TestOwnershipTracker } from '../testUtils/dbIsolation';
import {
  TransactionDiagnosticsTracker,
  VerificationDiagnostic,
  PoolDiagnosticMetrics,
} from '../testUtils/loadTestDiagnostics';

export interface EndpointLatencyStats {
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface TaskConsistencyDetail {
  taskId: string;
  targetUsers: number;
  taskCap: number;
  taskCompletionsCount: number;
  dbVerifiedCompletions: number;
  duplicateUserCompletions: number;
  isConsistent: boolean;
}

export interface StageMetrics {
  stageName: string;
  concurrency: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorPercentage: number;
  durationMs: number;
  requestsPerSecond: number;
  latency: {
    minMs: number;
    maxMs: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  };
  endpointLatency?: Record<'feed' | 'start' | 'heartbeat' | 'verify' | 'history', EndpointLatencyStats>;
  statusCodes: Record<number, number>;
  businessMetrics: {
    tasksCompleted: number;
    duplicateClaimsBlocked: number;
    capExhaustedResponses: number;
    emptyIntervalsRejected: number;
    insufficientDwellRejected: number;
    assignmentExpiredRejected: number;
    otherRejections: number;
    expectedBusinessRejections: number;
    unexpectedFailures: number;
    timeoutFailures: number;
  };
  consistencyCheck: {
    taskCompletionsCount: number;
    dbVerifiedCompletions: number;
    duplicateUserCompletions: number;
    httpSuccessfulCompletions: number;
    httpTimeoutCount: number;
    committedAfterTimeoutCount: number;
    isConsistent: boolean;
  };
  perTaskConsistency?: TaskConsistencyDetail[];
  txDiagnostics?: AggregateTxDiagnostics;
  diagnosticsStatus: 'ENABLED_DATA_CAPTURED' | 'INCOMPLETE_NO_DATA' | 'DISABLED';
  resourceUsage: {
    heapUsedMbStart: number;
    heapUsedMbEnd: number;
    rssMb: number;
    cpuUserMs: number;
    cpuSystemMs: number;
  };
}

export interface AggregateTxDiagnostics {
  totalCompletionsSampled: number;
  requestedOrdering: 'CURRENT' | 'CANDIDATE';
  executedOrdering: 'CURRENT' | 'CANDIDATE' | 'MIXED';
  currentSamplesCount: number;
  candidateSamplesCount: number;
  isOrderingValid: boolean;
  attemptsAvg: number;
  attemptsMax: number;
  usersWithRetries: number;
  totalTxDurationAvgMs: number;
  totalTxDurationP95Ms: number;
  totalTxDurationMaxMs: number;
  cumulativeFailedAttemptsAvgMs: number;
  finalAttemptDurationAvgMs: number;
  remainingOverheadAvgMs: number;
  commitDurationAvgMs: number; // Kept for backwards compatibility
  stepsAvgMs: {
    claimAssignmentMs: number;
    reserveCapMs: number;
    insertEvidenceMs: number;
    insertCompletionMs: number;
    insertEventMs: number;
    totalCallbackMs: number;
  };
  poolMetrics?: PoolDiagnosticMetrics;
  queueWaitAvgMs?: number;
  queueWaitP95Ms?: number;
  queueWaitMaxMs?: number;
}


export interface SyntheticIdentity {
  userId: string;
  mobile: string;
  token: string;
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return Number((sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] || 0).toFixed(2));
}

export interface HarnessLifecycleState {
  dbConnected: boolean;
  dbVerified: boolean;
  serverStarted: boolean;
  syntheticRecordsCreated: boolean;
}

/**
 * ADPAYON Concurrency & Multi-User Load Test Harness
 *
 * STRICT ISOLATION RULES:
 * 1. Only 'adpayon_test' is permitted. Fails closed on any other database.
 * 2. Requires explicit '--execute-load-test' CLI flag to execute.
 * 3. Never binds to ports 5000 (dev) or 5001 (sandbox). Default test port: 5099.
 * 4. Only accesses and purges tracked synthetic test records via TestOwnershipTracker.
 */
export class ConcurrencyLoadTestHarness {
  private server: Server | null = null;
  private port: number;
  private requestTimeoutMs: number;
  private inFlightRequestsCount = 0;
  private baseUrl = '';
  private tracker = new TestOwnershipTracker();
  private isExecuting = false;
  private abortController = new AbortController();

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

  /**
   * Initializes test server and establishes isolated database connection.
   */
  async initialize(): Promise<void> {
    console.log('\n===============================================================');
    console.log('   ADPAYON SAFE CONCURRENCY & LOAD TEST HARNESS (PHASE 8B)     ');
    console.log('===============================================================\n');

    // 1. Strict Database Isolation Verification
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_TEST_DB_NAME = 'adpayon_test';

    // Conservative connection pool override for high-concurrency isolated tests (default: 20)
    if (!process.env.MONGODB_MAX_POOL_SIZE) {
      process.env.MONGODB_MAX_POOL_SIZE = '20';
    }

    console.log('[SECURITY GUARD 1/3] Verifying database isolation...');
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
    console.log(`[SECURITY GUARD 1/3 PASSED] Confirmed target database: ${activeDbName} (Pool Size: ${process.env.MONGODB_MAX_POOL_SIZE})`);

    if (TransactionDiagnosticsTracker.isEnabled()) {
      TransactionDiagnosticsTracker.getInstance().attachClientListeners();
      console.log(`[DIAGNOSTICS] Active driver connection pool & command listeners attached.`);
    }

    // 2. Start Independent Isolated HTTP Server with In-Flight Tracking
    console.log(`[SECURITY GUARD 2/3] Starting isolated test server on port ${this.port}...`);
    await new Promise<void>((resolve, reject) => {
      this.server = app.listen(this.port, '127.0.0.1', () => {
        this.lifecycle.serverStarted = true;
        this.baseUrl = `http://127.0.0.1:${this.port}/api`;
        console.log(`[SECURITY GUARD 2/3 PASSED] Test server listening at ${this.baseUrl}`);
        resolve();
      });

      // Track active server-side HTTP handlers for graceful drain.
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

    console.log(`[SECURITY GUARD 3/3 PASSED] Environment and port boundaries locked (Request Timeout: ${this.requestTimeoutMs}ms).\n`);
  }

  public getTracker(): TestOwnershipTracker {
    return this.tracker;
  }

  /**
   * Gracefully awaits active in-flight request handlers and database transactions.
   */
  async drainInFlight(timeoutMs = 10000): Promise<boolean> {
    if (this.inFlightRequestsCount <= 0) return true;
    const drainStart = performance.now();
    console.log(`[DRAIN] Awaiting ${this.inFlightRequestsCount} in-flight request handler(s) to finish (max timeout: ${timeoutMs}ms)...`);
    while (this.inFlightRequestsCount > 0) {
      if (performance.now() - drainStart > timeoutMs) {
        console.error(`[DRAIN TIMEOUT] ${this.inFlightRequestsCount} in-flight handler(s) exceeded drain timeout of ${timeoutMs}ms!`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    console.log(`[DRAIN COMPLETE] All in-flight handlers drained cleanly in ${Math.round(performance.now() - drainStart)}ms.`);
    return true;
  }

  /**
   * Generates N distinct synthetic user identities with in-memory JWT tokens.
   */
  async seedSyntheticUsers(count: number, runId: number): Promise<SyntheticIdentity[]> {
    this.lifecycle.syntheticRecordsCreated = true;
    console.log(`Generating ${count} synthetic test identities for runId ${runId}...`);
    const identities: SyntheticIdentity[] = [];

    for (let i = 1; i <= count; i++) {
      const mobile = `+9178${runId}${String(i).padStart(4, '0')}`;
      const user = await User.create({
        mobile,
        name: `Load Test User ${i}`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$syntheticHashLoadVU',
        role: 'USER',
        status: 'ACTIVE',
        referralCode: `LDU${runId}${String(i).padStart(3, '0')}`,
        metadata: { kycStatus: 'VERIFIED' },
      });

      this.tracker.trackUser(user._id, mobile);
      const token = generateAccessToken({
        userId: user._id.toString(),
        role: user.role,
        mobile: user.mobile || mobile,
      });

      identities.push({
        userId: user._id.toString(),
        mobile,
        token,
      });
    }

    return identities;
  }

  /**
   * Seeds an isolated test campaign and task with configurable global cap and dwell time.
   */
  async seedTestCampaignAndTask(totalCap: number, dwellTimeSeconds = 3): Promise<{ campaignId: string; taskId: string }> {
    this.lifecycle.syntheticRecordsCreated = true;
    const runId = Math.floor(10000 + Math.random() * 90000);
    const campaign = await Campaign.create({
      name: `Load Test Campaign ${runId}`,
      advertiserName: 'Load Test Corp',
      authorizedAgreementRef: `AGR-LOAD-${runId}`,
      createdBy: new Types.ObjectId(),
      advertiserBudgetPaise: 500000,
      spentBudgetPaise: 0,
      status: 'ACTIVE',
      isSandbox: false,
      webhookSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    this.tracker.trackCampaign(campaign._id);

    const task = await Task.create({
      campaignId: campaign._id,
      title: `Load Test Task ${runId}`,
      description: 'Synthetic task for high-concurrency load verification',
      category: 'IN_APP_ACTION',
      verificationMethod: 'FIRST_PARTY_ACTION',
      rewardPoints: 10,
      totalCap,
      dailyCapPerUser: 5,
      dwellTimeSeconds,
      status: 'PUBLISHED',
      createdBy: new Types.ObjectId(),
    });
    this.tracker.trackTask(task._id);

    return {
      campaignId: campaign._id.toString(),
      taskId: task._id.toString(),
    };
  }

  /**
   * Executes a timed or bounded multi-user simulated journey across virtual users.
   * Supports both single-task and multi-task distributed benchmarking.
   */
  async executeStage(
    stageName: string,
    usersOrAssignments: SyntheticIdentity[] | { user: SyntheticIdentity; taskId: string }[],
    defaultTaskId?: string
  ): Promise<StageMetrics> {
    const assignments: { user: SyntheticIdentity; taskId: string }[] =
      usersOrAssignments.length > 0 && 'taskId' in usersOrAssignments[0]
        ? (usersOrAssignments as { user: SyntheticIdentity; taskId: string }[])
        : (usersOrAssignments as SyntheticIdentity[]).map((u) => ({
            user: u,
            taskId: defaultTaskId!,
          }));

    console.log(`\n>>> STARTING STAGE: ${stageName} (${assignments.length} Concurrent Users)`);

    const latencies: number[] = [];
    const statusCodes: Record<number, number> = {};
    const endpointLatencies: Record<'feed' | 'start' | 'heartbeat' | 'verify' | 'history', number[]> = {
      feed: [],
      start: [],
      heartbeat: [],
      verify: [],
      history: [],
    };
    const txDiagnosticsList: VerificationDiagnostic[] = [];
    let successfulRequests = 0;
    let failedRequests = 0;
    let tasksCompleted = 0;
    let duplicateClaimsBlocked = 0;
    let capExhaustedResponses = 0;
    let emptyIntervalsRejected = 0;
    let insufficientDwellRejected = 0;
    let assignmentExpiredRejected = 0;
    let otherRejections = 0;
    let expectedBusinessRejections = 0;
    let unexpectedFailures = 0;
    let timeoutFailures = 0;

    const memStart = process.memoryUsage();
    const cpuStart = process.cpuUsage();
    const stageStartTime = performance.now();

    // Execute concurrent journeys
    const runUserJourney = async (item: { user: SyntheticIdentity; taskId: string }) => {
      const { user, taskId } = item;
      const isDiagActive = process.env.LOAD_TEST_DIAGNOSTICS === 'true';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
        ...(isDiagActive ? { 'x-load-test-diagnostics': 'true' } : {}),
        ...(process.env.TEST_CANDIDATE_TX_ORDERING === 'true' ? { 'x-candidate-tx-ordering': 'true' } : {}),
      };

      const recordRequest = (status: number, durationMs: number, endpoint: 'feed' | 'start' | 'heartbeat' | 'verify' | 'history') => {
        latencies.push(durationMs);
        endpointLatencies[endpoint].push(durationMs);
        statusCodes[status] = (statusCodes[status] || 0) + 1;
        if (status >= 200 && status < 300) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
      };

      // 1. Fetch Task Feed
      try {
        const t0 = performance.now();
        const feedRes = await fetch(`${this.baseUrl}/tasks/feed`, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        recordRequest(feedRes.status, performance.now() - t0, 'feed');
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        recordRequest(504, this.requestTimeoutMs, 'feed');
        if (isTimeout) {
          timeoutFailures++;
        } else {
          unexpectedFailures++;
        }
      }

      // 2. Start Task
      let assignmentClickId: string | null = null;
      let assignedAtMs = Date.now();
      let startSuccess = false;

      try {
        const t1 = performance.now();
        const startRes = await fetch(`${this.baseUrl}/tasks/${taskId}/start`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        const startDur = performance.now() - t1;
        recordRequest(startRes.status, startDur, 'start');

        if (startRes.status === 201) {
          const body = (await startRes.json()) as any;
          const assignment = body.data?.assignment;
          assignmentClickId = assignment?.clickId;
          if (assignment?.assignedAt) {
            assignedAtMs = new Date(assignment.assignedAt).getTime();
          }
          if (assignment?.id) {
            this.tracker.trackAssignment(assignment.id);
          }
          startSuccess = true;
        } else if (startRes.status === 409) {
          duplicateClaimsBlocked++;
          expectedBusinessRejections++;
        } else if (startRes.status === 400) {
          const body = (await startRes.json()) as any;
          const code = body.error?.code;
          if (code === 'CAP_EXHAUSTED' || code === 'GLOBAL_CAP_EXHAUSTED') {
            capExhaustedResponses++;
            expectedBusinessRejections++;
          } else {
            otherRejections++;
          }
        } else {
          unexpectedFailures++;
        }
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        recordRequest(504, this.requestTimeoutMs, 'start');
        if (isTimeout) {
          timeoutFailures++;
        } else {
          unexpectedFailures++;
        }
      }

      // 3. Heartbeat and Telemetry Engagement (if assigned)
      if (startSuccess && assignmentClickId) {
        // Interval starts at actual assignment timestamp (or current time if slightly ahead)
        const intervalStartMs = Math.max(assignedAtMs, Date.now());

        // Wait 1.5s real wall-clock elapsed time before sending heartbeat
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Send Heartbeat (respects rate limit > 500ms)
        try {
          const t2 = performance.now();
          const hbRes = await fetch(`${this.baseUrl}/tasks/${taskId}/heartbeat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ activeDurationSeconds: 1 }),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
          recordRequest(hbRes.status, performance.now() - t2, 'heartbeat');
        } catch (err: any) {
          const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
          recordRequest(504, this.requestTimeoutMs, 'heartbeat');
          if (isTimeout) {
            timeoutFailures++;
          } else {
            unexpectedFailures++;
          }
        }

        // Wait remaining dwell time (1.7s) to guarantee real wall-clock elapsed time exceeds 3.0s dwellTimeSeconds
        await new Promise((resolve) => setTimeout(resolve, 1700));

        // Close foreground interval at current wall clock
        const intervalEndMs = Date.now();
        const intervals = [{ start: intervalStartMs, end: intervalEndMs }];

        // 4. Verify Task Action with valid non-empty monotonic telemetry intervals
        try {
          const t3 = performance.now();
          const verifyRes = await fetch(`${this.baseUrl}/tasks/${taskId}/verify-action`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ intervals }),
            signal: AbortSignal.timeout(this.requestTimeoutMs),
          });
          const verifyDur = performance.now() - t3;
          recordRequest(verifyRes.status, verifyDur, 'verify');

          if (verifyRes.status === 200) {
            tasksCompleted++;
            const body = (await verifyRes.json()) as any;
            if (body.data?.completion?.id) {
              this.tracker.trackCompletion(body.data.completion.id);
            }
            if (body._diagnostics) {
              txDiagnosticsList.push(body._diagnostics);
            }
          } else if (verifyRes.status === 400) {
            const body = (await verifyRes.json()) as any;
            const errCode = body.error?.code || 'UNKNOWN_ERROR';
            if (errCode === 'CAP_EXHAUSTED' || errCode === 'GLOBAL_CAP_EXHAUSTED') {
              capExhaustedResponses++;
              expectedBusinessRejections++;
            } else if (errCode === 'EMPTY_INTERVALS') {
              emptyIntervalsRejected++;
            } else if (errCode === 'INSUFFICIENT_DWELL_TIME') {
              insufficientDwellRejected++;
            } else if (errCode === 'ASSIGNMENT_EXPIRED') {
              assignmentExpiredRejected++;
              expectedBusinessRejections++;
            } else {
              otherRejections++;
            }
          } else {
            unexpectedFailures++;
          }
        } catch (err: any) {
          const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
          recordRequest(504, this.requestTimeoutMs, 'verify');
          if (isTimeout) {
            timeoutFailures++;
          } else {
            unexpectedFailures++;
          }
        }
      }

      // 5. Fetch History
      try {
        const t4 = performance.now();
        const histRes = await fetch(`${this.baseUrl}/tasks/history?page=1&limit=10`, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        recordRequest(histRes.status, performance.now() - t4, 'history');
      } catch (err: any) {
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        recordRequest(504, this.requestTimeoutMs, 'history');
        if (isTimeout) {
          timeoutFailures++;
        } else {
          unexpectedFailures++;
        }
      }
    };

    // Execute concurrently across all virtual users in this stage
    await Promise.all(assignments.map((item) => runUserJourney(item)));

    const stageDurationMs = performance.now() - stageStartTime;
    const memEnd = process.memoryUsage();
    const cpuEnd = process.cpuUsage(cpuStart);

    latencies.sort((a, b) => a - b);
    const totalRequests = latencies.length;
    const sumLatency = latencies.reduce((acc, v) => acc + v, 0);

    const calculateEndpointStats = (latList: number[]): EndpointLatencyStats => {
      if (latList.length === 0) {
        return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
      }
      const sorted = [...latList].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      return {
        count: sorted.length,
        avgMs: Number((sum / sorted.length).toFixed(2)),
        p50Ms: calculatePercentile(sorted, 50),
        p95Ms: calculatePercentile(sorted, 95),
        p99Ms: calculatePercentile(sorted, 99),
        maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
      };
    };

    const endpointLatency = {
      feed: calculateEndpointStats(endpointLatencies.feed),
      start: calculateEndpointStats(endpointLatencies.start),
      heartbeat: calculateEndpointStats(endpointLatencies.heartbeat),
      verify: calculateEndpointStats(endpointLatencies.verify),
      history: calculateEndpointStats(endpointLatencies.history),
    };

    // Ensure in-flight request handlers and transactions have drained before authoritative DB validation
    if (this.inFlightRequestsCount > 0) {
      console.log(`\n[POST-STAGE DRAIN] Awaiting ${this.inFlightRequestsCount} in-flight handler(s) before authoritative consistency audit...`);
      await this.drainInFlight(10000);
    }

    // Active Database Consistency Validation across all distinct tasks in this stage
    const distinctTaskIds = Array.from(new Set(assignments.map((a) => a.taskId)));
    const perTaskConsistency: TaskConsistencyDetail[] = [];
    let allTasksConsistent = true;
    let totalDbVerifiedCompletions = 0;
    let totalDuplicateCompletions = 0;
    let totalTaskCompletionsCount = 0;

    for (const tId of distinctTaskIds) {
      const taskDoc = await Task.findById(tId);
      const targetUsersCount = assignments.filter((a) => a.taskId === tId).length;
      const tCompletionsCount = taskDoc?.completionsCount || 0;
      totalTaskCompletionsCount += tCompletionsCount;

      const tDbVerified = await TaskCompletion.countDocuments({
        taskId: new Types.ObjectId(tId),
        status: 'VERIFIED',
      });
      totalDbVerifiedCompletions += tDbVerified;

      const duplicateGroups = await TaskCompletion.aggregate([
        { $match: { taskId: new Types.ObjectId(tId) } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]);
      const duplicateCount = duplicateGroups.length;
      totalDuplicateCompletions += duplicateCount;

      const isTaskConsistent =
        tCompletionsCount === tDbVerified &&
        duplicateCount === 0 &&
        tCompletionsCount <= (taskDoc?.totalCap || 0);

      if (!isTaskConsistent) {
        allTasksConsistent = false;
      }

      perTaskConsistency.push({
        taskId: tId,
        targetUsers: targetUsersCount,
        taskCap: taskDoc?.totalCap || 0,
        taskCompletionsCount: tCompletionsCount,
        dbVerifiedCompletions: tDbVerified,
        duplicateUserCompletions: duplicateCount,
        isConsistent: isTaskConsistent,
      });
    }

    const isConsistent =
      allTasksConsistent &&
      totalTaskCompletionsCount === totalDbVerifiedCompletions &&
      totalDuplicateCompletions === 0 &&
      totalDbVerifiedCompletions <= assignments.length;

    const committedAfterTimeoutCount = Math.max(0, totalDbVerifiedCompletions - tasksCompleted);

    const consistencyCheck = {
      taskCompletionsCount: totalTaskCompletionsCount,
      dbVerifiedCompletions: totalDbVerifiedCompletions,
      duplicateUserCompletions: totalDuplicateCompletions,
      httpSuccessfulCompletions: tasksCompleted,
      httpTimeoutCount: timeoutFailures,
      committedAfterTimeoutCount,
      isConsistent,
    };

    let txDiagnostics: AggregateTxDiagnostics | undefined = undefined;
    if (txDiagnosticsList.length > 0) {
      const n = txDiagnosticsList.length;
      const attempts = txDiagnosticsList.map((d) => d.attemptCount);
      const durations = txDiagnosticsList.map((d) => d.totalTxMs).sort((a, b) => a - b);
      const sumDur = durations.reduce((a, b) => a + b, 0);
      const sumAttempts = attempts.reduce((a, b) => a + b, 0);
      const sumClaim = txDiagnosticsList.reduce((a, d) => a + d.steps.claimAssignmentMs, 0);
      const sumReserve = txDiagnosticsList.reduce((a, d) => a + d.steps.reserveCapMs, 0);
      const sumEvidence = txDiagnosticsList.reduce((a, d) => a + d.steps.insertEvidenceMs, 0);
      const sumCompletion = txDiagnosticsList.reduce((a, d) => a + d.steps.insertCompletionMs, 0);
      const sumEvent = txDiagnosticsList.reduce((a, d) => a + d.steps.insertEventMs, 0);
      const sumCallback = txDiagnosticsList.reduce((a, d) => a + d.steps.totalCallbackMs, 0);
      const sumFailedAttempts = txDiagnosticsList.reduce((a, d) => a + (d.cumulativeFailedAttemptsMs || 0), 0);
      const sumFinalAttempt = txDiagnosticsList.reduce((a, d) => a + (d.finalAttemptDurationMs || d.steps.totalCallbackMs || 0), 0);
      const sumRemainingOverhead = txDiagnosticsList.reduce((a, d) => a + (d.remainingOverheadMs ?? d.commitDurationMs ?? 0), 0);
      const queueWaitSamples = txDiagnosticsList
        .map((d) => d.queueWaitMs)
        .filter((w): w is number => typeof w === 'number')
        .sort((a, b) => a - b);
      const sumQueueWait = queueWaitSamples.reduce((a, b) => a + b, 0);
      const currentCount = txDiagnosticsList.filter((d) => d.ordering === 'CURRENT').length;
      const candidateCount = txDiagnosticsList.filter((d) => d.ordering === 'CANDIDATE').length;
      const requested: 'CURRENT' | 'CANDIDATE' = process.env.TEST_CANDIDATE_TX_ORDERING === 'true' ? 'CANDIDATE' : 'CURRENT';
      const executed: 'CURRENT' | 'CANDIDATE' | 'MIXED' =
        candidateCount === n ? 'CANDIDATE' :
        currentCount === n ? 'CURRENT' :
        'MIXED';
      const isOrderingValid = requested === executed;

      txDiagnostics = {
        totalCompletionsSampled: n,
        requestedOrdering: requested,
        executedOrdering: executed,
        currentSamplesCount: currentCount,
        candidateSamplesCount: candidateCount,
        isOrderingValid,
        attemptsAvg: Number((sumAttempts / n).toFixed(2)),
        attemptsMax: Math.max(...attempts),
        usersWithRetries: txDiagnosticsList.filter((d) => d.retries > 0).length,
        totalTxDurationAvgMs: Number((sumDur / n).toFixed(2)),
        totalTxDurationP95Ms: calculatePercentile(durations, 95),
        totalTxDurationMaxMs: durations[durations.length - 1],
        cumulativeFailedAttemptsAvgMs: Number((sumFailedAttempts / n).toFixed(2)),
        finalAttemptDurationAvgMs: Number((sumFinalAttempt / n).toFixed(2)),
        remainingOverheadAvgMs: Number((sumRemainingOverhead / n).toFixed(2)),
        commitDurationAvgMs: Number((sumRemainingOverhead / n).toFixed(2)),
        stepsAvgMs: {
          claimAssignmentMs: Number((sumClaim / n).toFixed(2)),
          reserveCapMs: Number((sumReserve / n).toFixed(2)),
          insertEvidenceMs: Number((sumEvidence / n).toFixed(2)),
          insertCompletionMs: Number((sumCompletion / n).toFixed(2)),
          insertEventMs: Number((sumEvent / n).toFixed(2)),
          totalCallbackMs: Number((sumCallback / n).toFixed(2)),
        },
        queueWaitAvgMs: queueWaitSamples.length > 0 ? Number((sumQueueWait / queueWaitSamples.length).toFixed(2)) : undefined,
        queueWaitP95Ms: queueWaitSamples.length > 0 ? calculatePercentile(queueWaitSamples, 95) : undefined,
        queueWaitMaxMs: queueWaitSamples.length > 0 ? queueWaitSamples[queueWaitSamples.length - 1] : undefined,
        poolMetrics: TransactionDiagnosticsTracker.isEnabled()
          ? TransactionDiagnosticsTracker.getInstance().getPoolMetrics()
          : undefined,
      };
    }

    const isDiagRequested = process.env.LOAD_TEST_DIAGNOSTICS === 'true';
    let diagnosticsStatus: 'ENABLED_DATA_CAPTURED' | 'INCOMPLETE_NO_DATA' | 'DISABLED' = 'DISABLED';

    if (isDiagRequested) {
      if (txDiagnostics && txDiagnostics.totalCompletionsSampled > 0) {
        diagnosticsStatus = 'ENABLED_DATA_CAPTURED';
      } else {
        diagnosticsStatus = 'INCOMPLETE_NO_DATA';
        console.warn('\n[DIAGNOSTICS WARNING] --diagnostics was requested but 0 transaction telemetry samples were captured! Marking benchmark INCOMPLETE.\n');
      }
    }

    const metrics: StageMetrics = {
      stageName,
      concurrency: assignments.length,
      totalRequests,
      successfulRequests,
      failedRequests,
      errorPercentage: totalRequests > 0 ? Number(((failedRequests / totalRequests) * 100).toFixed(2)) : 0,
      durationMs: Number(stageDurationMs.toFixed(2)),
      requestsPerSecond: stageDurationMs > 0 ? Number(((totalRequests / (stageDurationMs / 1000))).toFixed(2)) : 0,
      latency: {
        minMs: latencies.length > 0 ? Number(latencies[0].toFixed(2)) : 0,
        maxMs: latencies.length > 0 ? Number(latencies[latencies.length - 1].toFixed(2)) : 0,
        avgMs: latencies.length > 0 ? Number((sumLatency / (latencies.length || 1)).toFixed(2)) : 0,
        p50Ms: calculatePercentile(latencies, 50),
        p95Ms: calculatePercentile(latencies, 95),
        p99Ms: calculatePercentile(latencies, 99),
      },
      endpointLatency,
      statusCodes,
      businessMetrics: {
        tasksCompleted,
        duplicateClaimsBlocked,
        capExhaustedResponses,
        emptyIntervalsRejected,
        insufficientDwellRejected,
        assignmentExpiredRejected,
        otherRejections,
        expectedBusinessRejections,
        unexpectedFailures,
        timeoutFailures,
      },
      consistencyCheck,
      perTaskConsistency,
      txDiagnostics,
      diagnosticsStatus,
      resourceUsage: {
        heapUsedMbStart: Number((memStart.heapUsed / (1024 * 1024)).toFixed(2)),
        heapUsedMbEnd: Number((memEnd.heapUsed / (1024 * 1024)).toFixed(2)),
        rssMb: Number((memEnd.rss / (1024 * 1024)).toFixed(2)),
        cpuUserMs: Math.round(cpuEnd.user / 1000),
        cpuSystemMs: Math.round(cpuEnd.system / 1000),
      },
    };

    this.printStageReport(metrics);
    return metrics;
  }

  /**
   * Prints formatted stage benchmark metrics report.
   */
  private printStageReport(m: StageMetrics): void {
    console.log(`---------------------------------------------------------------`);
    console.log(`REPORT: ${m.stageName} (Concurrency: ${m.concurrency})`);
    console.log(`---------------------------------------------------------------`);
    console.log(`Total Requests:         ${m.totalRequests}`);
    console.log(`Throughput:             ${m.requestsPerSecond} req/sec`);
    console.log(`Duration:               ${m.durationMs} ms`);
    console.log(`Success / Failed:       ${m.successfulRequests} / ${m.failedRequests} (${m.errorPercentage}% errors)`);
    console.log(`Status Codes:           ${JSON.stringify(m.statusCodes)}`);
    console.log(`Latency p50 (Median):   ${m.latency.p50Ms} ms`);
    console.log(`Latency p95:            ${m.latency.p95Ms} ms`);
    console.log(`Latency p99:            ${m.latency.p99Ms} ms`);
    console.log(`Latency Min / Max:      ${m.latency.minMs} ms / ${m.latency.maxMs} ms`);

    if (m.endpointLatency) {
      console.log(`---------------------------------------------------------------`);
      console.log(`PER-ENDPOINT LATENCY DIAGNOSTICS:`);
      for (const [ep, s] of Object.entries(m.endpointLatency)) {
        const epLabel = (ep.charAt(0).toUpperCase() + ep.slice(1)).padEnd(10, ' ');
        console.log(`  ${epLabel}: p50=${s.p50Ms.toString().padStart(6)}ms | p95=${s.p95Ms.toString().padStart(7)}ms | p99=${s.p99Ms.toString().padStart(7)}ms | avg=${s.avgMs.toString().padStart(7)}ms | max=${s.maxMs.toString().padStart(7)}ms (${s.count} reqs)`);
      }
    }

    console.log(`---------------------------------------------------------------`);
    console.log(`Tasks Completed:        ${m.businessMetrics.tasksCompleted}`);
    console.log(`Cap Exhausted:          ${m.businessMetrics.capExhaustedResponses}`);
    console.log(`Duplicate Blocked:      ${m.businessMetrics.duplicateClaimsBlocked}`);
    console.log(`Empty Intervals Rej:    ${m.businessMetrics.emptyIntervalsRejected}`);
    console.log(`Insuff Dwell Rej:       ${m.businessMetrics.insufficientDwellRejected}`);
    console.log(`Expired Rej:            ${m.businessMetrics.assignmentExpiredRejected}`);
    console.log(`Timeout Failures:       ${m.businessMetrics.timeoutFailures}`);
    console.log(`Other Rejections:       ${m.businessMetrics.otherRejections}`);
    console.log(`Expected Biz Rejections:${m.businessMetrics.expectedBusinessRejections}`);
    console.log(`Unexpected Failures:    ${m.businessMetrics.unexpectedFailures}`);
    console.log(`---------------------------------------------------------------`);
    console.log(`Consistency Audit:      ${m.consistencyCheck.isConsistent ? 'VERIFIED (100% ACID CONSISTENT)' : 'FAILED'}`);
    console.log(`  Task completionsCount: ${m.consistencyCheck.taskCompletionsCount}`);
    console.log(`  DB Verified Records:   ${m.consistencyCheck.dbVerifiedCompletions}`);
    console.log(`  Duplicate Claims:      ${m.consistencyCheck.duplicateUserCompletions}`);
    console.log(`  HTTP Acknowledged:     ${m.consistencyCheck.httpSuccessfulCompletions}`);
    console.log(`  HTTP Timed Out:        ${m.consistencyCheck.httpTimeoutCount}`);
    if (m.consistencyCheck.committedAfterTimeoutCount > 0) {
      console.log(`  Committed Post-Timeout:${m.consistencyCheck.committedAfterTimeoutCount} (Valid server commits finalized during/after client timeout)`);
    }

    if (m.perTaskConsistency && m.perTaskConsistency.length > 1) {
      console.log(`---------------------------------------------------------------`);
      console.log(`PER-TASK CONSISTENCY BREAKDOWN:`);
      m.perTaskConsistency.forEach((t, idx) => {
        const status = t.isConsistent ? 'PASS' : 'FAIL';
        console.log(`  Task ${idx + 1} (${t.taskId}): TargetUsers=${t.targetUsers}, Cap=${t.taskCap}, Completed=${t.taskCompletionsCount}, DBVerified=${t.dbVerifiedCompletions}, Dupes=${t.duplicateUserCompletions} [${status}]`);
      });
    }

    console.log(`---------------------------------------------------------------`);
    if (m.diagnosticsStatus === 'ENABLED_DATA_CAPTURED' && m.txDiagnostics) {
      const d = m.txDiagnostics;
      console.log(`TRANSACTION PERFORMANCE INSTRUMENTATION [STATUS: ENABLED / DATA CAPTURED]:`);
      console.log(`  Completions Measured:   ${d.totalCompletionsSampled}`);
      console.log(`  Callback Attempts:      Avg ${d.attemptsAvg} | Max ${d.attemptsMax} (Users with retries: ${d.usersWithRetries})`);
      console.log(`  Transaction Duration:   Avg ${d.totalTxDurationAvgMs}ms | p95 ${d.totalTxDurationP95Ms}ms | Max ${d.totalTxDurationMaxMs}ms`);
      console.log(`  Transaction Ordering:`);
      const orderValidation = d.isOrderingValid ? '[VALID]' : '[INVALID - ORDERING MISMATCH]';
      console.log(`    - Requested:          ${d.requestedOrdering}`);
      console.log(`    - Executed:           ${d.executedOrdering} (${d.candidateSamplesCount} CANDIDATE, ${d.currentSamplesCount} CURRENT) ${orderValidation}`);
      if (!d.isOrderingValid) {
        console.warn(`\n  [CRITICAL ERROR] BENCHMARK INVALID: Executed ordering does not match requested ordering!\n`);
      }
      if (d.executedOrdering === 'CANDIDATE') {
        console.log(`  Statement Breakdown (Avg - Candidate Order):`);
        console.log(`    1. Claim Assignment:  ${d.stepsAvgMs.claimAssignmentMs} ms`);
        console.log(`    2. Insert Evidence:   ${d.stepsAvgMs.insertEvidenceMs} ms`);
        console.log(`    3. Insert Completion: ${d.stepsAvgMs.insertCompletionMs} ms`);
        console.log(`    4. Insert Event:      ${d.stepsAvgMs.insertEventMs} ms`);
        console.log(`    5. Reserve Cap ($inc):${d.stepsAvgMs.reserveCapMs} ms`);
      } else {
        console.log(`  Statement Breakdown (Avg - Current Order):`);
        console.log(`    1. Claim Assignment:  ${d.stepsAvgMs.claimAssignmentMs} ms`);
        console.log(`    2. Reserve Cap ($inc):${d.stepsAvgMs.reserveCapMs} ms`);
        console.log(`    3. Insert Evidence:   ${d.stepsAvgMs.insertEvidenceMs} ms`);
        console.log(`    4. Insert Completion: ${d.stepsAvgMs.insertCompletionMs} ms`);
        console.log(`    5. Insert Event:      ${d.stepsAvgMs.insertEventMs} ms`);
      }
      console.log(`    -- Successful Callback:       ${d.finalAttemptDurationAvgMs} ms`);
      console.log(`    -- Failed Callbacks Runtime:  ${d.cumulativeFailedAttemptsAvgMs} ms`);
      console.log(`    -- Retry Backoff & Commit Residual: ${d.remainingOverheadAvgMs} ms`);

      if (d.queueWaitAvgMs !== undefined) {
        console.log(`  In-Process Task Verification Queue Metrics:`);
        console.log(`    - Queue Wait Avg:     ${d.queueWaitAvgMs} ms`);
        console.log(`    - Queue Wait p95:     ${d.queueWaitP95Ms} ms`);
        console.log(`    - Queue Wait Max:     ${d.queueWaitMaxMs} ms`);
      }

      if (d.poolMetrics) {
        const pm = d.poolMetrics;
        console.log(`  Connection Pool & Driver Metrics:`);
        console.log(`    - Pool Checkouts:     ${pm.checkoutsTotal}`);
        console.log(`    - Avg Checkout Wait:  ${pm.checkoutAvgWaitMs} ms (Max: ${pm.checkoutMaxWaitMs} ms)`);
        console.log(`    - Checkout Failures:  ${pm.checkoutFailures}`);
        console.log(`    - Driver Failures:    ${pm.writeConflictsTotal} (Observed client command failure code 112 / WriteConflict; internal server retries not captured)`);
        console.log(`    - Transient Errors:   ${pm.transientErrorsTotal}`);
      }
    } else if (m.diagnosticsStatus === 'INCOMPLETE_NO_DATA') {
      console.log(`TRANSACTION PERFORMANCE INSTRUMENTATION [STATUS: INCOMPLETE / NO DATA]:`);
      console.log(`  CRITICAL WARNING: --diagnostics was requested but 0 transaction telemetry samples were captured.`);
      console.log(`  Benchmark status marked INCOMPLETE.`);
    } else {
      console.log(`TRANSACTION PERFORMANCE INSTRUMENTATION [STATUS: DISABLED]:`);
      console.log(`  (Enable with --diagnostics CLI flag to measure statement-level timings, commit duration, and pool stats)`);
    }

    console.log(`---------------------------------------------------------------`);
    console.log(`Heap Used:              ${m.resourceUsage.heapUsedMbStart} MB -> ${m.resourceUsage.heapUsedMbEnd} MB (RSS: ${m.resourceUsage.rssMb} MB)`);
    console.log(`CPU Time (User/Sys):    ${m.resourceUsage.cpuUserMs} ms / ${m.resourceUsage.cpuSystemMs} ms`);
    console.log(`---------------------------------------------------------------\n`);
  }

  /**
   * Safely purges all tracked records created during the test run.
   * Guarantees graceful shutdown: stops new requests, awaits in-flight transactions,
   * enforces bounded drain timeout, and verifies zero residual data.
   */
  async cleanup(): Promise<void> {
    console.log('\n[TEARDOWN] Starting safe shutdown sequence for load test harness...');

    // 1. Stop accepting new HTTP connections immediately
    let serverClosePromise: Promise<void> | null = null;
    if (this.server) {
      console.log('[DRAIN] Stopping isolated test server from accepting new connections...');
      serverClosePromise = new Promise<void>((resolve) => {
        this.server?.close(() => {
          this.lifecycle.serverStarted = false;
          resolve();
        });
      });
      // Close idle keep-alive connections immediately
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
        console.warn('[DRAIN WARNING] Force-closing remaining sockets due to drain timeout.');
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
      console.log('[CLEANUP] No synthetic records were created or tracked. Database purge safely skipped.');
    } else {
      // Synthetic records exist!
      // Enforce in-flight drain safety
      if (!cleanDrain) {
        const recoveryInfo = this.tracker.getRecoveryInfo();
        const blockerMsg = `CLEANUP BLOCKER: Draining timed out with ${this.inFlightRequestsCount} active in-flight handlers. ` +
          `Refusing to execute cleanup while unfinished transactions may still commit. ` +
          `Recovery information preserved for exact-ID purge: ${JSON.stringify(recoveryInfo)}`;
        console.error(`\n[CRITICAL ERROR] ${blockerMsg}\n`);
        throw new Error(`CLEANUP BLOCKER: In-flight transactions un-drained. Tracked IDs preserved: ${recoveryInfo.taskIds.join(', ')}`);
      }

      // Check database connection and identity
      const activeDb = mongoose.connection.db?.databaseName;
      const isDbReady = mongoose.connection.readyState === 1 && activeDb === 'adpayon_test';

      if (!isDbReady) {
        const recoveryInfo = this.tracker.getRecoveryInfo();
        const blockerMsg = `CLEANUP BLOCKER: Database unavailable or unverified during teardown (readyState: ${mongoose.connection.readyState}, db: '${activeDb}'). ` +
          `Refusing unsafe database purge. Synthetic records were created and preserved for exact-ID purge: ${JSON.stringify(recoveryInfo)}`;
        console.error(`\n[CRITICAL ERROR] ${blockerMsg}\n`);
        throw new Error(`CLEANUP BLOCKER: Database unavailable for cleanup. Tracked IDs preserved: ${recoveryInfo.taskIds.join(', ')}`);
      }

      console.log('[CLEANUP] Safely purging only tracked synthetic records from adpayon_test...');
      const result = await this.tracker.safeCleanup();
      console.log('[CLEANUP COMPLETED]', result);
    }

    // 4. Detach diagnostic driver event listeners during teardown
    TransactionDiagnosticsTracker.getInstance().detachClientListeners();

    // 5. Safely disconnect isolated Mongoose connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
      this.lifecycle.dbConnected = false;
      this.lifecycle.dbVerified = false;
    }
  }
}

/**
 * CLI Execution Entrypoint
 * Fails closed if '--execute-load-test' is not explicitly passed.
 */
export async function runLoadTestCli(): Promise<void> {
  const args = process.argv.slice(2);
  const isExecutionConfirmed = args.includes('--execute-load-test') || process.env.EXECUTE_LOAD_TEST === 'true';

  if (!isExecutionConfirmed) {
    console.log('\n===============================================================');
    console.log('       ADPAYON LOAD TEST HARNESS: SAFETY NOTICE               ');
    console.log('===============================================================');
    console.log('Status: DRY-RUN / READ-ONLY MODE');
    console.log('The load test harness code has been loaded and validated.');
    console.log('To execute multi-user load testing, the explicit safety flag is required:');
    console.log('\n   npm run test:load -- --execute-load-test --stage 5\n');
    console.log('Available Options:');
    console.log('   --execute-load-test    Explicit confirmation to start test');
    console.log('   --stage <5|10|25|50|100>  Specify virtual user stage');
    console.log('   --all-stages           Run all staged workloads in sequence');
    console.log('   --task-distribution <single|multi>  Distribute VUs across 1 or 3 tasks (default: single)');
    console.log('   --diagnostics          Enable low-overhead transaction & pool instrumentation');
    console.log('   --candidate-tx         Evaluate candidate transaction ordering (test-only, default: current)');
    console.log('   --verification-queue   Enable in-process per-task verification queue (test-only, default: off)');
    console.log('   --cap <number>         Custom global cap (default: vuCount or per-task split)');
    console.log('   --dwell <seconds>      Required dwell time in seconds (default: 3)');
    console.log('   --timeout <ms>         HTTP request timeout in ms (default: 8000 for <25 VUs, 15000 for 25+ VUs)');
    console.log('   --port <number>        Custom isolated port (default: 5099)');
    console.log('===============================================================\n');
    process.exit(0);
  }

  const isDiagFlag = args.includes('--diagnostics') || process.env.LOAD_TEST_DIAGNOSTICS === 'true';
  if (isDiagFlag) {
    process.env.LOAD_TEST_DIAGNOSTICS = 'true';
  }

  const isCandidateTx = args.includes('--candidate-tx') || process.env.TEST_CANDIDATE_TX_ORDERING === 'true';
  if (isCandidateTx) {
    process.env.TEST_CANDIDATE_TX_ORDERING = 'true';
  }

  const isVerificationQueue = args.includes('--verification-queue') || process.env.TASK_VERIFICATION_QUEUE_ENABLED === 'true';
  if (isVerificationQueue) {
    process.env.TASK_VERIFICATION_QUEUE_ENABLED = 'true';
  }

  const stageArg = args.indexOf('--stage') !== -1 ? parseInt(args[args.indexOf('--stage') + 1], 10) : 5;
  const isAllStages = args.includes('--all-stages');
  const portArg = args.indexOf('--port') !== -1 ? parseInt(args[args.indexOf('--port') + 1], 10) : 5099;
  const capArg = args.indexOf('--cap') !== -1 ? parseInt(args[args.indexOf('--cap') + 1], 10) : undefined;
  const dwellArg = args.indexOf('--dwell') !== -1 ? parseInt(args[args.indexOf('--dwell') + 1], 10) : 3;
  const taskDistIndex = args.indexOf('--task-distribution');
  const taskDistribution: 'single' | 'multi' =
    taskDistIndex !== -1 && args[taskDistIndex + 1]?.toLowerCase() === 'multi'
      ? 'multi'
      : 'single';
  const defaultTimeout = stageArg >= 25 ? 15000 : 8000;
  const timeoutArg = args.indexOf('--timeout') !== -1 ? parseInt(args[args.indexOf('--timeout') + 1], 10) : defaultTimeout;

  const harness = new ConcurrencyLoadTestHarness(portArg, timeoutArg);
  const runId = Math.floor(10000 + Math.random() * 90000);

  let executionError: Error | null = null;
  let cleanupError: Error | null = null;

  try {
    await harness.initialize();

    const stagesToRun = isAllStages ? [5, 10, 25, 50, 100] : [stageArg];

    for (const vuCount of stagesToRun) {
      const users = await harness.seedSyntheticUsers(vuCount, runId);

      if (taskDistribution === 'multi') {
        // Distribute VUs across exactly 3 independent tasks (for 25 VUs: 9, 8, 8)
        const numTasks = 3;
        const base = Math.floor(vuCount / numTasks);
        const rem = vuCount % numTasks;
        const groupSizes: number[] = [
          base + (rem > 0 ? 1 : 0),
          base + (rem > 1 ? 1 : 0),
          base,
        ];

        console.log(`\n[MULTI-TASK CONFIGURATION] Distributing ${vuCount} users across 3 independent tasks: [${groupSizes.join(', ')}]`);

        const userAssignments: { user: SyntheticIdentity; taskId: string }[] = [];
        let userOffset = 0;

        for (let tIdx = 0; tIdx < groupSizes.length; tIdx++) {
          const groupSize = groupSizes[tIdx];
          const taskCap = capArg !== undefined ? capArg : groupSize;
          const { taskId } = await harness.seedTestCampaignAndTask(taskCap, dwellArg);
          console.log(`  Task ${tIdx + 1}: ID ${taskId} (Cap: ${taskCap}, Assigned Users: ${groupSize})`);

          for (let u = 0; u < groupSize; u++) {
            if (userOffset < users.length) {
              userAssignments.push({
                user: users[userOffset],
                taskId,
              });
              userOffset++;
            }
          }
        }

        const stageMetrics = await harness.executeStage(
          `Stage (${vuCount} VUs - Multi-Task: 3 Tasks [${groupSizes.join('/')}])`,
          userAssignments
        );
        if (isDiagFlag && stageMetrics.diagnosticsStatus === 'INCOMPLETE_NO_DATA') {
          executionError = new Error('Diagnostic benchmark INCOMPLETE: --diagnostics was requested but 0 transaction telemetry samples were captured.');
        }
      } else {
        const taskCap = capArg !== undefined ? capArg : vuCount;
        const { taskId } = await harness.seedTestCampaignAndTask(taskCap, dwellArg);
        const stageMetrics = await harness.executeStage(`Stage (${vuCount} VUs - Single Task)`, users, taskId);
        if (isDiagFlag && stageMetrics.diagnosticsStatus === 'INCOMPLETE_NO_DATA') {
          executionError = new Error('Diagnostic benchmark INCOMPLETE: --diagnostics was requested but 0 transaction telemetry samples were captured.');
        }
      }
    }
  } catch (err: any) {
    executionError = err;
    console.error('\n[FATAL] Load test execution error:', err.message);
  } finally {
    try {
      await harness.cleanup();
    } catch (cErr: any) {
      cleanupError = cErr;
      console.error('\n[FATAL] Teardown error:', cErr.message);
    }

    if (executionError || cleanupError) {
      if (executionError && cleanupError) {
        console.error(`\n[FAILURE SUMMARY] Initial error: "${executionError.message}" | Cleanup error: "${cleanupError.message}"`);
      }
      process.exit(1);
    }
  }
}

if (require.main === module) {
  runLoadTestCli();
}
