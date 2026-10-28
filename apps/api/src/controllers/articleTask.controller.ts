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
  ArticleReadingSession,
  WalletLedgerEntry,
} from '../models';
import { taskVerificationMutex, QueueOverloadError } from '../utils/keyedMutex';
import { TaskVerificationError } from './userTask.controller';

const CLOCK_TOLERANCE_MS = 5000;
const QUIZ_COOLDOWN_MS = 1000;

/**
 * POST /api/tasks/:id/article-session/start
 * Starts or resumes a server-authoritative article reading session.
 * Bound to userId, taskId, and active assignmentId.
 */
export async function startArticleSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  // 1. Fetch task and validate category
  const task = await Task.findById(id);
  if (!task || task.status !== 'PUBLISHED') {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_AVAILABLE', message: 'Task is not currently available or paused' },
    });
    return;
  }

  if (task.category !== 'ARTICLE_READ') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CATEGORY',
        message: 'This endpoint is exclusively for ARTICLE_READ tasks',
      },
    });
    return;
  }

  if (!task.articleReadConfig || !task.articleReadConfig.articleContent) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CONFIG',
        message: 'Task is missing article read configuration',
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

  // 3. Campaign check
  const campaign = await Campaign.findById(task.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_ACTIVE', message: 'Campaign is not currently active' },
    });
    return;
  }

  // 4. Assignment resolution
  const requestedAssignmentId = req.body?.assignmentId;
  let assignment;

  if (requestedAssignmentId) {
    if (!Types.ObjectId.isValid(requestedAssignmentId)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ASSIGNMENT_ID', message: 'Invalid assignment ID format' },
      });
      return;
    }

    assignment = await TaskAssignment.findOne({
      _id: requestedAssignmentId,
      taskId: task._id,
      userId: user._id,
    });

    if (!assignment) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_ACTIVE_ASSIGNMENT', message: 'Requested assignment not found for this user' },
      });
      return;
    }
  } else {
    assignment = await TaskAssignment.findOne({
      taskId: task._id,
      userId: user._id,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
  }

  if (!assignment) {
    if (requestedAssignmentId) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_ACTIVE_ASSIGNMENT', message: 'Requested assignment not found for this user' },
      });
      return;
    }

    // Auto-provision assignment if user has not already started
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const completedTodayCount = await TaskCompletion.countDocuments({
      taskId: task._id,
      userId: user._id,
      completedAt: { $gte: startOfToday },
    });

    if (completedTodayCount >= task.dailyCapPerUser) {
      res.status(400).json({
        success: false,
        error: { code: 'DAILY_CAP_REACHED', message: 'You have reached your daily limit for this task' },
      });
      return;
    }

    const clickId = `clk_${crypto.randomBytes(16).toString('hex')}`;
    const timeoutSec = 600;
    const expiresAt = new Date(Date.now() + timeoutSec * 1000);

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
        assignment = await TaskAssignment.findOne({
          taskId: task._id,
          userId: user._id,
          status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
          expiresAt: { $gt: new Date() },
        });
      }
      if (!assignment) {
        res.status(400).json({
          success: false,
          error: { code: 'ASSIGNMENT_ERROR', message: 'Failed to initialize task assignment' },
        });
        return;
      }
    }
  }

  // Reconcile completed assignment / verification before checking expiration or active session
  const existingCompletion = await TaskCompletion.findOne({
    taskId: task._id,
    userId: user._id,
    status: 'VERIFIED',
  });

  if (assignment.status === 'COMPLETED' || existingCompletion) {
    const minDur = task.articleReadConfig.minReadDurationSeconds || 30;
    res.status(200).json({
      success: true,
      data: {
        sessionId: `completed-${assignment._id}`,
        taskId: task._id.toString(),
        assignmentId: assignment._id.toString(),
        articleTitle: task.articleReadConfig.articleTitle,
        articleContent: task.articleReadConfig.articleContent,
        sourceUrl: task.articleReadConfig.sourceUrl,
        minReadDurationSeconds: minDur,
        minScrollPercentage: task.articleReadConfig.minScrollPercentage || 80,
        accumulatedReadSeconds: minDur,
        maxScrollPercentage: 100,
        remainingReadSeconds: 0,
        status: 'COMPLETED',
        isCompleted: true,
        rewardGranted: true,
        hasQuiz: Boolean(task.articleReadConfig.comprehensionQuiz?.question),
        quizQuestion: task.articleReadConfig.comprehensionQuiz?.question,
        quizOptions: task.articleReadConfig.comprehensionQuiz?.options,
        quizAnswered: true,
        quizAnswerCorrect: true,
        quizAttempts: 1,
        quizMaxAttempts: 3,
        isQualified: true,
        expiresAt: assignment.expiresAt,
      },
    });
    return;
  }

  if (assignment.expiresAt <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_EXPIRED', message: 'Task assignment has expired' },
    });
    return;
  }

  // 5. Look for existing ACTIVE unexpired session
  let session = await ArticleReadingSession.findOne({
    taskId: task._id,
    userId: user._id,
    assignmentId: assignment._id,
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    const sessionId = `ases_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(
      Math.min(
        assignment.expiresAt.getTime(),
        Date.now() + 30 * 60 * 1000 // 30-minute session window
      )
    );

    const hasQuiz = Boolean(
      task.articleReadConfig.comprehensionQuiz &&
      task.articleReadConfig.comprehensionQuiz.question &&
      task.articleReadConfig.comprehensionQuiz.options?.length >= 2
    );

    session = await ArticleReadingSession.create({
      sessionId,
      userId: user._id,
      taskId: task._id,
      assignmentId: assignment._id,
      status: 'ACTIVE',
      articleTitle: task.articleReadConfig.articleTitle,
      articleLengthCharacters: task.articleReadConfig.articleContent.length,
      minReadDurationSeconds: task.articleReadConfig.minReadDurationSeconds,
      minScrollPercentage: task.articleReadConfig.minScrollPercentage || 80,
      hasQuiz,
      quizQuestion: hasQuiz ? task.articleReadConfig.comprehensionQuiz!.question : undefined,
      quizOptions: hasQuiz ? task.articleReadConfig.comprehensionQuiz!.options : undefined,
      quizCorrectOptionIndex: hasQuiz ? task.articleReadConfig.comprehensionQuiz!.correctOptionIndex : undefined,
      quizAnswered: false,
      quizAnswerCorrect: false,
      quizAttempts: 0,
      quizMaxAttempts: 3,
      accumulatedReadSeconds: 0,
      maxScrollPercentage: 0,
      lastScrollPercentage: 0,
      scrollEventsCount: 0,
      lastProgressAt: new Date(),
      expiresAt,
      rewardGranted: false,
    });
  }

  const remainingReadSeconds = Math.max(
    0,
    Math.round((session.minReadDurationSeconds - session.accumulatedReadSeconds) * 10) / 10
  );

  const isQualified =
    session.accumulatedReadSeconds >= session.minReadDurationSeconds &&
    session.maxScrollPercentage >= session.minScrollPercentage &&
    (!session.hasQuiz || session.quizAnswerCorrect);

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      taskId: session.taskId.toString(),
      assignmentId: session.assignmentId.toString(),
      articleTitle: session.articleTitle,
      articleContent: task.articleReadConfig.articleContent,
      sourceUrl: task.articleReadConfig.sourceUrl,
      minReadDurationSeconds: session.minReadDurationSeconds,
      minScrollPercentage: session.minScrollPercentage,
      accumulatedReadSeconds: Math.round(session.accumulatedReadSeconds * 10) / 10,
      maxScrollPercentage: Math.round(session.maxScrollPercentage),
      remainingReadSeconds,
      status: session.status,
      hasQuiz: session.hasQuiz,
      quizQuestion: session.quizQuestion,
      quizOptions: session.quizOptions,
      quizAnswered: session.quizAnswered,
      quizAnswerCorrect: session.quizAnswerCorrect,
      quizAttempts: session.quizAttempts,
      quizMaxAttempts: session.quizMaxAttempts,
      isQualified,
      expiresAt: session.expiresAt,
    },
  });
}

/**
 * POST /api/tasks/:id/article-session/progress
 * Sends rate-limited periodic reading engagement and scroll telemetry.
 * Client telemetry is considered untrusted: server bounds read time by real wall-clock elapsed time.
 */
export async function recordArticleProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { sessionId, scrollPercentage, appState, readingDeltaSeconds } = req.body;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_SESSION_ID', message: 'sessionId is required' },
    });
    return;
  }

  const session = await ArticleReadingSession.findOne({ sessionId, taskId: id });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Article reading session not found' },
    });
    return;
  }

  // Authorization check
  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this reading session' },
    });
    return;
  }

  if (session.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_NOT_ACTIVE', message: `Session is ${session.status.toLowerCase()}` },
    });
    return;
  }

  // Expiration check
  const now = new Date();
  if (session.expiresAt <= now) {
    session.status = 'EXPIRED';
    await session.save();
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Reading session has expired' },
    });
    return;
  }

  // Server-bounded foreground reading time accumulation
  const elapsedWallClockSeconds = Math.max(0, (now.getTime() - session.lastProgressAt.getTime()) / 1000);
  const isForeground = appState === 'active';

  let deltaToApply = 0;
  if (isForeground) {
    if (readingDeltaSeconds !== undefined && typeof readingDeltaSeconds === 'number') {
      // Bounded by real server elapsed time + 0.5s network jitter allowance
      deltaToApply = Math.min(elapsedWallClockSeconds + 0.5, Math.max(0, readingDeltaSeconds));
    } else {
      deltaToApply = Math.min(elapsedWallClockSeconds, 5.0); // max 5s chunk
    }
  }

  session.accumulatedReadSeconds += deltaToApply;

  // Monotonic scroll percentage check
  if (scrollPercentage !== undefined && typeof scrollPercentage === 'number') {
    const clampedScroll = Math.min(100, Math.max(0, scrollPercentage));
    session.lastScrollPercentage = clampedScroll;
    session.maxScrollPercentage = Math.max(session.maxScrollPercentage, clampedScroll);
  }

  session.scrollEventsCount += 1;
  session.lastProgressAt = now;

  if (deltaToApply > 0) {
    session.intervals.push({
      startWallClock: new Date(now.getTime() - Math.round(deltaToApply * 1000)),
      endWallClock: now,
      readDelta: Math.round(deltaToApply * 10) / 10,
      scrollDepth: session.maxScrollPercentage,
    });
  }

  await session.save();

  const remainingReadSeconds = Math.max(
    0,
    Math.round((session.minReadDurationSeconds - session.accumulatedReadSeconds) * 10) / 10
  );

  const isQualified =
    session.accumulatedReadSeconds >= session.minReadDurationSeconds &&
    session.maxScrollPercentage >= session.minScrollPercentage &&
    (!session.hasQuiz || session.quizAnswerCorrect);

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      accumulatedReadSeconds: Math.round(session.accumulatedReadSeconds * 10) / 10,
      maxScrollPercentage: Math.round(session.maxScrollPercentage),
      remainingReadSeconds,
      isQualified,
      quizRequired: session.hasQuiz,
      quizAnswered: session.quizAnswered,
      quizAnswerCorrect: session.quizAnswerCorrect,
      status: session.status,
    },
  });
}

/**
 * GET /api/tasks/:id/article-session/:sessionId
 * Retrieves authoritative session status and reading progress.
 * Quiz correct option index is NEVER exposed.
 */
export async function getArticleSessionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id, sessionId } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const session = await ArticleReadingSession.findOne({ sessionId, taskId: id });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Article reading session not found' },
    });
    return;
  }

  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this reading session' },
    });
    return;
  }

  const remainingReadSeconds = Math.max(
    0,
    Math.round((session.minReadDurationSeconds - session.accumulatedReadSeconds) * 10) / 10
  );

  const isQualified =
    session.accumulatedReadSeconds >= session.minReadDurationSeconds &&
    session.maxScrollPercentage >= session.minScrollPercentage &&
    (!session.hasQuiz || session.quizAnswerCorrect);

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      taskId: session.taskId.toString(),
      assignmentId: session.assignmentId.toString(),
      status: session.status,
      articleTitle: session.articleTitle,
      minReadDurationSeconds: session.minReadDurationSeconds,
      minScrollPercentage: session.minScrollPercentage,
      accumulatedReadSeconds: Math.round(session.accumulatedReadSeconds * 10) / 10,
      maxScrollPercentage: Math.round(session.maxScrollPercentage),
      remainingReadSeconds,
      isQualified,
      hasQuiz: session.hasQuiz,
      quizQuestion: session.quizQuestion,
      quizOptions: session.quizOptions,
      quizAnswered: session.quizAnswered,
      quizAnswerCorrect: session.quizAnswerCorrect,
      quizAttempts: session.quizAttempts,
      quizMaxAttempts: session.quizMaxAttempts,
      rewardGranted: session.rewardGranted,
      expiresAt: session.expiresAt,
    },
  });
}

/**
 * POST /api/tasks/:id/article-session/quiz
 * Submits multiple-choice comprehension quiz answer.
 * Rate limited with maximum 3 attempts and anti-brute-force cooldown.
 */
export async function submitArticleQuizAnswer(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { sessionId, selectedOptionIndex } = req.body;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_SESSION_ID', message: 'sessionId is required' },
    });
    return;
  }

  if (typeof selectedOptionIndex !== 'number' || !Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_OPTION_INDEX', message: 'selectedOptionIndex must be a non-negative integer' },
    });
    return;
  }

  const session = await ArticleReadingSession.findOne({ sessionId, taskId: id });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Article reading session not found' },
    });
    return;
  }

  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this reading session' },
    });
    return;
  }

  if (session.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_NOT_ACTIVE', message: `Session is ${session.status.toLowerCase()}` },
    });
    return;
  }

  if (!session.hasQuiz) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_QUIZ_CONFIGURED', message: 'This article task does not have a comprehension quiz' },
    });
    return;
  }

  // Already answered correctly check
  if (session.quizAnswerCorrect) {
    res.status(200).json({
      success: true,
      data: {
        correct: true,
        message: 'Quiz already answered correctly.',
        isQualified:
          session.accumulatedReadSeconds >= session.minReadDurationSeconds &&
          session.maxScrollPercentage >= session.minScrollPercentage,
      },
    });
    return;
  }

  // Attempt limit check
  if (session.quizAttempts >= session.quizMaxAttempts) {
    res.status(400).json({
      success: false,
      error: {
        code: 'QUIZ_ATTEMPTS_EXHAUSTED',
        message: `Maximum quiz attempts (${session.quizMaxAttempts}) exceeded for this reading session.`,
      },
    });
    return;
  }

  // Cooldown check
  const now = Date.now();
  if (session.lastQuizAttemptAt && now - session.lastQuizAttemptAt.getTime() < QUIZ_COOLDOWN_MS) {
    res.status(429).json({
      success: false,
      error: {
        code: 'QUIZ_RATE_LIMITED',
        message: 'Please wait a moment before submitting another quiz answer.',
      },
    });
    return;
  }

  // Verify against authoritative answer on Task model
  const task = await Task.findById(id);
  const correctOptionIndex =
    task?.articleReadConfig?.comprehensionQuiz?.correctOptionIndex ?? session.quizCorrectOptionIndex;

  session.quizAttempts += 1;
  session.lastQuizAttemptAt = new Date();
  session.quizAnswered = true;

  const isCorrect = selectedOptionIndex === correctOptionIndex;
  session.quizAnswerCorrect = isCorrect;

  await session.save();

  const isQualified =
    session.accumulatedReadSeconds >= session.minReadDurationSeconds &&
    session.maxScrollPercentage >= session.minScrollPercentage &&
    isCorrect;

  if (isCorrect) {
    res.status(200).json({
      success: true,
      data: {
        correct: true,
        message: '🎉 Correct answer! Comprehension requirement satisfied.',
        isQualified,
      },
    });
  } else {
    res.status(200).json({
      success: true,
      data: {
        correct: false,
        message: 'Incorrect answer. Please re-read the article content and try again.',
        remainingAttempts: session.quizMaxAttempts - session.quizAttempts,
        isQualified: false,
      },
    });
  }
}

/**
 * POST /api/tasks/:id/article-session/verify
 * Authoritative article reading verification and atomic promotional reward distribution.
 * Executes authoritative CURRENT transaction ordering:
 * 1. Claim Assignment
 * 2. Reserve Global Task Cap
 * 3. Insert Verification Evidence
 * 4. Insert Task Completion
 * 5. Insert Task Event
 */
export async function verifyArticleRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { sessionId } = req.body;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_SESSION_ID', message: 'sessionId is required' },
    });
    return;
  }

  // 1. Fetch task and validate category
  const task = await Task.findById(id);
  if (!task) {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
    });
    return;
  }

  if (task.category !== 'ARTICLE_READ') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CATEGORY',
        message: 'This verification endpoint is exclusively for ARTICLE_READ tasks',
      },
    });
    return;
  }

  // 2. Lookup session
  const session = await ArticleReadingSession.findOne({ sessionId, taskId: task._id });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Article reading session not found' },
    });
    return;
  }

  // Cross-user session authorization protection
  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this reading session' },
    });
    return;
  }

  // Same-user idempotent reconciliation check: if already completed or reward granted
  if (session.rewardGranted || session.status === 'COMPLETED') {
    const existingCompletion = await TaskCompletion.findOne({
      taskId: task._id,
      userId: user._id,
      assignmentId: session.assignmentId,
    });

    if (existingCompletion) {
      res.status(200).json({
        success: true,
        data: {
          completion: {
            id: existingCompletion._id.toString(),
            taskId: task._id.toString(),
            rewardPoints: existingCompletion.rewardPoints,
            status: existingCompletion.status,
            completedAt: existingCompletion.completedAt,
          },
          session: {
            sessionId: session.sessionId,
            accumulatedReadSeconds: session.accumulatedReadSeconds,
            maxScrollPercentage: session.maxScrollPercentage,
            status: session.status,
          },
          reconciled: true,
        },
      });
      return;
    }
  }

  if (session.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_NOT_ACTIVE', message: `Cannot verify session with status ${session.status}` },
    });
    return;
  }

  // Session expiration check
  if (session.expiresAt <= new Date()) {
    session.status = 'EXPIRED';
    await session.save();
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Reading session has expired' },
    });
    return;
  }

  // 3. Task Published Check
  if (task.status !== 'PUBLISHED') {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_NOT_PUBLISHED', message: 'Task is no longer published or has been paused' },
    });
    return;
  }

  // 4. Cap check
  if (task.completionsCount >= task.totalCap) {
    res.status(400).json({
      success: false,
      error: { code: 'CAP_EXHAUSTED', message: 'Task global completion cap has been reached' },
    });
    return;
  }

  // 5. Assignment validation
  const assignment = await TaskAssignment.findById(session.assignmentId);
  if (!assignment || !['ASSIGNED', 'IN_PROGRESS'].includes(assignment.status)) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_ACTIVE_ASSIGNMENT', message: 'Assignment is no longer active' },
    });
    return;
  }

  if (assignment.expiresAt <= new Date()) {
    assignment.status = 'EXPIRED';
    await assignment.save();
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_EXPIRED', message: 'Task assignment has expired' },
    });
    return;
  }

  // 6. Qualification Rule 1: Minimum Reading Duration
  if (session.accumulatedReadSeconds < session.minReadDurationSeconds) {
    await TaskEvent.create({
      assignmentId: assignment._id,
      taskId: task._id,
      userId: user._id,
      eventType: 'VERIFY_FAIL',
      payload: {
        reason: 'INSUFFICIENT_READ_TIME',
        accumulatedReadSeconds: session.accumulatedReadSeconds,
        minReadDurationSeconds: session.minReadDurationSeconds,
      },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_READ_TIME',
        message: `Task requirement not met: Required ${session.minReadDurationSeconds}s reading time, accumulated ${Math.round(session.accumulatedReadSeconds)}s.`,
        details: {
          minReadDurationSeconds: session.minReadDurationSeconds,
          accumulatedReadSeconds: Math.round(session.accumulatedReadSeconds * 10) / 10,
          remainingReadSeconds: Math.max(
            0,
            Math.round((session.minReadDurationSeconds - session.accumulatedReadSeconds) * 10) / 10
          ),
        },
      },
    });
    return;
  }

  // 7. Qualification Rule 2: Minimum Scroll Coverage
  if (session.maxScrollPercentage < session.minScrollPercentage) {
    await TaskEvent.create({
      assignmentId: assignment._id,
      taskId: task._id,
      userId: user._id,
      eventType: 'VERIFY_FAIL',
      payload: {
        reason: 'INSUFFICIENT_SCROLL_COVERAGE',
        maxScrollPercentage: session.maxScrollPercentage,
        minScrollPercentage: session.minScrollPercentage,
      },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_SCROLL_COVERAGE',
        message: `Task requirement not met: Required ${session.minScrollPercentage}% scroll coverage, achieved ${Math.round(session.maxScrollPercentage)}%.`,
        details: {
          minScrollPercentage: session.minScrollPercentage,
          maxScrollPercentage: Math.round(session.maxScrollPercentage),
        },
      },
    });
    return;
  }

  // 8. Qualification Rule 3: Comprehension Quiz (if configured)
  if (session.hasQuiz && !session.quizAnswerCorrect) {
    await TaskEvent.create({
      assignmentId: assignment._id,
      taskId: task._id,
      userId: user._id,
      eventType: 'VERIFY_FAIL',
      payload: {
        reason: 'QUIZ_NOT_PASSED',
        quizAnswered: session.quizAnswered,
        quizAttempts: session.quizAttempts,
      },
      ipAddress: req.ip || '127.0.0.1',
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'QUIZ_NOT_PASSED',
        message: 'You must answer the comprehension quiz question correctly before claiming your reward.',
        details: {
          quizAnswered: session.quizAnswered,
          quizAttempts: session.quizAttempts,
          quizMaxAttempts: session.quizMaxAttempts,
        },
      },
    });
    return;
  }

  // 9. Wall-clock anti-tampering sanity check
  const totalElapsedRealMs = Date.now() - session.createdAt.getTime();
  const minRequiredWallClockSeconds = Math.max(0, session.minReadDurationSeconds - 2.5);

  if (totalElapsedRealMs / 1000 < minRequiredWallClockSeconds) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_ELAPSED_TIME',
        message: 'Server wall-clock elapsed time is less than minimum required reading duration.',
      },
    });
    return;
  }

  if (session.accumulatedReadSeconds > totalElapsedRealMs / 1000 + 10.0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'TAMPERING_DETECTED',
        message: 'Accumulated reading time exceeds server wall-clock duration.',
      },
    });
    return;
  }

  // Authoritative Reward Transaction (CURRENT Transaction Ordering)
  const runTransaction = async () => {
    const dbSession = await mongoose.startSession();

    try {
      let resultPayload: any = null;

      await dbSession.withTransaction(async () => {
        // Step 1: Claim Assignment atomically
        const updatedAssignment = await TaskAssignment.findOneAndUpdate(
          {
            _id: assignment._id,
            status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
          },
          {
            $set: {
              status: 'COMPLETED',
              completedAt: new Date(),
              dwellTimeAccumulatedSeconds: Math.round(session.accumulatedReadSeconds),
            },
          },
          { session: dbSession, returnDocument: 'after' }
        );

        if (!updatedAssignment) {
          throw new TaskVerificationError(
            404,
            'NO_ACTIVE_ASSIGNMENT',
            'No active task assignment found or already completed'
          );
        }

        // Step 2: Reserve Global Task Cap atomically
        const updatedTask = await Task.findOneAndUpdate(
          {
            _id: task._id,
            status: 'PUBLISHED',
            $expr: { $lt: ['$completionsCount', '$totalCap'] },
          },
          { $inc: { completionsCount: 1 } },
          { session: dbSession, returnDocument: 'after' }
        );

        if (!updatedTask) {
          const freshTask = await Task.findById(task._id).session(dbSession);
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

        // Step 3: Insert Verification Evidence
        const evidenceDocs = await VerificationEvidence.create(
          [
            {
              assignmentId: updatedAssignment._id,
              taskId: task._id,
              userId: user._id,
              evidenceType: 'FIRST_PARTY_TELEMETRY',
              signatureVerified: true,
              rawPayload: {
                method: 'ARTICLE_READ_SESSION',
                sessionId: session.sessionId,
                accumulatedReadSeconds: session.accumulatedReadSeconds,
                minReadDurationSeconds: session.minReadDurationSeconds,
                maxScrollPercentage: session.maxScrollPercentage,
                minScrollPercentage: session.minScrollPercentage,
                hasQuiz: session.hasQuiz,
                quizAnswerCorrect: session.quizAnswerCorrect,
                quizAttempts: session.quizAttempts,
                intervalsCount: session.intervals.length,
                scrollEventsCount: session.scrollEventsCount,
              },
              ipAddress: req.ip || '127.0.0.1',
              evaluatedAt: new Date(),
            },
          ],
          { session: dbSession }
        );

        // Step 4: Insert Task Completion
        const completionDocs = await TaskCompletion.create(
          [
            {
              taskId: task._id,
              campaignId: task.campaignId,
              userId: user._id,
              assignmentId: updatedAssignment._id,
              clickId: updatedAssignment.clickId,
              rewardPoints: task.rewardPoints,
              status: 'VERIFIED',
              verificationMethod: 'FIRST_PARTY_ACTION',
              evidenceId: evidenceDocs[0]._id,
              completedAt: new Date(),
            },
          ],
          { session: dbSession }
        );

        // Step 4b: Insert Wallet Ledger Entry (Reward)
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
              idempotencyKey: `article-reward-${completionDocs[0]._id}`,
              notes: `Article reading reward for "${task.title}"`,
            },
          ],
          { session: dbSession }
        );

        // Step 5: Insert Task Event
        await TaskEvent.create(
          [
            {
              assignmentId: updatedAssignment._id,
              taskId: task._id,
              userId: user._id,
              eventType: 'VERIFY_SUCCESS',
              payload: {
                completionId: completionDocs[0]._id.toString(),
                sessionId: session.sessionId,
                rewardPoints: task.rewardPoints,
                accumulatedReadSeconds: session.accumulatedReadSeconds,
                maxScrollPercentage: session.maxScrollPercentage,
                quizPassed: session.quizAnswerCorrect,
              },
              ipAddress: req.ip || '127.0.0.1',
            },
          ],
          { session: dbSession }
        );

        // Update Article Session State
        session.status = 'COMPLETED';
        session.rewardGranted = true;
        session.completedAt = new Date();
        await session.save({ session: dbSession });

        resultPayload = {
          completion: {
            id: completionDocs[0]._id.toString(),
            taskId: task._id.toString(),
            clickId: updatedAssignment.clickId,
            rewardPoints: task.rewardPoints,
            status: completionDocs[0].status,
            completedAt: completionDocs[0].completedAt,
          },
          session: {
            sessionId: session.sessionId,
            accumulatedReadSeconds: session.accumulatedReadSeconds,
            maxScrollPercentage: session.maxScrollPercentage,
            status: session.status,
          },
        };
      });

      res.status(200).json({
        success: true,
        data: resultPayload,
      });
    } finally {
      await dbSession.endSession();
    }
  };

  const isQueueEnabled = process.env.TASK_VERIFICATION_QUEUE_ENABLED === 'true';

  try {
    if (isQueueEnabled) {
      await taskVerificationMutex.run(task._id.toString(), async () => {
        await runTransaction();
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
      error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Transaction processing failed' },
    });
  }
}
