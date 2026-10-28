import { Response } from 'express';
import crypto from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  Campaign,
  Task,
  TaskAssignment,
  TaskCompletion,
  TaskEvent,
  VerificationEvidence,
  WalletLedgerEntry,
  ExternalLinkSession,
} from '../models';
import { taskVerificationMutex, QueueOverloadError } from '../utils/keyedMutex';
import { TaskVerificationError } from './userTask.controller';

function getStartOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Helper to extract target URL and required duration from any task category
 */
function resolveTaskLinkAndDuration(task: any): { targetUrl: string; requiredDurationSeconds: number } {
  let targetUrl = '';
  let requiredDurationSeconds = task.dwellTimeSeconds || 30;

  if (task.category === 'YOUTUBE_LEARNING' && task.youtubeLearningConfig) {
    targetUrl = task.youtubeLearningConfig.youtubeUrl || '';
    requiredDurationSeconds =
      task.youtubeLearningConfig.requiredDurationSeconds ||
      task.youtubeLearningConfig.sessionDurationSeconds ||
      requiredDurationSeconds;
  } else if (task.category === 'ARTICLE_READ' && task.articleReadConfig) {
    targetUrl = task.articleReadConfig.sourceUrl || task.linkUrl || '';
    requiredDurationSeconds = task.articleReadConfig.minReadDurationSeconds || requiredDurationSeconds;
  } else if (task.linkUrl) {
    targetUrl = task.linkUrl;
  } else if (task.targetUrl) {
    targetUrl = task.targetUrl;
  }

  // Ensure minimum positive duration
  if (requiredDurationSeconds < 1) {
    requiredDurationSeconds = 1;
  }

  return { targetUrl, requiredDurationSeconds };
}

/**
 * POST /api/tasks/:id/external-link/start
 * Initiates or resumes a server-authoritative external link elapsed-time session.
 * Preserves initial startedAt timestamp across repeated starts and app restarts.
 */
