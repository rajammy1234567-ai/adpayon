import { Response } from 'express';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mongoose, { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  VerificationEvidence,
} from '../models';
import { env } from '../config/env';
import {
  TransactionDiagnosticsTracker,
  VerificationDiagnostic,
  TransactionStepMetrics,
} from '../testUtils/loadTestDiagnostics';
import { taskVerificationMutex, QueueOverloadError } from '../utils/keyedMutex';

export class TaskVerificationError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'TaskVerificationError';
  }
}

/**
 * Test-only synchronization barrier hook for evaluating transaction interleaving and races.
 * Active exclusively when authorized isolated load test / diagnostic context is verified.
 */
export let testTxBarrier: (() => Promise<void>) | null = null;
export function setTestTxBarrier(barrier: (() => Promise<void>) | null): void {
  testTxBarrier = barrier;
}

/**
 * Helper to compute start of current UTC calendar day.
 */
function getStartOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const CLOCK_TOLERANCE_MS = 5000; // 5-second allowance for network latency / device clock skew

export interface EngagementIntervalValidation {
  valid: boolean;
  totalActiveSeconds: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Validates active foreground engagement intervals against assignment creation time,
 * monotonic non-overlapping ordering, and real-time wall-clock bounds.
 */
export function validateEngagementIntervals(
  rawIntervals: any[],
  assignedAt: Date,
  maxAllowedTime: Date = new Date()
): EngagementIntervalValidation {
  if (!Array.isArray(rawIntervals)) {
    return {
      valid: false,
      totalActiveSeconds: 0,
      errorCode: 'INVALID_INTERVALS_FORMAT',
      errorMessage: 'Intervals must be an array of { start, end } objects',
    };
  }

  if (rawIntervals.length === 0) {
    return {
      valid: false,
      totalActiveSeconds: 0,
      errorCode: 'EMPTY_INTERVALS',
      errorMessage: 'At least one engagement interval is required',
    };
  }

  if (rawIntervals.length > 100) {
    return {
      valid: false,
      totalActiveSeconds: 0,
      errorCode: 'EXCESSIVE_INTERVALS',
      errorMessage: 'Number of engagement intervals exceeds maximum allowed limit (100)',
    };
  }

  const assignedAtMs = assignedAt.getTime();
  const maxTimeMs = maxAllowedTime.getTime();
  let totalActiveMs = 0;
  let previousEndMs = -Infinity;

  for (let i = 0; i < rawIntervals.length; i++) {
    const item = rawIntervals[i];
    if (!item || typeof item !== 'object') {
      return {
        valid: false,
        totalActiveSeconds: 0,
        errorCode: 'INVALID_INTERVAL',
        errorMessage: `Interval at index ${i} is not a valid object`,
      };
    }

    const startMs = typeof item.start === 'number' ? item.start : new Date(item.start).getTime();
    const endMs = typeof item.end === 'number' ? item.end : new Date(item.end).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return {
        valid: false,
        totalActiveSeconds: 0,
        errorCode: 'INVALID_INTERVAL',
        errorMessage: `Interval at index ${i} has invalid start or end timestamps`,
      };
    }

    if (endMs <= startMs) {
      return {
        valid: false,
        totalActiveSeconds: 0,
        errorCode: 'INVALID_INTERVAL',
        errorMessage: `Interval at index ${i} has end timestamp <= start timestamp`,
      };
    }

    // Overlapping or disordered interval check
    if (startMs < previousEndMs) {
      return {
        valid: false,
        totalActiveSeconds: 0,
        errorCode: 'OVERLAPPING_INTERVALS',
        errorMessage: `Interval at index ${i} overlaps with preceding interval`,
      };
    }

    // Lower bound: Cannot precede assignment creation time (with clock tolerance)
    if (startMs < assignedAtMs - CLOCK_TOLERANCE_MS) {
      return {
        valid: false,
        totalActiveSeconds: 0,
        errorCode: 'TAMPERED_TIMESTAMP',
        errorMessage: `Interval at index ${i} starts before assignment was created`,
      };
    }

    // Upper bound: Cannot be in the future (with clock tolerance)
    if (endMs > maxTimeMs + CLOCK_TOLERANCE_MS) {
      return {
        valid: false,
        totalActiveSeconds: 0,
        errorCode: 'TAMPERED_TIMESTAMP',
        errorMessage: `Interval at index ${i} ends in the future`,
      };
    }

    const durationMs = endMs - startMs;
    totalActiveMs += durationMs;
    previousEndMs = endMs;
  }

  // Real-time elapsed upper bound: total active time cannot exceed actual wall-clock elapsed time
  const maxElapsedWallClockMs = maxTimeMs - assignedAtMs + CLOCK_TOLERANCE_MS;
  if (totalActiveMs > maxElapsedWallClockMs) {
    return {
      valid: false,
      totalActiveSeconds: 0,
      errorCode: 'TAMPERED_TIMESTAMP',
      errorMessage: 'Total active engagement duration exceeds elapsed real time since assignment',
    };
  }

  return {
    valid: true,
    totalActiveSeconds: Math.floor(totalActiveMs / 1000),
  };
}

/**
 * GET /api/tasks/feed
 * Returns active, published tasks that match the user's eligibility criteria.
 */
