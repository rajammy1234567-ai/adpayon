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
  YouTubeLearningSession,
} from '../models';
import { taskVerificationMutex, QueueOverloadError } from '../utils/keyedMutex';
import { TaskVerificationError } from './userTask.controller';

const CLOCK_TOLERANCE_MS = 5000;

/**
 * POST /api/tasks/:id/youtube-learning/start
 * Initiates or resumes a verified YouTube educational learning session.
 */
export async function startYouTubeSession(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      error: { code: 'TASK_NOT_AVAILABLE', message: 'Task is not currently available' },
    });
    return;
  }

  if (task.category !== 'YOUTUBE_LEARNING') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CATEGORY', message: 'Task is not a YOUTUBE_LEARNING task' },
    });
    return;
  }

  const campaign = await Campaign.findById(task.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_ACTIVE', message: 'Campaign is not currently active' },
    });
    return;
  }

  // Check user targeting
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

  // Check completion caps
  if (task.completionsCount >= task.totalCap) {
    res.status(400).json({
      success: false,
      error: { code: 'CAP_EXHAUSTED', message: 'Task completion cap reached' },
    });
    return;
  }

  // Check expiration
  if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_EXPIRED', message: 'This task has expired' },
    });
    return;
  }

  // Check already completed
  const existingCompletion = await TaskCompletion.findOne({
    taskId: task._id,
    userId: user._id,
    status: 'VERIFIED',
  });
  if (existingCompletion) {
    const config = task.youtubeLearningConfig || ({} as any);
    const sessionDuration = config.requiredDurationSeconds || 60;
    res.status(200).json({
      success: true,
      data: {
        sessionId: `completed-${existingCompletion._id}`,
        videoId: config.videoId || '',
        youtubeUrl: config.youtubeUrl || '',
        videoTitle: config.videoTitle || task.title,
        instructions: config.instructions || task.instructions,
        requiredDurationSeconds: sessionDuration,
        accumulatedSeconds: sessionDuration,
        rewardPoints: task.rewardPoints,
        educationalNotice:
          config.educationalNotice ||
          'Educational learning session. ADPAYON verifies comprehension and learning session engagement, not YouTube view counts, watch time or platform metrics.',
        hasQuiz: false,
        quiz: null,
        quizAnswerCorrect: true,
        status: 'COMPLETED',
        isCompleted: true,
        rewardGranted: true,
        completionId: existingCompletion._id.toString(),
      },
    });
    return;
  }

  const config = task.youtubeLearningConfig;
  if (!config || !config.youtubeUrl || !config.videoId) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CONFIG', message: 'Task is missing valid YouTube learning configuration' },
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
    });
  }

  // Find or create session
  let session = await YouTubeLearningSession.findOne({
    taskId: task._id,
    userId: user._id,
    assignmentId: assignment._id,
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() },
  });

  const sessionDuration = config.requiredDurationSeconds || 60;

  if (!session) {
    const sessionId = `yt_${crypto.randomBytes(16).toString('hex')}`;
    session = await YouTubeLearningSession.create({
      sessionId,
      userId: user._id,
      taskId: task._id,
      assignmentId: assignment._id,
      status: 'ACTIVE',
      videoId: config.videoId,
      youtubeUrl: config.youtubeUrl,
      videoTitle: config.videoTitle,
      requiredDurationSeconds: sessionDuration,
      accumulatedSeconds: 0,
      hasQuiz: !!config.comprehensionQuiz?.question,
      quizQuestion: config.comprehensionQuiz?.question,
      quizOptions: config.comprehensionQuiz?.options || [],
      quizCorrectOptionIndex: config.comprehensionQuiz?.correctOptionIndex,
      quizAnswered: false,
      quizAnswerCorrect: !config.comprehensionQuiz?.question, // auto-correct if no quiz
      expiresAt: new Date(Date.now() + 3600 * 1000),
      lastProgressAt: new Date(),
    });
  }

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      videoId: session.videoId,
      youtubeUrl: session.youtubeUrl,
      videoTitle: session.videoTitle || task.title,
      instructions: config.instructions || task.instructions,
      requiredDurationSeconds: session.requiredDurationSeconds,
      accumulatedSeconds: session.accumulatedSeconds,
      rewardPoints: task.rewardPoints,
      educationalNotice:
        config.educationalNotice ||
        'Educational learning session. ADPAYON verifies comprehension and learning session engagement, not YouTube view counts, watch time or platform metrics.',
      hasQuiz: session.hasQuiz,
      quiz: session.hasQuiz
        ? {
            question: session.quizQuestion,
            options: session.quizOptions,
            // SECURITY: correctOptionIndex is strictly omitted from client payloads
          }
        : null,
      quizAnswerCorrect: session.quizAnswerCorrect,
    },
  });
}