export async function startExternalLinkSession(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      error: { code: 'TASK_NOT_AVAILABLE', message: 'Task is not currently available or paused' },
    });
    return;
  }

  const campaign = await Campaign.findById(task.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_ACTIVE', message: 'Parent campaign is not currently active' },
    });
    return;
  }

  // Check expiration
  if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_EXPIRED', message: 'This task has expired and is no longer available' },
    });
    return;
  }

  // Check global cap
  if (task.completionsCount >= task.totalCap) {
    res.status(400).json({
      success: false,
      error: { code: 'CAP_EXHAUSTED', message: 'This task has reached its global completion cap' },
    });
    return;
  }

  const { targetUrl, requiredDurationSeconds } = resolveTaskLinkAndDuration(task);
  if (!targetUrl) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_LINK_URL', message: 'Task does not configure a valid external link URL' },
    });
    return;
  }

  // Check if already completed
  const existingCompletion = await TaskCompletion.findOne({
    taskId: task._id,
    userId: user._id,
    status: 'VERIFIED',
  });
  if (existingCompletion) {
    res.status(200).json({
      success: true,
      data: {
        sessionId: `comp_${existingCompletion._id.toString()}`,
        taskId: task._id.toString(),
        targetUrl,
        category: task.category,
        requiredDurationSeconds,
        status: 'COMPLETED',
        isCompleted: true,
        rewardGranted: true,
        isDurationMet: true,
        elapsedSeconds: requiredDurationSeconds,
        remainingSeconds: 0,
        completedAt: existingCompletion.completedAt,
        rewardPoints: existingCompletion.rewardPoints,
        completionId: existingCompletion._id.toString(),
      },
    });
    return;
  }

  // Check daily user cap
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

  // Check targeted users
  if (task.targeting?.assignedUserIds && task.targeting.assignedUserIds.length > 0) {
    const isAssigned = task.targeting.assignedUserIds.some(
      (uid: any) => uid.toString() === user._id.toString()
    );
    if (!isAssigned) {
      res.status(403).json({
        success: false,
        error: { code: 'NOT_ASSIGNED', message: 'This task is assigned to specific users' },
      });
      return;
    }
  }

  try {
    await taskVerificationMutex.run(`${user._id.toString()}:${id}`, async () => {
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
          expiresAt: new Date(Date.now() + 7200 * 1000), // 2 hour validity
          dwellTimeAccumulatedSeconds: 0,
        });
      }

      // Look for existing ACTIVE external link session for (userId, taskId)
      let session = await ExternalLinkSession.findOne({
        taskId: task._id,
        userId: user._id,
        assignmentId: assignment._id,
        status: 'ACTIVE',
        expiresAt: { $gt: new Date() },
      });

      const now = new Date();

      if (session) {
        // Single uninterrupted attempt model:
        // If an attempt was left dangling across crash/restart without completing, reset it conservatively
        if (session.isAway) {
          session.isAway = false;
          session.activeIntervalStartedAt = undefined;
          session.attemptStartedAt = undefined;
          session.attemptStatus = 'RETURNED_EARLY';
          session.eligible = false;
          session.accumulatedAwaySeconds = 0;
          await session.save();
        }

        const isMet = Boolean(session.eligible);
        const elapsedSeconds = isMet ? session.requiredDurationSeconds : 0;
        const remainingSeconds = isMet ? 0 : session.requiredDurationSeconds;

        res.status(200).json({
          success: true,
          data: {
            sessionId: session.sessionId,
            attemptId: session.currentAttemptId,
            taskId: task._id.toString(),
            assignmentId: assignment._id.toString(),
            targetUrl: session.targetUrl,
            category: session.category,
            requiredDurationSeconds: session.requiredDurationSeconds,
            startedAt: session.startedAt,
            linkLaunched: session.linkLaunched,
            linkLaunchedAt: session.linkLaunchedAt,
            accumulatedAwaySeconds: elapsedSeconds,
            elapsedSeconds,
            remainingSeconds,
            isDurationMet: isMet,
            isAway: false,
            resumed: true,
          },
        });
        return;
      }

      // Create new session
      const sessionId = `els_${crypto.randomBytes(16).toString('hex')}`;
      session = await ExternalLinkSession.create({
        sessionId,
        userId: user._id,
        taskId: task._id,
        assignmentId: assignment._id,
        targetUrl,
        category: task.category,
        requiredDurationSeconds,
        startedAt: now,
        linkLaunched: false,
        accumulatedAwaySeconds: 0,
        isAway: false,
        eligible: false,
        attemptStatus: 'NOT_STARTED',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 7200 * 1000),
      });

      res.status(200).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          attemptId: undefined,
          taskId: task._id.toString(),
          assignmentId: assignment._id.toString(),
          targetUrl: session.targetUrl,
          category: session.category,
          requiredDurationSeconds: session.requiredDurationSeconds,
          startedAt: session.startedAt,
          linkLaunched: false,
          accumulatedAwaySeconds: 0,
          elapsedSeconds: 0,
          remainingSeconds: session.requiredDurationSeconds,
          isDurationMet: false,
          isAway: false,
          resumed: false,
        },
      });
    });
  } catch (err: any) {
    if (err instanceof QueueOverloadError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    req.log.error(err, 'Failed to start external link session');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to start external link session' },
    });
  }
}

/**
 * POST /api/tasks/:id/external-link/launch
 * Records client link launch result. If launch succeeds, initiates a task-linked away interval.
 */
export async function reportLinkLaunch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { sessionId, success, failureReason } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required' },
    });
    return;
  }

  const session = await ExternalLinkSession.findOne({
    sessionId,
    taskId: id,
  });

  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Active external link session not found' },
    });
    return;
  }

  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized to update someone else\'s session' },
    });
    return;
  }

  const isSuccess = Boolean(success);
  const now = new Date();

  if (isSuccess) {
    // Generate fresh attempt ID for this uninterrupted attempt
    const attemptId = `att_${crypto.randomBytes(8).toString('hex')}`;
    session.currentAttemptId = attemptId;
    session.attemptStartedAt = now;
    session.attemptStatus = 'IN_PROGRESS';
    session.isAway = true;
    session.eligible = false; // Reset eligible progress to 0: fresh attempt, never combine previous time!
    session.accumulatedAwaySeconds = 0;
    session.activeIntervalStartedAt = now;
    session.linkLaunched = true;
    session.linkLaunchedAt = now;
    session.launchFailure = false;
    session.launchFailureReason = undefined;
  } else {
    // Launch failed: do not begin attempt
    session.launchFailure = true;
    session.launchFailureReason = failureReason || 'External application failed to launch link';
    session.isAway = false;
    session.eligible = false;
    session.attemptStatus = 'NOT_STARTED';
    session.activeIntervalStartedAt = undefined;
    session.attemptStartedAt = undefined;
  }

  await session.save();

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      attemptId: session.currentAttemptId,
      linkLaunched: session.linkLaunched,
      linkLaunchedAt: session.linkLaunchedAt,
      launchFailure: session.launchFailure,
      launchFailureReason: session.launchFailureReason,
      accumulatedAwaySeconds: 0,
      elapsedSeconds: 0,
      requiredDurationSeconds: session.requiredDurationSeconds,
      remainingSeconds: session.requiredDurationSeconds,
      isDurationMet: false,
      isAway: session.isAway,
    },
  });
}