export async function getTaskFeed(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const startOfToday = getStartOfTodayUtc();
  const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';

  // 1. Find all published tasks
  const publishedTasks = await Task.find({
    status: 'PUBLISHED',
  })
    .populate('campaignId', 'name status advertiserBudgetPaise spentBudgetPaise isSandbox')
    .sort({ createdAt: -1 })
    .lean();

  // 2. Fetch user's active assignments and today's completions
  const [activeAssignments, todayCompletions] = await Promise.all([
    TaskAssignment.find({
      userId: user._id,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
      expiresAt: { $gt: new Date() },
    }).lean(),
    TaskCompletion.find({
      userId: user._id,
      completedAt: { $gte: startOfToday },
    }).lean(),
  ]);

  const activeTaskIdMap = new Map(activeAssignments.map((a) => [a.taskId.toString(), a]));
  const todayCompletionCounts = new Map<string, number>();
  for (const c of todayCompletions) {
    const tId = c.taskId.toString();
    todayCompletionCounts.set(tId, (todayCompletionCounts.get(tId) || 0) + 1);
  }

  // 3. Filter and annotate tasks based on server-side eligibility checks
  const feed = [];

  for (const t of publishedTasks) {
    const campaign = t.campaignId as any;
    // Hide tasks whose parent campaign is not ACTIVE
    if (!campaign || campaign.status !== 'ACTIVE') {
      continue;
    }

    // Strict environment boundary: sandbox campaigns are only visible in sandbox environment
    if (campaign.isSandbox && !isSandboxEnv) {
      continue;
    }

    // Hide if global totalCap is reached
    if (t.completionsCount >= t.totalCap) {
      continue;
    }

    // Hide if task has expired
    if (t.expiresAt && new Date(t.expiresAt) <= new Date()) {
      continue;
    }

    // Server-side targeting evaluation
    let eligible = true;
    let ineligibilityReason: string | undefined;

    if (t.targeting?.kycRequired && user.metadata?.kycStatus !== 'VERIFIED') {
      eligible = false;
      ineligibilityReason = 'KYC verification required';
    }

    if (
      t.targeting?.minAncestryDepth &&
      t.targeting.minAncestryDepth > 0 &&
      (!user.ancestors || user.ancestors.length < t.targeting.minAncestryDepth)
    ) {
      eligible = false;
      ineligibilityReason = 'Requires higher upline depth';
    }

    const completedToday = todayCompletionCounts.get(t._id.toString()) || 0;
    if (completedToday >= t.dailyCapPerUser) {
      eligible = false;
      ineligibilityReason = 'Daily completion limit reached';
    }

    const activeAssignment = activeTaskIdMap.get(t._id.toString());

    feed.push({
      id: t._id.toString(),
      campaignName: campaign.name,
      title: t.title,
      description: t.description,
      category: t.category,
      verificationMethod: t.verificationMethod,
      rewardPoints: t.rewardPoints,
      dailyCapPerUser: t.dailyCapPerUser,
      completedToday,
      dwellTimeSeconds: t.dwellTimeSeconds,
      instructions: t.instructions,
      expiresAt: t.expiresAt,
      isEligible: eligible,
      ineligibilityReason,
      hasActiveAssignment: !!activeAssignment,
      activeAssignment: activeAssignment
        ? {
            id: activeAssignment._id.toString(),
            clickId: activeAssignment.clickId,
            status: activeAssignment.status,
            assignedAt: activeAssignment.assignedAt,
            expiresAt: activeAssignment.expiresAt,
            dwellTimeAccumulatedSeconds: activeAssignment.dwellTimeAccumulatedSeconds || 0,
            remainingDwellSeconds: Math.max(0, t.dwellTimeSeconds - (activeAssignment.dwellTimeAccumulatedSeconds || 0)),
          }
        : null,
      appInstallConfig: t.appInstallConfig
        ? {
            appName: t.appInstallConfig.appName,
            packageName: t.appInstallConfig.packageName,
            platform: t.appInstallConfig.platform,
            storeUrl: t.appInstallConfig.storeUrl,
            attributionMethod: t.appInstallConfig.attributionMethod,
            conversionEvent: t.appInstallConfig.conversionEvent,
          }
        : undefined,
      videoWatchConfig: t.videoWatchConfig
        ? {
            videoUrl: t.videoWatchConfig.videoUrl,
            videoDurationSeconds: t.videoWatchConfig.videoDurationSeconds,
            requiredWatchSeconds: t.videoWatchConfig.requiredWatchSeconds,
            allowSeeking: t.videoWatchConfig.allowSeeking,
            completionPolicy: t.videoWatchConfig.completionPolicy || 'MINIMUM_DURATION',
            sessionTimeoutSeconds: t.videoWatchConfig.sessionTimeoutSeconds,
          }
        : undefined,
      articleReadConfig: t.articleReadConfig
        ? {
            articleTitle: t.articleReadConfig.articleTitle,
            articleContent: t.articleReadConfig.articleContent,
            sourceUrl: t.articleReadConfig.sourceUrl,
            minReadDurationSeconds: t.articleReadConfig.minReadDurationSeconds,
            minScrollPercentage: t.articleReadConfig.minScrollPercentage,
            comprehensionQuiz: t.articleReadConfig.comprehensionQuiz
              ? {
                  question: t.articleReadConfig.comprehensionQuiz.question,
                  options: t.articleReadConfig.comprehensionQuiz.options,
                  // STRICT SECURITY: correctOptionIndex is intentionally OMITTED for clients!
                }
              : undefined,
          }
        : undefined,
    });
  }

  res.status(200).json({
    success: true,
    data: {
      tasks: feed,
    },
  });
}

/**
 * POST /api/tasks/:id/start
 * Starts a task assignment and issues a secure clickId token.
 */