/**
 * POST /api/tasks/:id/youtube-learning/progress
 * Heartbeat/progress update for educational engagement tracking.
 */
export async function recordYouTubeProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { sessionId, secondsDelta } = req.body;
  const user = req.user!;

  if (!sessionId || typeof secondsDelta !== 'number' || secondsDelta <= 0) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Valid sessionId and positive secondsDelta are required' },
    });
    return;
  }

  const session = await YouTubeLearningSession.findOne({
    sessionId,
    userId: user._id,
    taskId: id,
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Active YouTube learning session not found' },
    });
    return;
  }

  // Cap incremental delta to prevent clock spoofing
  const clampedDelta = Math.min(secondsDelta, 30);
  session.accumulatedSeconds += clampedDelta;
  session.lastProgressAt = new Date();
  await session.save();

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      accumulatedSeconds: session.accumulatedSeconds,
      requiredDurationSeconds: session.requiredDurationSeconds,
      isSessionComplete: session.accumulatedSeconds >= session.requiredDurationSeconds,
    },
  });
}

/**
 * GET /api/tasks/:id/youtube-learning/:sessionId
 * Retrieves learning session state for seamless background/foreground recovery.
 */
export async function getYouTubeSessionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id, sessionId } = req.params;
  const user = req.user!;

  const session = await YouTubeLearningSession.findOne({
    sessionId,
    userId: user._id,
    taskId: id,
  });

  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Learning session not found' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      status: session.status,
      videoId: session.videoId,
      accumulatedSeconds: session.accumulatedSeconds,
      requiredDurationSeconds: session.requiredDurationSeconds,
      hasQuiz: session.hasQuiz,
      quizAnswerCorrect: session.quizAnswerCorrect,
      rewardGranted: session.rewardGranted,
    },
  });
}

/**
 * POST /api/tasks/:id/youtube-learning/quiz
 * Submits quiz answer for server-side evaluation.
 */
export async function submitYouTubeQuizAnswer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { sessionId, selectedOptionIndex } = req.body;
  const user = req.user!;

  if (typeof selectedOptionIndex !== 'number' || selectedOptionIndex < 0) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_OPTION', message: 'Valid selectedOptionIndex is required' },
    });
    return;
  }

  const session = await YouTubeLearningSession.findOne({
    sessionId,
    userId: user._id,
    taskId: id,
    status: 'ACTIVE',
  });

  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Active learning session not found' },
    });
    return;
  }

  session.quizAttempts += 1;
  session.quizAnswered = true;

  const isCorrect = selectedOptionIndex === session.quizCorrectOptionIndex;
  session.quizAnswerCorrect = isCorrect;
  await session.save();

  if (!isCorrect) {
    res.status(400).json({
      success: false,
      error: {
        code: 'QUIZ_INCORRECT',
        message: 'Incorrect answer. Please review the learning material and try again.',
      },
      data: {
        correct: false,
        attempts: session.quizAttempts,
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      correct: true,
      message: 'Great job! Comprehension answer verified.',
    },
  });
}

/**
 * POST /api/tasks/:id/youtube-learning/verify
 * Verifies educational learning completion and atomically credits promotional reward.
 */