/**
 * POST /api/tasks/:id/external-link/return
 * Closes current attempt. If returned before required duration, invalidates attempt and resets progress to 0.
 */
export async function recordLinkReturn(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const sessionId = req.body?.sessionId;
  const attemptId = req.body?.attemptId;

  const query: any = {
    userId: user._id,
    taskId: id,
    status: 'ACTIVE',
  };
  if (sessionId) {
    query.sessionId = sessionId;
  }

  const session = await ExternalLinkSession.findOne(query).sort({ createdAt: -1 });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Active external link session not found' },
    });
    return;
  }

  const now = new Date();

  // If attemptId is provided and does not match currentAttemptId, ignore delayed / stale event
  if (attemptId && session.currentAttemptId && attemptId !== session.currentAttemptId) {
    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        attemptId: session.currentAttemptId,
        status: session.attemptStatus || 'STALE_ATTEMPT_IGNORED',
        elapsedSeconds: session.eligible ? session.requiredDurationSeconds : 0,
        requiredDurationSeconds: session.requiredDurationSeconds,
        remainingSeconds: session.eligible ? 0 : session.requiredDurationSeconds,
        isDurationMet: Boolean(session.eligible),
        isAway: session.isAway,
        ignored: true,
      },
    });
    return;
  }

  if (session.isAway && session.attemptStartedAt) {
    const rawDelta = Math.max(0, Math.floor((now.getTime() - session.attemptStartedAt.getTime()) / 1000));
    // Restart / crash check: If away duration exceeds 2x required duration or max 120s, recover conservatively
    const maxAllowedAttemptSeconds = Math.max(session.requiredDurationSeconds * 2, 120);
    const validDelta = rawDelta <= maxAllowedAttemptSeconds ? rawDelta : 0;

    session.isAway = false;
    session.activeIntervalStartedAt = undefined;
    session.lastReturnedAt = now;
    session.lastAttemptDurationSeconds = validDelta;

    if (validDelta < session.requiredDurationSeconds) {
      // Returned early: invalidate attempt, reset eligible progress to 0, disable Claim
      session.eligible = false;
      session.accumulatedAwaySeconds = 0;
      session.attemptStatus = 'RETURNED_EARLY';
      await session.save();

      res.status(200).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          attemptId: session.currentAttemptId,
          status: 'RETURNED_EARLY',
          message: `You returned early. Open the link again and complete the full ${session.requiredDurationSeconds} seconds.`,
          lastAttemptDurationSeconds: validDelta,
          elapsedSeconds: 0,
          requiredDurationSeconds: session.requiredDurationSeconds,
          remainingSeconds: session.requiredDurationSeconds,
          isDurationMet: false,
          isAway: false,
        },
      });
      return;
    } else {
      // Single uninterrupted away attempt satisfied!
      session.eligible = true;
      session.accumulatedAwaySeconds = session.requiredDurationSeconds;
      session.attemptStatus = 'DURATION_MET';
      await session.save();

      res.status(200).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          attemptId: session.currentAttemptId,
          status: 'DURATION_MET',
          message: 'Required duration met. Ready to claim reward.',
          lastAttemptDurationSeconds: validDelta,
          elapsedSeconds: session.requiredDurationSeconds,
          requiredDurationSeconds: session.requiredDurationSeconds,
          remainingSeconds: 0,
          isDurationMet: true,
          isAway: false,
        },
      });
      return;
    }
  }

  // If not away, return current eligibility status
  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      attemptId: session.currentAttemptId,
      status: session.attemptStatus || 'NOT_STARTED',
      message: session.eligible
        ? 'Required duration met. Ready to claim reward.'
        : `You returned early. Open the link again and complete the full ${session.requiredDurationSeconds} seconds.`,
      elapsedSeconds: session.eligible ? session.requiredDurationSeconds : 0,
      requiredDurationSeconds: session.requiredDurationSeconds,
      remainingSeconds: session.eligible ? 0 : session.requiredDurationSeconds,
      isDurationMet: Boolean(session.eligible),
      isAway: false,
    },
  });
}