export async function startTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  // 1. Fetch task and parent campaign
  const task = await Task.findById(id);
  if (!task || task.status !== 'PUBLISHED') {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_AVAILABLE', message: 'Task is not currently available' },
    });
    return;
  }

  const campaign = await Campaign.findById(task.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_ACTIVE', message: 'Task campaign is not currently active' },
    });
    return;
  }

  const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';
  if (campaign.isSandbox && !isSandboxEnv) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_OUTSIDE_SANDBOX',
        message: 'Sandbox tasks cannot be started outside the adpayon_sandbox environment',
      },
    });
    return;
  }

  // 2. Global cap check
  if (task.completionsCount >= task.totalCap) {
    res.status(400).json({
      success: false,
      error: { code: 'CAP_EXHAUSTED', message: 'This task has reached its global completion cap' },
    });
    return;
  }

  // 2b. Task Expiration check
  if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_EXPIRED', message: 'This task has expired and is no longer available' },
    });
    return;
  }

  // 3. Prevent duplicate concurrent active assignments
  // Automatically transition any expired assignments to EXPIRED to release the unique partial index
  await TaskAssignment.updateMany(
    {
      taskId: task._id,
      userId: user._id,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
      expiresAt: { $lte: new Date() },
    },
    {
      $set: { status: 'EXPIRED' },
    }
  );

  const activeAssignment = await TaskAssignment.findOne({
    taskId: task._id,
    userId: user._id,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
    expiresAt: { $gt: new Date() },
  });

  if (activeAssignment) {
    const details = {
      assignmentId: activeAssignment._id.toString(),
      clickId: activeAssignment.clickId,
      status: activeAssignment.status,
      assignedAt: activeAssignment.assignedAt,
      expiresAt: activeAssignment.expiresAt,
      dwellTimeRequiredSeconds: task.dwellTimeSeconds,
      dwellTimeAccumulatedSeconds: activeAssignment.dwellTimeAccumulatedSeconds || 0,
      remainingDwellSeconds: Math.max(0, task.dwellTimeSeconds - (activeAssignment.dwellTimeAccumulatedSeconds || 0)),
    };

    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ACTIVE_ASSIGNMENT',
        message: 'You already have an active in-progress assignment for this task',
        details,
      },
      data: details,
    });
    return;
  }

  // 4. Daily cap per user check
  const startOfToday = getStartOfTodayUtc();
  const completedTodayCount = await TaskCompletion.countDocuments({
    taskId: task._id,
    userId: user._id,
    completedAt: { $gte: startOfToday },
  });

  if (completedTodayCount >= task.dailyCapPerUser) {
    res.status(400).json({
      success: false,
      error: {
        code: 'DAILY_CAP_REACHED',
        message: `You have reached your daily limit of ${task.dailyCapPerUser} completion(s) for this task`,
      },
    });
    return;
  }

  // 5. Targeting verification
  if (task.targeting?.kycRequired && user.metadata?.kycStatus !== 'VERIFIED') {
    res.status(403).json({
      success: false,
      error: { code: 'KYC_REQUIRED', message: 'This task requires completed KYC verification' },
    });
    return;
  }

  if (
    task.targeting?.minAncestryDepth &&
    task.targeting.minAncestryDepth > 0 &&
    (!user.ancestors || user.ancestors.length < task.targeting.minAncestryDepth)
  ) {
    res.status(403).json({
      success: false,
      error: { code: 'TARGETING_MISMATCH', message: 'User does not meet task upline requirements' },
    });
    return;
  }

  // 6. Generate cryptographically secure clickId
  const clickId = `clk_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 2 * 3600 * 1000); // 2 hours validity

  let assignment;
  try {
    assignment = await TaskAssignment.create({
      taskId: task._id,
      campaignId: campaign._id,
      userId: user._id,
      clickId,
      status: 'ASSIGNED',
      assignedAt: new Date(),
      expiresAt,
      dwellTimeAccumulatedSeconds: 0,
    });
  } catch (err: any) {
    if (err.code === 11000) {
      // Race condition guard: concurrent request created assignment
      const existing = await TaskAssignment.findOne({
        taskId: task._id,
        userId: user._id,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
        expiresAt: { $gt: new Date() },
      });
      if (existing) {
        const details = {
          assignmentId: existing._id.toString(),
          clickId: existing.clickId,
          status: existing.status,
          assignedAt: existing.assignedAt,
          expiresAt: existing.expiresAt,
          dwellTimeRequiredSeconds: task.dwellTimeSeconds,
          dwellTimeAccumulatedSeconds: existing.dwellTimeAccumulatedSeconds || 0,
          remainingDwellSeconds: Math.max(0, task.dwellTimeSeconds - (existing.dwellTimeAccumulatedSeconds || 0)),
        };
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_ACTIVE_ASSIGNMENT',
            message: 'You already have an active in-progress assignment for this task',
            details,
          },
          data: details,
        });
        return;
      }
    }
    throw err;
  }

  // Log lifecycle event
  await TaskEvent.create({
    assignmentId: assignment._id,
    taskId: task._id,
    userId: user._id,
    eventType: 'START',
    payload: { clickId, rewardPoints: task.rewardPoints },
    ipAddress: req.ip || '127.0.0.1',
    userAgent: req.headers['user-agent'],
  });

  // Format redirect URL if external template or storeUrl exists
  let actionUrl: string | undefined;
  if (task.externalActionUrl) {
    actionUrl = task.externalActionUrl
      .replace('{click_id}', clickId)
      .replace('{user_id}', user._id.toString());
  } else if (task.appInstallConfig?.storeUrl) {
    actionUrl = task.appInstallConfig.storeUrl
      .replace('{click_id}', clickId)
      .replace('{user_id}', user._id.toString());
  }

  res.status(201).json({
    success: true,
    data: {
      assignment: {
        id: assignment._id.toString(),
        taskId: task._id.toString(),
        title: task.title,
        category: task.category,
        verificationMethod: task.verificationMethod,
        clickId: assignment.clickId,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        dwellTimeRequiredSeconds: task.dwellTimeSeconds,
        dwellTimeAccumulatedSeconds: 0,
        remainingDwellSeconds: task.dwellTimeSeconds,
        actionUrl,
      },
    },
  });
}

/**
 * POST /api/tasks/:id/verify-action
 * First-party action verification (e.g. internal dwell time, video/reading completion).
 * Validates that elapsed server wall-clock time matches the required dwellTimeSeconds.
 */
export async function verifyFirstPartyAction(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task || task.status !== 'PUBLISHED') {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Task not found or no longer active' },
    });
    return;
  }

  const campaign = await Campaign.findById(task.campaignId);
  const isSandboxEnv = env.NODE_ENV === 'sandbox' && env.MONGODB_DB_NAME === 'adpayon_sandbox';
  if (campaign?.isSandbox && !isSandboxEnv) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_OUTSIDE_SANDBOX',
        message: 'Sandbox tasks cannot be verified outside the adpayon_sandbox environment',
      },
    });
    return;
  }

  if (task.verificationMethod !== 'FIRST_PARTY_ACTION') {
    res.status(400).json({
      success: false,
      error: {
        code: 'METHOD_NOT_SUPPORTED',
        message: 'This task requires external partner webhook or manual verification',
      },
    });
    return;
  }

  // Phase 10.2: Fail closed for newly added categories that require dedicated verification engines
  if (task.category === 'APP_INSTALL') {
    res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_TASK_CATEGORY',
        message: 'App install tasks cannot be verified via generic first-party actions. Verified partner postback or manual review is required.',
      },
    });
    return;
  }

  if (task.category === 'VIDEO_WATCH') {
    res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_TASK_CATEGORY',
        message: 'Video watch tasks require a dedicated video playback verification session and cannot be completed via generic telemetry.',
      },
    });
    return;
  }

  if (task.category === 'ARTICLE_READ') {
    res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_TASK_CATEGORY',
        message: 'Article read tasks require a dedicated article reader verification session and cannot be completed via generic telemetry.',
      },
    });
    return;
  }

  // Find assignment: if caller specifies assignmentId (e.g. idempotent retry after network timeout),
  // locate that exact assignment. Otherwise, find the user's active in-progress assignment.
  const rawAssignmentId = req.body?.assignmentId || (req.headers['x-assignment-id'] as string | undefined);
  const requestedAssignmentId =
    typeof rawAssignmentId === 'string' && rawAssignmentId.trim().length > 0
      ? rawAssignmentId.trim()
      : undefined;

  let assignment;

  if (requestedAssignmentId) {
    if (!Types.ObjectId.isValid(requestedAssignmentId)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid assignment ID format' },
      });
      return;
    }

    const specificAssignment = await TaskAssignment.findOne({
      _id: new Types.ObjectId(requestedAssignmentId),
      taskId: task._id,
      userId: user._id,
    });

    if (!specificAssignment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NO_ACTIVE_ASSIGNMENT',
          message: 'No active task assignment found. Please start the task first.',
        },
      });
      return;
    }

    if (specificAssignment.status === 'COMPLETED') {
      // Idempotent reconciliation path for a specific known assignment retry
      const existingCompletion = await TaskCompletion.findOne({
        taskId: task._id,
        userId: user._id,
        assignmentId: specificAssignment._id,
      });

      if (existingCompletion) {
        res.status(200).json({
          success: true,
          data: {
            completion: {
              id: existingCompletion._id.toString(),
              taskId: task._id.toString(),
              clickId: specificAssignment.clickId,
              rewardPoints: existingCompletion.rewardPoints,
              status: existingCompletion.status,
              completedAt: existingCompletion.completedAt,
            },
            reconciled: true,
          },
        });
        return;
      }
    }

    assignment = specificAssignment;
  } else {
    assignment = await TaskAssignment.findOne({
      taskId: task._id,
      userId: user._id,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'] },
    });
  }

  if (!assignment) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NO_ACTIVE_ASSIGNMENT',
        message: 'No active task assignment found. Please start the task first.',
      },
    });
    return;
  }

  // Check assignment expiry
  if (assignment.status === 'EXPIRED' || (assignment.expiresAt && assignment.expiresAt <= new Date())) {
    if (assignment.status !== 'EXPIRED') {
      assignment.status = 'EXPIRED';
      await assignment.save();
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'ASSIGNMENT_EXPIRED',
        message: 'Task assignment has expired. Please restart the task.',
      },
    });
    return;
  }

  // Server-side engagement verification
  let totalActiveSeconds = 0;
  let validationEvidencePayload: Record<string, unknown> = {};

  if (req.body && req.body.intervals) {
    const val = validateEngagementIntervals(req.body.intervals, assignment.assignedAt, new Date());
    if (!val.valid) {
      res.status(400).json({
        success: false,
        error: { code: val.errorCode, message: val.errorMessage },
      });
      return;
    }
    totalActiveSeconds = val.totalActiveSeconds;
    validationEvidencePayload = {
      verifiedIntervalsCount: req.body.intervals.length,
      totalActiveSeconds,
      method: 'FOREGROUND_INTERVALS',
    };
  } else {
    // Fallback: If caller did not provide intervals array, check accumulated active seconds or elapsed wall-clock
    const wallClockElapsed = Math.floor((Date.now() - assignment.assignedAt.getTime()) / 1000);
    totalActiveSeconds = Math.max(assignment.dwellTimeAccumulatedSeconds || 0, wallClockElapsed);
    validationEvidencePayload = {
      wallClockElapsed,
      accumulatedActiveSeconds: assignment.dwellTimeAccumulatedSeconds || 0,
      totalActiveSeconds,
      method: 'WALL_CLOCK_HEARTBEAT_FALLBACK',
    };
  }

  if (task.dwellTimeSeconds > 0 && totalActiveSeconds < task.dwellTimeSeconds) {
    // Audit failed premature attempt
    await TaskEvent.create({
      assignmentId: assignment._id,
      taskId: task._id,
      userId: user._id,
      eventType: 'VERIFY_FAIL',
      payload: { totalActiveSeconds, requiredSeconds: task.dwellTimeSeconds },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_DWELL_TIME',
        message: `Task requirement not met: Required ${task.dwellTimeSeconds}s active engagement, accumulated ${totalActiveSeconds}s`,
      },
    });
    return;
  }

  const runTransaction = async (queueMetrics?: { queueWaitMs: number; queueDepth: number }) => {
    // Start atomic multi-document transaction session to guarantee ACID reward consistency
    // STRICT RULE: Session is allocated strictly INSIDE runTransaction, NEVER while waiting in the queue!
    const session = await mongoose.startSession();
    const txStartTime = performance.now();
    let attemptCount = 0;
    let cumulativeFailedAttemptsMs = 0;
    let finalAttemptDurationMs = 0;
    let stepMetrics: TransactionStepMetrics = {
      claimAssignmentMs: 0,
      reserveCapMs: 0,
      insertEvidenceMs: 0,
      insertCompletionMs: 0,
      insertEventMs: 0,
      totalCallbackMs: 0,
    };
    const isDiagnosticsActive = TransactionDiagnosticsTracker.isRequestAuthorized(req);
    const isCandidateOrdering =
      isDiagnosticsActive &&
      (req.headers['x-candidate-tx-ordering'] === 'true' || process.env.TEST_CANDIDATE_TX_ORDERING === 'true');

    try {
      let resultPayload: any = null;

      await session.withTransaction(async () => {
      attemptCount++;
      const attemptStart = performance.now();

      try {
        let claimAssignmentMs = 0;
        let reserveCapMs = 0;
        let insertEvidenceMs = 0;
        let insertCompletionMs = 0;
        let insertEventMs = 0;

        // Statement 1: Atomically claim assignment within transaction to guarantee mutual exclusion
        const executeClaimAssignment = async () => {
          const t0 = performance.now();
          const updated = await TaskAssignment.findOneAndUpdate(
            {
              _id: assignment._id,
              status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
            },
            {
              $set: {
                status: 'COMPLETED',
                completedAt: new Date(),
                dwellTimeAccumulatedSeconds: totalActiveSeconds,
              },
            },
            { session, returnDocument: 'after' }
          );

          if (!updated) {
            throw new TaskVerificationError(
              404,
              'NO_ACTIVE_ASSIGNMENT',
              'No active task assignment found or already completed'
            );
          }
          claimAssignmentMs = performance.now() - t0;
          return updated;
        };

        // Shared Task counter and status update
        const executeReserveCap = async () => {
          if (testTxBarrier && isDiagnosticsActive) {
            await testTxBarrier();
          }
          const t1 = performance.now();
          const updatedTask = await Task.findOneAndUpdate(
            {
              _id: task._id,
              status: 'PUBLISHED',
              $expr: { $lt: ['$completionsCount', '$totalCap'] },
            },
            { $inc: { completionsCount: 1 } },
            { session, returnDocument: 'after' }
          );

          if (!updatedTask) {
            const freshTask = await Task.findById(task._id).session(session);
            if (!freshTask || freshTask.status !== 'PUBLISHED') {
              throw new TaskVerificationError(
                400,
                'TASK_NOT_PUBLISHED',
                'Task is no longer published or has been paused'
              );
            } else {
              throw new TaskVerificationError(
                400,
                'CAP_EXHAUSTED',
                'This task has reached its global completion cap. Reward cannot be claimed.'
              );
            }
          }
          reserveCapMs = performance.now() - t1;
          return updatedTask;
        };

        // Evidence document insertion
        const executeInsertEvidence = async (updatedAssign: any) => {
          const t2 = performance.now();
          const evidenceDocs = await VerificationEvidence.create(
            [
              {
                assignmentId: updatedAssign._id,
                taskId: task._id,
                userId: user._id,
                evidenceType: 'FIRST_PARTY_TELEMETRY',
                signatureVerified: true,
                rawPayload: {
                  ...validationEvidencePayload,
                  dwellTimeSeconds: task.dwellTimeSeconds,
                },
                ipAddress: req.ip || '127.0.0.1',
                evaluatedAt: new Date(),
              },
            ],
            { session }
          );
          insertEvidenceMs = performance.now() - t2;
          return evidenceDocs[0];
        };

        // Completion document insertion
        const executeInsertCompletion = async (updatedAssign: any, ev: any) => {
          const t3 = performance.now();
          const completionDocs = await TaskCompletion.create(
            [
              {
                taskId: task._id,
                campaignId: task.campaignId,
                userId: user._id,
                assignmentId: updatedAssign._id,
                clickId: updatedAssign.clickId,
                rewardPoints: task.rewardPoints,
                status: 'VERIFIED',
                verificationMethod: 'FIRST_PARTY_ACTION',
                evidenceId: ev._id,
                completedAt: new Date(),
              },
            ],
            { session }
          );
          insertCompletionMs = performance.now() - t3;
          return completionDocs[0];
        };

        // Event log insertion
        const executeInsertEvent = async (updatedAssign: any, comp: any) => {
          const t4 = performance.now();
          await TaskEvent.create(
            [
              {
                assignmentId: updatedAssign._id,
                taskId: task._id,
                userId: user._id,
                eventType: 'VERIFY_SUCCESS',
                payload: { completionId: comp._id.toString(), rewardPoints: task.rewardPoints },
                ipAddress: req.ip || '127.0.0.1',
              },
            ],
            { session }
          );
          insertEventMs = performance.now() - t4;
        };

        const updatedAssignment = await executeClaimAssignment();

        if (!isCandidateOrdering) {
          // Current default ordering:
          // 1. Assignment -> 2. Reserve Cap -> 3. Evidence -> 4. Completion -> 5. Event
          await executeReserveCap();
          const evidence = await executeInsertEvidence(updatedAssignment);
          const completion = await executeInsertCompletion(updatedAssignment, evidence);
          await executeInsertEvent(updatedAssignment, completion);

          resultPayload = {
            completion: {
              id: completion._id.toString(),
              taskId: task._id.toString(),
              clickId: updatedAssignment.clickId,
              rewardPoints: completion.rewardPoints,
              status: completion.status,
              completedAt: completion.completedAt,
            },
          };
        } else {
          // Candidate ordering (Phase 8D.10 test-only evaluation):
          // 1. Assignment -> 2. Evidence -> 3. Completion -> 4. Event -> 5. Reserve Cap
          const evidence = await executeInsertEvidence(updatedAssignment);
          const completion = await executeInsertCompletion(updatedAssignment, evidence);
          await executeInsertEvent(updatedAssignment, completion);
          await executeReserveCap();

          resultPayload = {
            completion: {
              id: completion._id.toString(),
              taskId: task._id.toString(),
              clickId: updatedAssignment.clickId,
              rewardPoints: completion.rewardPoints,
              status: completion.status,
              completedAt: completion.completedAt,
            },
          };
        }

        if (isDiagnosticsActive) {
          finalAttemptDurationMs = performance.now() - attemptStart;
          stepMetrics = {
            claimAssignmentMs: Number(claimAssignmentMs.toFixed(2)),
            reserveCapMs: Number(reserveCapMs.toFixed(2)),
            insertEvidenceMs: Number(insertEvidenceMs.toFixed(2)),
            insertCompletionMs: Number(insertCompletionMs.toFixed(2)),
            insertEventMs: Number(insertEventMs.toFixed(2)),
            totalCallbackMs: Number(finalAttemptDurationMs.toFixed(2)),
          };
        }
      } catch (attemptErr) {
        if (isDiagnosticsActive) {
          cumulativeFailedAttemptsMs += performance.now() - attemptStart;
        }
        throw attemptErr;
      }
    });

    // Total transaction time encompasses full multi-document execution and commit acknowledgment
    const totalTxDurationMs = performance.now() - txStartTime;
    const remainingOverheadMs = Math.max(
      0,
      totalTxDurationMs - cumulativeFailedAttemptsMs - finalAttemptDurationMs
    );

    let diagMetrics: VerificationDiagnostic | null = null;
    if (isDiagnosticsActive) {
      diagMetrics = {
        attemptCount,
        retries: attemptCount - 1,
        totalTxMs: Number(totalTxDurationMs.toFixed(2)),
        cumulativeFailedAttemptsMs: Number(cumulativeFailedAttemptsMs.toFixed(2)),
        finalAttemptDurationMs: Number(finalAttemptDurationMs.toFixed(2)),
        remainingOverheadMs: Number(remainingOverheadMs.toFixed(2)),
        commitDurationMs: Number(remainingOverheadMs.toFixed(2)),
        steps: stepMetrics,
        hasTransientError: attemptCount > 1,
        ordering: isCandidateOrdering ? 'CANDIDATE' : 'CURRENT',
        ...(queueMetrics ? { queueWaitMs: queueMetrics.queueWaitMs, queueDepth: queueMetrics.queueDepth } : {}),
      };
    }

    res.status(200).json({
      success: true,
      data: resultPayload,
      ...(isDiagnosticsActive && diagMetrics ? { _diagnostics: diagMetrics } : {}),
    });
  } finally {
    await session.endSession();
  }
};

  // Safe Feature Flag: default OFF in all environments; requires explicit server env configuration
  const isQueueEnabled = process.env.TASK_VERIFICATION_QUEUE_ENABLED === 'true';

  try {
    if (isQueueEnabled) {
      await taskVerificationMutex.run(task._id.toString(), async (queueMetrics) => {
        await runTransaction(queueMetrics);
      });
    } else {
      await runTransaction();
    }
  } catch (err: any) {
    if (err instanceof QueueOverloadError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }

    if (err instanceof TaskVerificationError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSACTION_FAILED',
        message: err.message || 'Failed to complete transaction',
      },
    });
  }
}

/**
 * POST /api/tasks/:id/heartbeat
 * Records live active foreground engagement heartbeats.
 * Bounded by assignment time, rate-limiting, and monotonic duration.
 */
export async function recordTaskHeartbeat(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const assignment = await TaskAssignment.findOne({
    taskId: new Types.ObjectId(id),
    userId: user._id,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'] },
  });

  if (!assignment) {
    res.status(404).json({
      success: false,
      error: { code: 'NO_ACTIVE_ASSIGNMENT', message: 'No active task assignment found' },
    });
    return;
  }

  // Check assignment expiry
  if (assignment.status === 'EXPIRED' || (assignment.expiresAt && assignment.expiresAt <= new Date())) {
    if (assignment.status !== 'EXPIRED') {
      assignment.status = 'EXPIRED';
      await assignment.save();
    }
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_EXPIRED', message: 'Task assignment has expired' },
    });
    return;
  }

  const now = new Date();
  // Rate limiting on heartbeats: Prevent excessive frequency (< 500ms between calls)
  if (assignment.lastHeartbeatAt && now.getTime() - assignment.lastHeartbeatAt.getTime() < 500) {
    res.status(429).json({
      success: false,
      error: { code: 'HEARTBEAT_RATE_LIMITED', message: 'Heartbeat sent too frequently. Minimum interval is 500ms.' },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task || task.status !== 'PUBLISHED') {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Task not found or not published' },
    });
    return;
  }

  let newAccumulatedSeconds = assignment.dwellTimeAccumulatedSeconds || 0;

  if (req.body && req.body.intervals) {
    const val = validateEngagementIntervals(req.body.intervals, assignment.assignedAt, now);
    if (!val.valid) {
      res.status(400).json({
        success: false,
        error: { code: val.errorCode, message: val.errorMessage },
      });
      return;
    }
    newAccumulatedSeconds = Math.max(newAccumulatedSeconds, val.totalActiveSeconds);
  } else if (typeof req.body?.activeDurationSeconds === 'number') {
    const clientSeconds = Math.floor(req.body.activeDurationSeconds);
    const maxElapsed = Math.floor((now.getTime() - assignment.assignedAt.getTime() + 5000) / 1000);
    if (clientSeconds < 0 || clientSeconds > maxElapsed) {
      res.status(400).json({
        success: false,
        error: { code: 'TAMPERED_TIMESTAMP', message: 'Invalid active duration exceeds elapsed time' },
      });
      return;
    }
    newAccumulatedSeconds = Math.max(newAccumulatedSeconds, clientSeconds);
  }

  assignment.dwellTimeAccumulatedSeconds = newAccumulatedSeconds;
  assignment.lastHeartbeatAt = now;
  assignment.status = 'IN_PROGRESS';
  await assignment.save();

  const remainingSeconds = Math.max(0, task.dwellTimeSeconds - newAccumulatedSeconds);

  res.status(200).json({
    success: true,
    data: {
      dwellTimeAccumulatedSeconds: newAccumulatedSeconds,
      remainingDwellSeconds: remainingSeconds,
      dwellTimeRequiredSeconds: task.dwellTimeSeconds,
    },
  });
}

/**
 * GET /api/tasks/history
 * Returns paginated task assignment and completion history for the user,
 * along with authoritative aggregate summary (total completions and total promotional reward points).
 */
export async function getTaskHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
  const skip = (page - 1) * limit;

  const [completions, total, pointsAgg] = await Promise.all([
    TaskCompletion.find({ userId: user._id })
      .populate('taskId', 'title category rewardPoints')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TaskCompletion.countDocuments({ userId: user._id }),
    TaskCompletion.aggregate([
      { $match: { userId: user._id, status: 'VERIFIED' } },
      { $group: { _id: null, totalRewardPoints: { $sum: '$rewardPoints' } } },
    ]),
  ]);

  const totalRewardPoints = pointsAgg[0]?.totalRewardPoints || 0;

  res.status(200).json({
    success: true,
    data: {
      completions: completions.map((c) => ({
        id: c._id.toString(),
        task: c.taskId
          ? {
              id: (c.taskId as any)._id?.toString(),
              title: (c.taskId as any).title,
              category: (c.taskId as any).category,
            }
          : null,
        rewardPoints: c.rewardPoints,
        status: c.status,
        verificationMethod: c.verificationMethod,
        completedAt: c.completedAt,
      })),
      summary: {
        totalCompleted: total,
        totalRewardPoints,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
}

/**
 * GET /api/tasks/summary
 * Returns authoritative aggregate summary of user's task completions and promotional points.
 */
export async function getTaskSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const [totalCompleted, pointsAgg] = await Promise.all([
    TaskCompletion.countDocuments({ userId: user._id }),
    TaskCompletion.aggregate([
      { $match: { userId: user._id, status: 'VERIFIED' } },
      { $group: { _id: null, totalRewardPoints: { $sum: '$rewardPoints' } } },
    ]),
  ]);

  const totalRewardPoints = pointsAgg[0]?.totalRewardPoints || 0;

  res.status(200).json({
    success: true,
    data: {
      totalCompleted,
      totalRewardPoints,
    },
  });
}

/**
 * GET /api/tasks/:id/status
 * Returns current status of user's assignment on a specific task.
 */
export async function getTaskStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const assignment = await TaskAssignment.findOne({
    taskId: new Types.ObjectId(id),
    userId: user._id,
  }).sort({ createdAt: -1 });

  if (!assignment) {
    const task = await Task.findById(id).populate('campaignId', 'name');
    res.status(200).json({
      success: true,
      data: {
        hasAssignment: false,
        status: 'NONE',
        task: task
          ? {
              id: task._id.toString(),
              title: task.title,
              description: task.description,
              category: task.category,
              rewardPoints: task.rewardPoints,
              status: task.status,
              verificationMethod: task.verificationMethod,
              appInstallConfig: task.appInstallConfig,
              campaignName: (task.campaignId as any)?.name || 'Partner Advertiser',
            }
          : undefined,
      },
    });
    return;
  }

  const isExpired =
    ['ASSIGNED', 'IN_PROGRESS'].includes(assignment.status) &&
    assignment.expiresAt <= new Date();

  if (isExpired && assignment.status !== 'EXPIRED') {
    assignment.status = 'EXPIRED';
    await assignment.save();
  }

  const currentStatus = isExpired ? 'EXPIRED' : assignment.status;
  const task = await Task.findById(assignment.taskId).populate('campaignId', 'name');
  const dwellTimeRequiredSeconds = task?.dwellTimeSeconds || 0;
  const dwellTimeAccumulatedSeconds = assignment.dwellTimeAccumulatedSeconds || 0;
  const remainingDwellSeconds = Math.max(0, dwellTimeRequiredSeconds - dwellTimeAccumulatedSeconds);

  res.status(200).json({
    success: true,
    data: {
      hasAssignment: true,
      status: currentStatus,
      task: task
        ? {
            id: task._id.toString(),
            title: task.title,
            description: task.description,
            category: task.category,
            rewardPoints: task.rewardPoints,
            status: task.status,
            verificationMethod: task.verificationMethod,
            appInstallConfig: task.appInstallConfig,
            campaignName: (task.campaignId as any)?.name || 'Partner Advertiser',
          }
        : undefined,
      assignment: {
        id: assignment._id.toString(),
        clickId: assignment.clickId,
        status: currentStatus,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        completedAt: assignment.completedAt,
        dwellTimeRequiredSeconds,
        dwellTimeAccumulatedSeconds,
        remainingDwellSeconds,
        isExpired,
        hasOpenedStore: Boolean((assignment as any).hasOpenedStore),
        storeVisitedAt: (assignment as any).storeVisitedAt,
      },
    },
  });
}

/**
 * POST /api/tasks/:id/store-visit
 * Authoritative server tracking of user visiting official store listing.
 * Strictly tracking information only - NEVER reward verification evidence.
 */
export async function recordStoreVisit(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  // Find active assignment for this task and user
  const assignment = await TaskAssignment.findOne({
    taskId: new Types.ObjectId(id),
    userId: user._id,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
    expiresAt: { $gt: new Date() },
  });

  if (!assignment) {
    res.status(404).json({
      success: false,
      error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'No active assignment found to record store visit' },
    });
    return;
  }

  const visitedAt = new Date();
  assignment.hasOpenedStore = true;
  assignment.storeVisitedAt = visitedAt;
  if (assignment.status === 'ASSIGNED') {
    assignment.status = 'IN_PROGRESS';
  }
  await assignment.save();

  // Log immutable tracking event (strictly tracking only, never completion/reward)
  await TaskEvent.create({
    assignmentId: assignment._id,
    taskId: assignment.taskId,
    userId: user._id,
    eventType: 'STORE_VISIT',
    payload: {
      clickId: assignment.clickId,
      platform: 'ANDROID',
      store: 'GOOGLE_PLAY',
      action: 'USER_OPENED_STORE',
      note: 'Authoritative store visit tracking - not reward verification evidence',
    },
    ipAddress: req.ip || '127.0.0.1',
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({
    success: true,
    message: 'Store visit recorded for assignment tracking',
    data: {
      assignmentId: assignment._id.toString(),
      hasOpenedStore: true,
      storeVisitedAt: visitedAt,
    },
  });
}

/**
 * POST /api/tasks/:id/app-feedback/submit
 * Submits genuine user testing feedback for an App Testing & Feedback task.
 * Awards promotional points server-side exactly once.
 * Never requests invasive device permissions, screenshot harvesting, or package manager scans.
 */
export async function submitAppFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { feedback, rating, answer } = req.body;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  if (!feedback || typeof feedback !== 'string' || feedback.trim().length < 3) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FEEDBACK',
        message: 'Please provide helpful feedback about your app testing experience (at least 3 characters).',
      },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task || task.status !== 'PUBLISHED') {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Task is not currently available or paused' },
    });
    return;
  }

  if (task.category !== 'APP_INSTALL') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CATEGORY',
        message: 'This endpoint is for app feedback tasks',
      },
    });
    return;
  }

  if (task.completionsCount >= task.totalCap) {
    res.status(400).json({
      success: false,
      error: { code: 'CAP_EXHAUSTED', message: 'This task has reached its global completion cap' },
    });
    return;
  }

  if (task.expiresAt && task.expiresAt <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_EXPIRED', message: 'This task has expired' },
    });
    return;
  }

  const mutexKey = `${task._id.toString()}:${user._id.toString()}`;
  try {
    await taskVerificationMutex.run(task._id.toString(), async () => {
      // Re-check duplicate inside mutex
      const existingCompletion = await TaskCompletion.findOne({
        taskId: task._id,
        userId: user._id,
      });

      if (existingCompletion) {
        res.status(400).json({
          success: false,
          error: { code: 'TASK_ALREADY_COMPLETED', message: 'You have already completed this app testing task' },
        });
        return;
      }

      // Find or create assignment
      let assignment = await TaskAssignment.findOne({
        taskId: task._id,
        userId: user._id,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
        expiresAt: { $gt: new Date() },
      });

      if (!assignment) {
        assignment = await TaskAssignment.create({
          taskId: task._id,
          campaignId: task.campaignId,
          userId: user._id,
          clickId: `clk_${crypto.randomBytes(16).toString('hex')}`,
          status: 'IN_PROGRESS',
          assignedAt: new Date(),
          expiresAt: new Date(Date.now() + 7200 * 1000),
          dwellTimeAccumulatedSeconds: 0,
          hasOpenedStore: true,
          storeVisitedAt: new Date(),
        });
      }

      const dbSession = await mongoose.startSession();
      try {
        let completionResult: any = null;
        await dbSession.withTransaction(async () => {
          // 1. Mark assignment completed
          const updatedAssignment = await TaskAssignment.findOneAndUpdate(
            { _id: assignment._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
            { $set: { status: 'COMPLETED', completedAt: new Date(), hasOpenedStore: true } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedAssignment) {
            throw new TaskVerificationError(400, 'ASSIGNMENT_STATE_INVALID', 'Assignment already completed or invalid');
          }

          // 2. Reserve cap atomically
          const updatedTask = await Task.findOneAndUpdate(
            { _id: task._id, status: 'PUBLISHED', $expr: { $lt: ['$completionsCount', '$totalCap'] } },
            { $inc: { completionsCount: 1 } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedTask) {
            throw new TaskVerificationError(400, 'CAP_EXHAUSTED', 'Global completion cap exhausted');
          }

          // 3. Create verification evidence
          const evidenceDocs = await VerificationEvidence.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: user._id,
                evidenceType: 'FIRST_PARTY_TELEMETRY',
                signatureVerified: true,
                rawPayload: {
                  feedback: feedback.trim(),
                  rating: typeof rating === 'number' ? rating : 5,
                  answer: typeof answer === 'string' ? answer.trim() : undefined,
                  submittedAt: new Date().toISOString(),
                },
                evaluatedAt: new Date(),
              },
            ],
            { session: dbSession }
          );

          // 4. Create task completion
          const completionDocs = await TaskCompletion.create(
            [
              {
                taskId: task._id,
                campaignId: task.campaignId,
                userId: user._id,
                assignmentId: updatedAssignment._id,
                clickId: updatedAssignment.clickId,
                rewardPoints: task.rewardPoints,
                verificationMethod: 'FIRST_PARTY_ACTION',
                status: 'VERIFIED',
                completedAt: new Date(),
                evidenceId: evidenceDocs[0]._id,
              },
            ],
            { session: dbSession }
          );

          // 5. Create immutable task event
          await TaskEvent.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: user._id,
                eventType: 'VERIFY_SUCCESS',
                payload: {
                  action: 'APP_FEEDBACK_SUBMITTED',
                  rewardPoints: task.rewardPoints,
                  completionId: completionDocs[0]._id.toString(),
                },
                ipAddress: req.ip || '127.0.0.1',
              },
            ],
            { session: dbSession }
          );

          completionResult = completionDocs[0];
        });

        res.status(200).json({
          success: true,
          data: {
            status: 'VERIFIED',
            rewardPoints: task.rewardPoints,
            completionId: completionResult._id.toString(),
            message: `Thank you for your feedback! +${task.rewardPoints} promotional points credited to your balance.`,
          },
        });
      } finally {
        await dbSession.endSession();
      }
    });
  } catch (err: any) {
    if (err instanceof TaskVerificationError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    if (err instanceof QueueOverloadError) {
      res.status(429).json({
        success: false,
        error: { code: 'QUEUE_OVERLOAD', message: 'Too many concurrent requests. Please try again shortly.' },
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Feedback submission failed' },
    });
  }
}