export async function verifyYouTubeLearning(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { sessionId } = req.body;
  const user = req.user!;

  if (!sessionId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required for verification' },
    });
    return;
  }

  try {
    await taskVerificationMutex.run(id, async () => {
      const task = await Task.findById(id);
      if (!task || task.status !== 'PUBLISHED') {
        throw new TaskVerificationError(400, 'TASK_NOT_AVAILABLE', 'Task is not currently available');
      }

      const session = await YouTubeLearningSession.findOne({
        sessionId,
        userId: user._id,
        taskId: id,
        status: 'ACTIVE',
      });

      if (!session) {
        throw new TaskVerificationError(404, 'SESSION_NOT_FOUND', 'Active learning session not found');
      }

      // Check learning duration (allow 5-second leeway)
      if (session.accumulatedSeconds < session.requiredDurationSeconds - 5) {
        throw new TaskVerificationError(
          400,
          'INSUFFICIENT_DURATION',
          `Required learning time not met. Completed ${session.accumulatedSeconds}s of ${session.requiredDurationSeconds}s.`
        );
      }

      // Check quiz answer if quiz is enabled
      if (session.hasQuiz && !session.quizAnswerCorrect) {
        throw new TaskVerificationError(
          400,
          'QUIZ_NOT_PASSED',
          'Comprehension quiz must be passed before claiming completion reward.'
        );
      }

      // Check duplicate completion
      const existingCompletion = await TaskCompletion.findOne({
        taskId: task._id,
        userId: user._id,
        status: 'VERIFIED',
      });
      if (existingCompletion) {
        throw new TaskVerificationError(
          400,
          'TASK_ALREADY_COMPLETED',
          'You have already received credit for this learning task'
        );
      }

      const dbSession = await mongoose.startSession();
      let completionResult: any = null;

      try {
        await dbSession.withTransaction(async () => {
          // 1. Mark assignment completed
          const updatedAssignment = await TaskAssignment.findOneAndUpdate(
            { _id: session.assignmentId, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
            { $set: { status: 'COMPLETED', completedAt: new Date() } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedAssignment) {
            throw new TaskVerificationError(400, 'ASSIGNMENT_INVALID', 'Assignment already completed or invalid');
          }

          // 2. Increment completions count
          const updatedTask = await Task.findOneAndUpdate(
            { _id: task._id, status: 'PUBLISHED', $expr: { $lt: ['$completionsCount', '$totalCap'] } },
            { $inc: { completionsCount: 1 } },
            { session: dbSession, returnDocument: 'after' }
          );

          if (!updatedTask) {
            throw new TaskVerificationError(400, 'CAP_EXHAUSTED', 'Global completion cap exhausted');
          }

          // 3. Evidence
          const evidenceDocs = await VerificationEvidence.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: user._id,
                evidenceType: 'FIRST_PARTY_TELEMETRY',
                signatureVerified: true,
                rawPayload: {
                  sessionId: session.sessionId,
                  videoId: session.videoId,
                  accumulatedSeconds: session.accumulatedSeconds,
                  requiredDurationSeconds: session.requiredDurationSeconds,
                  quizPassed: session.quizAnswerCorrect,
                  educationalDisclaimer:
                    'Reward awarded strictly for educational comprehension quiz mastery, not YouTube view count, watch time, likes or subscriptions.',
                  verifiedAt: new Date().toISOString(),
                },
                evaluatedAt: new Date(),
              },
            ],
            { session: dbSession }
          );

          // 4. Task Completion
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

          // 5. Wallet Ledger Entry (Task Reward)
          await WalletLedgerEntry.create(
            [
              {
                userId: user._id,
                entryType: 'TASK_REWARD',
                amountPaise: task.rewardPoints,
                pointsEquivalent: task.rewardPoints,
                status: 'CONFIRMED',
                balanceBeforePaise: 0,
                balanceAfterPaise: task.rewardPoints,
                referenceEntity: 'TaskCompletion',
                referenceId: completionDocs[0]._id,
                idempotencyKey: `yt-reward-${completionDocs[0]._id}`,
                notes: `Educational learning reward for "${task.title}"`,
              },
            ],
            { session: dbSession }
          );

          // 6. Task Event
          await TaskEvent.create(
            [
              {
                assignmentId: updatedAssignment._id,
                taskId: task._id,
                userId: user._id,
                eventType: 'VERIFY_SUCCESS',
                payload: {
                  action: 'YOUTUBE_LEARNING_VERIFIED',
                  rewardPoints: task.rewardPoints,
                  completionId: completionDocs[0]._id.toString(),
                  sessionId: session.sessionId,
                },
                ipAddress: req.ip || '127.0.0.1',
              },
            ],
            { session: dbSession }
          );

          // 7. Update Session
          session.status = 'COMPLETED';
          session.completedAt = new Date();
          session.rewardGranted = true;
          await session.save({ session: dbSession });

          completionResult = completionDocs[0];
        });

        res.status(200).json({
          success: true,
          data: {
            status: 'VERIFIED',
            rewardPoints: task.rewardPoints,
            completionId: completionResult._id.toString(),
            message: `Learning verified! +${task.rewardPoints} promotional points credited to your wallet.`,
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
        error: { code: 'QUEUE_OVERLOAD', message: 'Too many requests. Please retry in a moment.' },
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Verification failed' },
    });
  }
}