/**
 * GET /api/tasks/:id/external-link/:sessionId
 * GET /api/tasks/:id/external-link/status
 * Fetches current server-authoritative single-attempt progress.
 */
export async function getExternalLinkSessionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id, sessionId: paramSessionId } = req.params;
  const user = req.user!;
  const querySessionId = (req.query.sessionId as string) || paramSessionId;

  // 1. Reconcile verified completion BEFORE checking active session
  const existingCompletion = await TaskCompletion.findOne({
    taskId: id,
    userId: user._id,
    status: 'VERIFIED',
  });

  if (existingCompletion) {
    const task = await Task.findById(id);
    const { requiredDurationSeconds } = task ? resolveTaskLinkAndDuration(task) : { requiredDurationSeconds: 30 };
    res.status(200).json({
      success: true,
      data: {
        sessionId: `completed-${existingCompletion._id}`,
        attemptId: undefined,
        status: 'COMPLETED',
        linkLaunched: true,
        elapsedSeconds: requiredDurationSeconds,
        requiredDurationSeconds,
        remainingSeconds: 0,
        isDurationMet: true,
        isAway: false,
        rewardGranted: true,
        isCompleted: true,
        rewardPoints: existingCompletion.rewardPoints,
        completionId: existingCompletion._id.toString(),
      },
    });
    return;
  }

  const query: any = {
    userId: user._id,
    taskId: id,
  };

  if (querySessionId && querySessionId !== 'status') {
    const directSession = await ExternalLinkSession.findOne({ sessionId: querySessionId, taskId: id });
    if (directSession && directSession.userId.toString() !== user._id.toString()) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized to inspect someone else\'s session' },
      });
      return;
    }
    query.sessionId = querySessionId;
  } else {
    query.status = { $in: ['ACTIVE', 'COMPLETED'] };
  }

  const session = await ExternalLinkSession.findOne(query).sort({ createdAt: -1 });

  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'No session found for this task' },
    });
    return;
  }

  const isCompleted = session.status === 'COMPLETED' || session.rewardGranted;
  const isMet = isCompleted || Boolean(session.eligible);
  const elapsedSeconds = isMet ? session.requiredDurationSeconds : 0;
  const remainingSeconds = isMet ? 0 : session.requiredDurationSeconds;

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      attemptId: session.currentAttemptId,
      status: isCompleted ? 'COMPLETED' : session.attemptStatus || session.status,
      linkLaunched: session.linkLaunched,
      linkLaunchedAt: session.linkLaunchedAt,
      launchFailure: session.launchFailure,
      elapsedSeconds,
      requiredDurationSeconds: session.requiredDurationSeconds,
      remainingSeconds,
      isDurationMet: isMet,
      isAway: session.isAway,
      rewardGranted: session.rewardGranted,
      isCompleted,
    },
  });
}

/**
 * POST /api/tasks/:id/external-link/verify
 * Server-authoritative verification of external link engagement elapsed time.
 * - Rejects if link was not launched.
 * - Early return: returns status INCOMPLETE with server-calculated remainingSeconds.
 * - Late return: validates task status, expiration, caps, eligibility, and atomically credits reward once.
 * - Idempotent: re-calling verify on a completed session does not grant duplicate credits.
 */
