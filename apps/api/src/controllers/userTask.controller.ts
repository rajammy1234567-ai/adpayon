import { Response } from 'express';
import crypto from 'node:crypto';
import { Types } from 'mongoose';
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

  // Format redirect URL if external template exists
  let actionUrl: string | undefined;
  if (task.externalActionUrl) {
    actionUrl = task.externalActionUrl
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

  // Find assignment
  const assignment = await TaskAssignment.findOne({
    taskId: task._id,
    userId: user._id,
    status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'EXPIRED'] },
  });

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

  // Atomically claim completion on the assignment to guarantee mutual exclusion under concurrent requests
  const updatedAssignment = await TaskAssignment.findOneAndUpdate(
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
    { returnDocument: 'after' }
  );

  if (!updatedAssignment) {
    res.status(404).json({
      success: false,
      error: { code: 'NO_ACTIVE_ASSIGNMENT', message: 'No active task assignment found or already completed' },
    });
    return;
  }

  // Record verification evidence
  const evidence = await VerificationEvidence.create({
    assignmentId: updatedAssignment._id,
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
  });

  // Idempotently create completion record
  const completion = await TaskCompletion.create({
    taskId: task._id,
    campaignId: task.campaignId,
    userId: user._id,
    assignmentId: updatedAssignment._id,
    clickId: updatedAssignment.clickId,
    rewardPoints: task.rewardPoints,
    status: 'VERIFIED',
    verificationMethod: 'FIRST_PARTY_ACTION',
    evidenceId: evidence._id,
    completedAt: new Date(),
  });

  await Task.updateOne({ _id: task._id }, { $inc: { completionsCount: 1 } });

  // Record audit event
  await TaskEvent.create({
    assignmentId: updatedAssignment._id,
    taskId: task._id,
    userId: user._id,
    eventType: 'VERIFY_SUCCESS',
    payload: { completionId: completion._id.toString(), rewardPoints: task.rewardPoints },
    ipAddress: req.ip || '127.0.0.1',
  });

  res.status(200).json({
    success: true,
    data: {
      completion: {
        id: completion._id.toString(),
        taskId: task._id.toString(),
        clickId: assignment.clickId,
        rewardPoints: completion.rewardPoints,
        status: completion.status,
        completedAt: completion.completedAt,
      },
    },
  });
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
 * Returns paginated task assignment and completion history for the user.
 */
export async function getTaskHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
  const skip = (page - 1) * limit;

  const [completions, total] = await Promise.all([
    TaskCompletion.find({ userId: user._id })
      .populate('taskId', 'title category rewardPoints')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TaskCompletion.countDocuments({ userId: user._id }),
  ]);

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
    res.status(200).json({
      success: true,
      data: {
        hasAssignment: false,
        status: 'NONE',
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
  const task = await Task.findById(assignment.taskId);
  const dwellTimeRequiredSeconds = task?.dwellTimeSeconds || 0;
  const dwellTimeAccumulatedSeconds = assignment.dwellTimeAccumulatedSeconds || 0;
  const remainingDwellSeconds = Math.max(0, dwellTimeRequiredSeconds - dwellTimeAccumulatedSeconds);

  res.status(200).json({
    success: true,
    data: {
      hasAssignment: true,
      status: currentStatus,
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
      },
    },
  });
}