export async function verifyExternalLinkElapsed(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { sessionId } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required for verification' },
    });
    return;
  }

  try {
    await taskVerificationMutex.run(id, async () => {
      const task = await Task.findById(id);
      if (!task) {
        throw new TaskVerificationError(404, 'TASK_NOT_FOUND', 'Task not found');
      }

      if (task.status !== 'PUBLISHED') {
        throw new TaskVerificationError(400, 'TASK_NOT_AVAILABLE', 'Task is not currently available or paused');
      }

      const campaign = await Campaign.findById(task.campaignId);
      if (!campaign || campaign.status !== 'ACTIVE') {
        throw new TaskVerificationError(400, 'CAMPAIGN_NOT_ACTIVE', 'Parent campaign is not active');
      }

      // Check task expiration
      if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
        throw new TaskVerificationError(400, 'TASK_EXPIRED', 'This task has expired');
      }

      // Lookup session
      const session = await ExternalLinkSession.findOne({
        sessionId,
        taskId: id,
      });

      if (!session) {
        throw new TaskVerificationError(404, 'SESSION_NOT_FOUND', 'External link session not found');
      }

      if (session.userId.toString() !== user._id.toString()) {
        throw new TaskVerificationError(
          403,
          'FORBIDDEN_SESSION',
          'You are not authorized to verify someone else\'s session'
        );
      }

      // Idempotency: If session is already completed, return existing completion without duplicate credit
      if (session.status === 'COMPLETED' || session.rewardGranted) {
        const existingCompletion = await TaskCompletion.findOne({
          taskId: task._id,
          userId: user._id,
          assignmentId: session.assignmentId,
        });

        if (existingCompletion) {
          res.status(200).json({
            success: true,
            status: 'COMPLETED',
            idempotent: true,
            message: 'Task already verified and credited',
            data: {
              completion: {
                id: existingCompletion._id.toString(),
                taskId: task._id.toString(),
                rewardPoints: existingCompletion.rewardPoints,
                status: existingCompletion.status,
                completedAt: existingCompletion.completedAt,
              },
              rewardPoints: existingCompletion.rewardPoints,
            },
          });
          return;
        }
      }

      // Check duplicate completion across task and user
      const existingUserCompletion = await TaskCompletion.findOne({
        taskId: task._id,
        userId: user._id,
        status: 'VERIFIED',
      });
      if (existingUserCompletion) {
        throw new TaskVerificationError(
          400,
          'TASK_ALREADY_COMPLETED',
          'You have already received credit for this task'
        );
      }

      // Check global task cap
      if (task.completionsCount >= task.totalCap) {
        throw new TaskVerificationError(400, 'CAP_EXHAUSTED', 'Global completion cap exhausted');
      }

      // Check daily cap
      const startOfToday = getStartOfTodayUtc();
      const completedTodayCount = await TaskCompletion.countDocuments({
        taskId: task._id,
        userId: user._id,
        completedAt: { $gte: startOfToday },
      });
      if (completedTodayCount >= task.dailyCapPerUser) {
        throw new TaskVerificationError(
          400,
          'DAILY_CAP_REACHED',
          `You have reached your daily limit of ${task.dailyCapPerUser} completion(s) for this task`
        );
      }

      // Rule: Link launch fail ho to completion eligible mat banao
      if (!session.linkLaunched) {
        res.status(400).json({
          success: false,
          status: 'NOT_ELIGIBLE',
          error: {
            code: 'LINK_NOT_LAUNCHED',
            message: 'External link must be successfully opened before task completion can be verified',
            failureReason: session.launchFailureReason,
          },
          data: {
            sessionId: session.sessionId,
            linkLaunched: false,
            launchFailure: session.launchFailure,
          },
        });
        return;
      }

      // Server-authoritative single uninterrupted attempt verification
      const now = new Date();

      // If user called verify while still marked away, close the attempt
      if (session.isAway && session.attemptStartedAt) {
        const rawDelta = Math.max(0, Math.floor((now.getTime() - session.attemptStartedAt.getTime()) / 1000));
        const maxAllowed = Math.max(session.requiredDurationSeconds * 2, 120);
        const validDelta = rawDelta <= maxAllowed ? rawDelta : 0;

        session.isAway = false;
        session.activeIntervalStartedAt = undefined;
        session.lastReturnedAt = now;
        session.lastAttemptDurationSeconds = validDelta;

        if (validDelta >= session.requiredDurationSeconds) {
          session.eligible = true;
          session.accumulatedAwaySeconds = session.requiredDurationSeconds;
          session.attemptStatus = 'DURATION_MET';
        } else {
          session.eligible = false;
          session.accumulatedAwaySeconds = 0;
          session.attemptStatus = 'RETURNED_EARLY';
        }
        await session.save();
      }

      // Check single uninterrupted attempt eligibility
      if (!session.eligible) {
        res.status(400).json({
          success: false,
          status: 'RETURNED_EARLY',
          error: {
            code: 'INSUFFICIENT_DURATION',
            message: `You returned early. Open the link again and complete the full ${session.requiredDurationSeconds} seconds.`,
          },
          data: {
            status: 'RETURNED_EARLY',
            sessionId: session.sessionId,
            attemptId: session.currentAttemptId,
            elapsedSeconds: 0,
            requiredDurationSeconds: session.requiredDurationSeconds,
            remainingSeconds: session.requiredDurationSeconds,
          },
        });
        return;
      }

      // Duration satisfied: execute atomic database transaction
      const dbSession = await mongoose.startSession();
      let completionResult: any = null;
      const elapsedSeconds = session.requiredDurationSeconds;

      try {
        await dbSession.withTransaction(async () => {
          // 1. Mark assignment completed
          const updatedAssignment = await TaskAssignment.findOneAndUpdate(
            { _id: session.assignmentId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
            { $set: { status: 'COMPLETED', completedAt: now } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedAssignment) {
            throw new TaskVerificationError(400, 'ASSIGNMENT_INVALID', 'Assignment already completed or invalid');
          }

          // 2. Mark session completed
          session.status = 'COMPLETED';
          session.completedAt = now;
          session.rewardGranted = true;
          await session.save({ session: dbSession });

          // 3. Atomically increment task completionsCount with cap guard
          const updatedTask = await Task.findOneAndUpdate(
            { _id: task._id, status: 'PUBLISHED', $expr: { $lt: ['$completionsCount', '$totalCap'] } },
            { $inc: { completionsCount: 1 } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedTask) {
            throw new TaskVerificationError(400, 'CAP_EXHAUSTED', 'Global completion cap exhausted');
          }

          // 4. Create VerificationEvidence with label EXTERNAL_LINK_ELAPSED
          const evidenceDocs = await VerificationEvidence.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: user._id,
                evidenceType: 'EXTERNAL_LINK_ELAPSED',
                signatureVerified: true,
                rawPayload: {
                  evidenceLabel: 'EXTERNAL_LINK_ELAPSED',
                  sessionId: session.sessionId,
                  attemptId: session.currentAttemptId,
                  singleUninterruptedAwayAttempt: true,
                  attemptDurationSeconds: session.lastAttemptDurationSeconds || session.requiredDurationSeconds,
                  targetUrl: session.targetUrl,
                  category: session.category,
                  startedAt: session.startedAt.toISOString(),
                  elapsedSeconds: session.requiredDurationSeconds,
                  accumulatedAwaySeconds: session.requiredDurationSeconds,
                  requiredDurationSeconds: session.requiredDurationSeconds,
                  verifiedAt: now.toISOString(),
                  clientReportedAwayTime: true,
                  attributionNotice:
                    'Measures client-reported time away from ADPAYON; not verified third-party browser reading or YouTube watching.',
                },
                evaluatedAt: now,
              },
            ],
            { session: dbSession }
          );

          // 5. Create TaskCompletion
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
                completedAt: now,
                evidenceId: evidenceDocs[0]._id,
              },
            ],
            { session: dbSession }
          );

          // 6. Create WalletLedgerEntry with strict idempotency key (Promotional non-withdrawable points)
          await WalletLedgerEntry.create(
            [
              {
                userId: user._id,
                entryType: 'TASK_REWARD',
                amountPaise: 0, // Promotional points carry 0 withdrawable cash value
                pointsEquivalent: task.rewardPoints,
                status: 'CONFIRMED',
                balanceBeforePaise: 0,
                balanceAfterPaise: 0,
                referenceEntity: 'TaskCompletion',
                referenceId: completionDocs[0]._id,
                idempotencyKey: `ext-elapsed-reward-${completionDocs[0]._id}`,
                notes: `Promotional points reward for "${task.title}"`,
              },
            ],
            { session: dbSession }
          );

          // 7. Create TaskEvent
          await TaskEvent.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: user._id,
                eventType: 'VERIFY_SUCCESS',
                payload: {
                  action: 'EXTERNAL_LINK_ELAPSED_VERIFIED',
                  evidenceLabel: 'EXTERNAL_LINK_ELAPSED',
                  rewardPoints: task.rewardPoints,
                  completionId: completionDocs[0]._id.toString(),
                  sessionId: session.sessionId,
                  elapsedSeconds,
                  requiredDurationSeconds: session.requiredDurationSeconds,
                },
              },
            ],
            { session: dbSession }
          );

          completionResult = {
            completionId: completionDocs[0]._id.toString(),
            rewardPoints: task.rewardPoints,
            status: 'VERIFIED',
            evidenceId: evidenceDocs[0]._id.toString(),
            evidenceLabel: 'EXTERNAL_LINK_ELAPSED',
          };
        });

        res.status(200).json({
          success: true,
          status: 'COMPLETED',
          message: 'Task verified and reward credited successfully',
          data: completionResult,
        });
      } finally {
        await dbSession.endSession();
      }
    });
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
      error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Verification failed' },
    });
  }
}
