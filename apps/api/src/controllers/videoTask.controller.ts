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
  VideoPlaybackSession,
} from '../models';
import { env } from '../config/env';
import { taskVerificationMutex, QueueOverloadError } from '../utils/keyedMutex';
import { TaskVerificationError } from './userTask.controller';

const CLOCK_TOLERANCE_MS = 5000; // 5-second allowance for network latency / device clock skew
const END_TOLERANCE_SECONDS = 1.0; // Allowed playback-end timeline tolerance in seconds

interface TimelineSegment {
  start: number;
  end: number;
}

export function mergeTimelineSegments(
  existing: TimelineSegment[],
  newSeg: TimelineSegment,
  maxDuration: number
): TimelineSegment[] {
  const start = Math.max(0, Math.min(newSeg.start, maxDuration));
  const end = Math.max(0, Math.min(newSeg.end, maxDuration));
  if (end <= start) {
    return existing;
  }

  const all = [...existing, { start, end }].sort((a, b) => a.start - b.start);
  const merged: TimelineSegment[] = [];

  for (const seg of all) {
    if (merged.length === 0) {
      merged.push({ start: seg.start, end: seg.end });
      continue;
    }

    const prev = merged[merged.length - 1];
    if (seg.start <= prev.end + 0.25) {
      prev.end = Math.max(prev.end, seg.end);
    } else {
      merged.push({ start: seg.start, end: seg.end });
    }
  }

  return merged;
}

export function calculateTimelineCoverage(segments: TimelineSegment[]): number {
  return segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
}

/**
 * POST /api/tasks/:id/video-session/start
 * Starts or resumes a server-authoritative video playback session.
 * Bound to userId, taskId, and active assignmentId.
 */
export async function startVideoSession(req: AuthenticatedRequest, res: Response): Promise<void> {
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

  if (task.category !== 'VIDEO_WATCH') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CATEGORY',
        message: 'This endpoint is exclusively for VIDEO_WATCH tasks',
      },
    });
    return;
  }

  if (!task.videoWatchConfig || !task.videoWatchConfig.videoUrl) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CONFIG',
        message: 'Task is missing video watch configuration',
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

  // 3. Campaign check
  const campaign = await Campaign.findById(task.campaignId);
  if (!campaign || campaign.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: { code: 'CAMPAIGN_NOT_ACTIVE', message: 'Task campaign is not currently active' },
    });
    return;
  }

  // 4. Locate or validate task assignment
  const requestedAssignmentId = req.body?.assignmentId;
  let assignment;

  if (requestedAssignmentId) {
    if (!Types.ObjectId.isValid(requestedAssignmentId)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid assignment ID format' },
      });
      return;
    }

    assignment = await TaskAssignment.findOne({
      _id: new Types.ObjectId(requestedAssignmentId),
      taskId: task._id,
      userId: user._id,
    });
  } else {
    assignment = await TaskAssignment.findOne({
      taskId: task._id,
      userId: user._id,
      status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
      expiresAt: { $gt: new Date() },
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

  if (assignment.status === 'COMPLETED') {
    res.status(400).json({
      success: false,
      error: {
        code: 'ASSIGNMENT_ALREADY_COMPLETED',
        message: 'This task assignment has already been completed.',
      },
    });
    return;
  }

  if (assignment.expiresAt && assignment.expiresAt <= new Date()) {
    assignment.status = 'EXPIRED';
    await assignment.save();
    res.status(400).json({
      success: false,
      error: {
        code: 'ASSIGNMENT_EXPIRED',
        message: 'Task assignment has expired. Please restart the task.',
      },
    });
    return;
  }

  // 5. Check existing video session for this assignment
  const existingSession = await VideoPlaybackSession.findOne({
    assignmentId: assignment._id,
    userId: user._id,
    taskId: task._id,
  }).sort({ createdAt: -1 });

  if (existingSession) {
    if (existingSession.rewardGranted || existingSession.status === 'COMPLETED') {
      res.status(400).json({
        success: false,
        error: {
          code: 'SESSION_ALREADY_COMPLETED',
          message: 'Video session for this assignment is already completed.',
        },
      });
      return;
    }

    // If existing active session is not expired and not rejected, return it to resume
    if (existingSession.status === 'ACTIVE' && existingSession.expiresAt > new Date()) {
      const remainingSeconds =
        existingSession.completionPolicy === 'FULL_VIDEO'
          ? Math.max(0, Math.round((existingSession.videoDuration - (existingSession.timelineCoverageSeconds || 0)) * 10) / 10)
          : Math.max(0, Math.round((existingSession.requiredWatchSeconds - existingSession.accumulatedWatchSeconds) * 10) / 10);

      res.status(200).json({
        success: true,
        data: {
          sessionId: existingSession.sessionId,
          taskId: task._id.toString(),
          assignmentId: assignment._id.toString(),
          videoUrl: existingSession.videoUrl,
          videoDuration: existingSession.videoDuration,
          requiredWatchSeconds: existingSession.requiredWatchSeconds,
          completionPolicy: existingSession.completionPolicy || 'MINIMUM_DURATION',
          allowSeeking: existingSession.allowSeeking,
          accumulatedWatchSeconds: existingSession.accumulatedWatchSeconds,
          timelineCoverageSeconds: existingSession.timelineCoverageSeconds || 0,
          playbackEnded: Boolean(existingSession.playbackEnded),
          lastPlaybackPositionSeconds: existingSession.lastPlaybackPositionSeconds,
          remainingWatchSeconds: remainingSeconds,
          status: existingSession.status,
          expiresAt: existingSession.expiresAt,
          hasQuiz: Boolean(task.videoWatchConfig?.comprehensionQuiz?.question),
          comprehensionQuiz: task.videoWatchConfig?.comprehensionQuiz?.question
            ? {
                question: task.videoWatchConfig.comprehensionQuiz.question,
                options: task.videoWatchConfig.comprehensionQuiz.options,
              }
            : undefined,
          quizAnswerCorrect: Boolean(existingSession.quizAnswerCorrect),
        },
      });
      return;
    }
  }

  // 6. Create fresh server-generated video session
  const sessionId = `vses_${crypto.randomBytes(16).toString('hex')}`;
  const sessionTimeoutSeconds = task.videoWatchConfig.sessionTimeoutSeconds || 1800;
  const sessionExpiresAt = new Date(
    Math.min(
      Date.now() + sessionTimeoutSeconds * 1000,
      assignment.expiresAt ? assignment.expiresAt.getTime() : Date.now() + 7200 * 1000
    )
  );

  const completionPolicy = task.videoWatchConfig.completionPolicy || 'MINIMUM_DURATION';

  const videoSession = await VideoPlaybackSession.create({
    sessionId,
    userId: user._id,
    taskId: task._id,
    assignmentId: assignment._id,
    status: 'ACTIVE',
    videoUrl: task.videoWatchConfig.videoUrl,
    videoDuration: task.videoWatchConfig.videoDurationSeconds,
    requiredWatchSeconds: task.videoWatchConfig.requiredWatchSeconds,
    completionPolicy,
    allowSeeking: task.videoWatchConfig.allowSeeking || false,
    accumulatedWatchSeconds: 0,
    timelineCoverageSeconds: 0,
    maxPlaybackPositionSeconds: 0,
    playbackEnded: false,
    coveredSegments: [],
    lastPlaybackPositionSeconds: 0,
    lastProgressAt: new Date(),
    expiresAt: sessionExpiresAt,
    intervals: [],
  });

  // Log session start event
  await TaskEvent.create({
    assignmentId: assignment._id,
    taskId: task._id,
    userId: user._id,
    eventType: 'START',
    payload: {
      action: 'VIDEO_SESSION_START',
      sessionId: videoSession.sessionId,
      requiredWatchSeconds: videoSession.requiredWatchSeconds,
      completionPolicy: videoSession.completionPolicy,
    },
    ipAddress: req.ip || '127.0.0.1',
    userAgent: req.headers['user-agent'],
  });

  const remainingSeconds =
    completionPolicy === 'FULL_VIDEO'
      ? videoSession.videoDuration
      : videoSession.requiredWatchSeconds;

  res.status(201).json({
    success: true,
    data: {
      sessionId: videoSession.sessionId,
      taskId: task._id.toString(),
      assignmentId: assignment._id.toString(),
      videoUrl: videoSession.videoUrl,
      videoDuration: videoSession.videoDuration,
      requiredWatchSeconds: videoSession.requiredWatchSeconds,
      completionPolicy: videoSession.completionPolicy,
      allowSeeking: videoSession.allowSeeking,
      accumulatedWatchSeconds: 0,
      timelineCoverageSeconds: 0,
      playbackEnded: false,
      lastPlaybackPositionSeconds: 0,
      remainingWatchSeconds: remainingSeconds,
      status: videoSession.status,
      expiresAt: videoSession.expiresAt,
      hasQuiz: Boolean(task.videoWatchConfig?.comprehensionQuiz?.question),
      comprehensionQuiz: task.videoWatchConfig?.comprehensionQuiz?.question
        ? {
            question: task.videoWatchConfig.comprehensionQuiz.question,
            options: task.videoWatchConfig.comprehensionQuiz.options,
          }
        : undefined,
      quizAnswerCorrect: false,
    },
  });
}

/**
 * POST /api/tasks/:id/video-session/progress
 * Accepts periodic video playback progress beacons with bounded frequency,
 * wall-clock validation, seeking checks, and foreground tracking.
 */
export async function recordVideoProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user!;
  const { sessionId, playbackPositionSeconds, isPlaying, appState, isBuffering, playbackEnded } = req.body;

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

  // Lookup session
  const session = await VideoPlaybackSession.findOne({ sessionId, taskId: id });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Video playback session not found' },
    });
    return;
  }

  // Cross-user session authorization protection
  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this video session' },
    });
    return;
  }

  // Status checks
  if (session.status !== 'ACTIVE') {
    res.status(400).json({
      success: false,
      error: {
        code: 'SESSION_NOT_ACTIVE',
        message: `Video session is ${session.status.toLowerCase()}`,
      },
    });
    return;
  }

  const now = new Date();
  if (now > session.expiresAt) {
    session.status = 'EXPIRED';
    await session.save();
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Video session has expired' },
    });
    return;
  }

  // Verify task and assignment are still active
  const task = await Task.findById(id);
  if (!task || task.status !== 'PUBLISHED') {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_PAUSED', message: 'Task is no longer published or has been paused' },
    });
    return;
  }

  const assignment = await TaskAssignment.findById(session.assignmentId);
  if (!assignment || assignment.status === 'COMPLETED' || assignment.status === 'EXPIRED') {
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_INVALID', message: 'Task assignment is no longer active' },
    });
    return;
  }

  // Validate playback position
  if (
    typeof playbackPositionSeconds !== 'number' ||
    !Number.isFinite(playbackPositionSeconds) ||
    playbackPositionSeconds < 0 ||
    playbackPositionSeconds > session.videoDuration + 5
  ) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PLAYBACK_POSITION',
        message: `playbackPositionSeconds must be between 0 and ${session.videoDuration}`,
      },
    });
    return;
  }

  // Server-side wall-clock calculations
  const wallClockElapsed = Math.max(0, (now.getTime() - session.lastProgressAt.getTime()) / 1000);
  const positionDelta = playbackPositionSeconds - session.lastPlaybackPositionSeconds;

  // Seeking check: if seeking is disallowed and position advanced significantly faster than wall-clock time
  if (!session.allowSeeking) {
    // If user jumped forward by more than wallClockElapsed + 2.5s allowance
    if (positionDelta > wallClockElapsed + 2.5) {
      session.status = 'REJECTED';
      session.rejectionReason = 'SEEKING_PROHIBITED';
      await session.save();

      await TaskEvent.create({
        assignmentId: session.assignmentId,
        taskId: session.taskId,
        userId: session.userId,
        eventType: 'VERIFY_FAIL',
        payload: {
          reason: 'SEEKING_PROHIBITED',
          playbackPositionSeconds,
          lastPosition: session.lastPlaybackPositionSeconds,
          wallClockElapsed,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'SEEKING_PROHIBITED',
          message: 'Forward seeking or skipping is prohibited for this task.',
        },
      });
      return;
    }
  }

  // Foreground, Buffering & Playback State check
  // Accumulate watch time ONLY when playing actively in foreground and NOT buffering
  const isForeground = !appState || appState === 'active';
  const isPlayingActive = Boolean(isPlaying);
  const isBufferingActive = Boolean(isBuffering);

  let watchDelta = 0;
  if (isPlayingActive && isForeground && !isBufferingActive) {
    if (positionDelta > 0) {
      watchDelta = Math.min(positionDelta, wallClockElapsed + 1.0);
      watchDelta = Math.max(0, watchDelta);

      // Track timeline coverage for forward playback
      const rawSegments = (session.coveredSegments || []).map((s: any) => ({
        start: s.start,
        end: s.end,
      }));
      const updatedSegments = mergeTimelineSegments(
        rawSegments,
        {
          start: session.lastPlaybackPositionSeconds,
          end: playbackPositionSeconds,
        },
        session.videoDuration
      );

      session.coveredSegments = updatedSegments as any;
      session.timelineCoverageSeconds = calculateTimelineCoverage(updatedSegments);
      session.maxPlaybackPositionSeconds = Math.max(
        session.maxPlaybackPositionSeconds || 0,
        playbackPositionSeconds
      );
    } else {
      // Position delta <= 0 (backward seek or pause): do not add to watchDelta or timeline coverage
      watchDelta = 0;
    }
  }

  // Handle client-reported playbackEnded flag
  if (playbackEnded === true) {
    if (session.completionPolicy === 'FULL_VIDEO') {
      const minCoverageRequired = session.videoDuration - END_TOLERANCE_SECONDS;
      const currentCoverage = session.timelineCoverageSeconds || 0;

      // Reject fake/premature end events without valid preceding coverage
      if (currentCoverage < minCoverageRequired || playbackPositionSeconds < minCoverageRequired) {
        session.status = 'REJECTED';
        session.rejectionReason = 'PREMATURE_PLAYBACK_ENDED';
        await session.save();

        await TaskEvent.create({
          assignmentId: session.assignmentId,
          taskId: session.taskId,
          userId: session.userId,
          eventType: 'VERIFY_FAIL',
          payload: {
            reason: 'PREMATURE_PLAYBACK_ENDED',
            playbackPositionSeconds,
            timelineCoverageSeconds: currentCoverage,
            videoDuration: session.videoDuration,
          },
          ipAddress: req.ip || '127.0.0.1',
        });

        res.status(400).json({
          success: false,
          error: {
            code: 'PREMATURE_PLAYBACK_ENDED',
            message: 'Video ended event reported prematurely without complete timeline coverage.',
          },
        });
        return;
      }

      session.playbackEnded = true;
      session.playbackEndedAt = now;
    } else {
      session.playbackEnded = true;
      session.playbackEndedAt = now;
    }
  }

  // Absolute wall-clock cap from session creation to prevent tampering / clock acceleration
  const totalSessionWallClock = (now.getTime() - session.createdAt.getTime()) / 1000 + 5.0;
  const newAccumulated = Math.min(
    session.accumulatedWatchSeconds + watchDelta,
    totalSessionWallClock
  );

  if (watchDelta > 0) {
    session.intervals.push({
      startWallClock: session.lastProgressAt,
      endWallClock: now,
      startPos: session.lastPlaybackPositionSeconds,
      endPos: playbackPositionSeconds,
      watchDelta,
    });
  }

  session.accumulatedWatchSeconds = newAccumulated;
  session.lastPlaybackPositionSeconds = playbackPositionSeconds;
  session.lastProgressAt = now;
  session.progressEventsCount += 1;
  await session.save();

  // Determine qualification based on session completionPolicy
  const isQualified =
    session.completionPolicy === 'FULL_VIDEO'
      ? (session.timelineCoverageSeconds || 0) >= session.videoDuration - END_TOLERANCE_SECONDS &&
        Boolean(session.playbackEnded)
      : session.accumulatedWatchSeconds >= session.requiredWatchSeconds;

  const remainingWatchSeconds =
    session.completionPolicy === 'FULL_VIDEO'
      ? Math.max(0, Math.round((session.videoDuration - (session.timelineCoverageSeconds || 0)) * 10) / 10)
      : Math.max(0, Math.round((session.requiredWatchSeconds - session.accumulatedWatchSeconds) * 10) / 10);

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      accumulatedWatchSeconds: Math.round(session.accumulatedWatchSeconds * 10) / 10,
      timelineCoverageSeconds: Math.round((session.timelineCoverageSeconds || 0) * 10) / 10,
      completionPolicy: session.completionPolicy,
      playbackEnded: Boolean(session.playbackEnded),
      requiredWatchSeconds: session.requiredWatchSeconds,
      remainingWatchSeconds,
      isQualified,
      status: session.status,
    },
  });
}

/**
 * GET /api/tasks/:id/video-session/:sessionId
 * Returns the current server-authoritative status and progress of a video session.
 */
export async function getVideoSessionStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id, sessionId } = req.params;
  const user = req.user!;

  if (!Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid task ID format' },
    });
    return;
  }

  const session = await VideoPlaybackSession.findOne({ sessionId, taskId: id });
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Video playback session not found' },
    });
    return;
  }

  if (session.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this video session' },
    });
    return;
  }

  const isQualified =
    session.completionPolicy === 'FULL_VIDEO'
      ? (session.timelineCoverageSeconds || 0) >= session.videoDuration - END_TOLERANCE_SECONDS &&
        Boolean(session.playbackEnded)
      : session.accumulatedWatchSeconds >= session.requiredWatchSeconds;

  const remainingWatchSeconds =
    session.completionPolicy === 'FULL_VIDEO'
      ? Math.max(0, Math.round((session.videoDuration - (session.timelineCoverageSeconds || 0)) * 10) / 10)
      : Math.max(0, Math.round((session.requiredWatchSeconds - session.accumulatedWatchSeconds) * 10) / 10);

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.sessionId,
      taskId: session.taskId.toString(),
      assignmentId: session.assignmentId.toString(),
      status: session.status,
      videoUrl: session.videoUrl,
      videoDuration: session.videoDuration,
      requiredWatchSeconds: session.requiredWatchSeconds,
      completionPolicy: session.completionPolicy || 'MINIMUM_DURATION',
      accumulatedWatchSeconds: Math.round(session.accumulatedWatchSeconds * 10) / 10,
      timelineCoverageSeconds: Math.round((session.timelineCoverageSeconds || 0) * 10) / 10,
      playbackEnded: Boolean(session.playbackEnded),
      remainingWatchSeconds,
      isQualified,
      allowSeeking: session.allowSeeking,
      rewardGranted: session.rewardGranted,
      expiresAt: session.expiresAt,
    },
  });
}

/**
 * POST /api/tasks/:id/video-session/quiz
 * Validates the comprehension question for a video learning task.
 */
export async function submitVideoQuizAnswer(req: AuthenticatedRequest, res: Response): Promise<void> {
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

  if (typeof selectedOptionIndex !== 'number' || selectedOptionIndex < 0) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUIZ_SELECTION', message: 'Valid selectedOptionIndex is required' },
    });
    return;
  }

  const task = await Task.findById(id);
  if (!task || task.category !== 'VIDEO_WATCH') {
    res.status(404).json({
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: 'Video learning task not found' },
    });
    return;
  }

  const quiz = task.videoWatchConfig?.comprehensionQuiz;
  if (!quiz || !quiz.question) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_QUIZ_CONFIGURED', message: 'This video task does not have a quiz configured' },
    });
    return;
  }

  const videoSession = await VideoPlaybackSession.findOne({ sessionId, taskId: task._id, userId: user._id });
  if (!videoSession) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Active video session not found' },
    });
    return;
  }

  if (videoSession.status !== 'ACTIVE' || videoSession.expiresAt <= new Date()) {
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Video session has expired' },
    });
    return;
  }

  const isCorrect = selectedOptionIndex === quiz.correctOptionIndex;
  videoSession.quizAttempts = (videoSession.quizAttempts || 0) + 1;
  videoSession.lastQuizAttemptAt = new Date();
  if (isCorrect) {
    videoSession.quizAnswerCorrect = true;
  }
  await videoSession.save();

  res.status(200).json({
    success: true,
    data: {
      isCorrect,
      attemptsCount: videoSession.quizAttempts,
      message: isCorrect ? 'Correct! You can now claim your reward.' : 'Incorrect answer. Please re-read and try again.',
    },
  });
}

/**
 * POST /api/tasks/:id/video-session/verify
 * Authoritative video watch verification and atomic promotional reward distribution.
 * Executes authoritative CURRENT transaction ordering:
 * 1. Claim Assignment
 * 2. Reserve Global Task Cap
 * 3. Insert Verification Evidence
 * 4. Insert Task Completion
 * 5. Insert Task Event
 */
export async function verifyVideoWatch(req: AuthenticatedRequest, res: Response): Promise<void> {
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

  if (task.category !== 'VIDEO_WATCH') {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TASK_CATEGORY',
        message: 'This verification endpoint is exclusively for VIDEO_WATCH tasks',
      },
    });
    return;
  }

  // 2. Lookup session
  const videoSession = await VideoPlaybackSession.findOne({ sessionId, taskId: task._id });
  if (!videoSession) {
    res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Video playback session not found' },
    });
    return;
  }

  // Cross-user session authorization protection
  if (videoSession.userId.toString() !== user._id.toString()) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN_SESSION', message: 'You are not authorized for this video session' },
    });
    return;
  }

  // Same-user idempotent reconciliation check: if already completed or reward granted
  if (videoSession.rewardGranted || videoSession.status === 'COMPLETED') {
    const existingCompletion = await TaskCompletion.findOne({
      taskId: task._id,
      userId: user._id,
      assignmentId: videoSession.assignmentId,
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
            sessionId: videoSession.sessionId,
            accumulatedWatchSeconds: videoSession.accumulatedWatchSeconds,
            status: 'COMPLETED',
          },
          reconciled: true,
        },
      });
      return;
    }
  }

  // Rejection check
  if (videoSession.status === 'REJECTED') {
    res.status(400).json({
      success: false,
      error: {
        code: 'SESSION_REJECTED',
        message: videoSession.rejectionReason || 'Video session was rejected due to policy violations',
      },
    });
    return;
  }

  // Expiration check
  if (videoSession.status === 'EXPIRED' || videoSession.expiresAt <= new Date()) {
    if (videoSession.status !== 'EXPIRED') {
      videoSession.status = 'EXPIRED';
      await videoSession.save();
    }
    res.status(400).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Video playback session has expired' },
    });
    return;
  }

  // Admin pause check
  if (task.status !== 'PUBLISHED') {
    res.status(400).json({
      success: false,
      error: { code: 'TASK_NOT_PUBLISHED', message: 'Task is no longer published or has been paused' },
    });
    return;
  }

  // Check assignment
  const assignment = await TaskAssignment.findById(videoSession.assignmentId);
  if (!assignment) {
    res.status(404).json({
      success: false,
      error: { code: 'NO_ACTIVE_ASSIGNMENT', message: 'No assignment found for video session' },
    });
    return;
  }

  if (assignment.status === 'EXPIRED' || (assignment.expiresAt && assignment.expiresAt <= new Date())) {
    res.status(400).json({
      success: false,
      error: { code: 'ASSIGNMENT_EXPIRED', message: 'Task assignment has expired' },
    });
    return;
  }

  if (assignment.status === 'COMPLETED') {
    // Reconcile if completion exists
    const existingCompletion = await TaskCompletion.findOne({
      taskId: task._id,
      userId: user._id,
      assignmentId: assignment._id,
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
            sessionId: videoSession.sessionId,
            accumulatedWatchSeconds: videoSession.accumulatedWatchSeconds,
            status: 'COMPLETED',
          },
          reconciled: true,
        },
      });
      return;
    }
  }

  // Qualification check according to completionPolicy
  const isFullVideoPolicy = videoSession.completionPolicy === 'FULL_VIDEO';

  if (isFullVideoPolicy) {
    // 1. Timeline coverage check
    const minRequiredCoverage = videoSession.videoDuration - END_TOLERANCE_SECONDS;
    const currentCoverage = videoSession.timelineCoverageSeconds || 0;

    if (currentCoverage < minRequiredCoverage) {
      await TaskEvent.create({
        assignmentId: assignment._id,
        taskId: task._id,
        userId: user._id,
        eventType: 'VERIFY_FAIL',
        payload: {
          reason: 'INCOMPLETE_TIMELINE_COVERAGE',
          timelineCoverageSeconds: currentCoverage,
          requiredCoverageSeconds: minRequiredCoverage,
          videoDuration: videoSession.videoDuration,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'INCOMPLETE_TIMELINE_COVERAGE',
          message: `Complete video watch required. Verified coverage: ${Math.round(currentCoverage * 10) / 10}s of ${videoSession.videoDuration}s.`,
          details: {
            videoDuration: videoSession.videoDuration,
            timelineCoverageSeconds: Math.round(currentCoverage * 10) / 10,
            remainingWatchSeconds: Math.max(0, Math.round((videoSession.videoDuration - currentCoverage) * 10) / 10),
          },
        },
      });
      return;
    }

    // 2. Playback ended event check
    if (!videoSession.playbackEnded) {
      await TaskEvent.create({
        assignmentId: assignment._id,
        taskId: task._id,
        userId: user._id,
        eventType: 'VERIFY_FAIL',
        payload: {
          reason: 'PLAYBACK_NOT_ENDED',
          timelineCoverageSeconds: currentCoverage,
          videoDuration: videoSession.videoDuration,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'PLAYBACK_NOT_ENDED',
          message: 'The video must play completely to the end before the reward can be claimed.',
        },
      });
      return;
    }
  } else {
    // MINIMUM_DURATION policy: accumulated watch time must meet or exceed required watch seconds
    if (videoSession.accumulatedWatchSeconds < videoSession.requiredWatchSeconds) {
      await TaskEvent.create({
        assignmentId: assignment._id,
        taskId: task._id,
        userId: user._id,
        eventType: 'VERIFY_FAIL',
        payload: {
          reason: 'INSUFFICIENT_WATCH_TIME',
          accumulatedWatchSeconds: videoSession.accumulatedWatchSeconds,
          requiredWatchSeconds: videoSession.requiredWatchSeconds,
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_WATCH_TIME',
          message: `Task requirement not met: Required ${videoSession.requiredWatchSeconds}s watch time, accumulated ${Math.round(videoSession.accumulatedWatchSeconds)}s`,
          details: {
            requiredWatchSeconds: videoSession.requiredWatchSeconds,
            accumulatedWatchSeconds: Math.round(videoSession.accumulatedWatchSeconds * 10) / 10,
            remainingWatchSeconds: Math.max(
              0,
              Math.round((videoSession.requiredWatchSeconds - videoSession.accumulatedWatchSeconds) * 10) / 10
            ),
          },
        },
      });
      return;
    }
  }

  // Wall-clock anti-tampering sanity check: total watch time cannot exceed real elapsed wall-clock time
  const totalElapsedRealMs = Date.now() - videoSession.createdAt.getTime();
  const minRequiredWallClockSeconds = Math.max(
    0,
    (isFullVideoPolicy ? videoSession.videoDuration : videoSession.requiredWatchSeconds) - 2.5
  );

  if (totalElapsedRealMs / 1000 < minRequiredWallClockSeconds) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INSUFFICIENT_ELAPSED_TIME',
        message: 'Server wall-clock elapsed time is less than minimum required playback duration.',
      },
    });
    return;
  }

  if (videoSession.accumulatedWatchSeconds > totalElapsedRealMs / 1000 + 10.0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'TAMPERING_DETECTED',
        message: 'Accumulated watch time exceeds server wall-clock duration.',
      },
    });
    return;
  }

  // Comprehension quiz check if configured for this video learning task
  const videoQuiz = task.videoWatchConfig?.comprehensionQuiz;
  if (videoQuiz && videoQuiz.question) {
    let quizPassed = Boolean(videoSession.quizAnswerCorrect);
    if (!quizPassed && typeof req.body?.selectedOptionIndex === 'number') {
      if (req.body.selectedOptionIndex === videoQuiz.correctOptionIndex) {
        quizPassed = true;
        videoSession.quizAnswerCorrect = true;
        await videoSession.save();
      }
    }

    if (!quizPassed) {
      await TaskEvent.create({
        assignmentId: assignment._id,
        taskId: task._id,
        userId: user._id,
        eventType: 'VERIFY_FAIL',
        payload: {
          reason: 'QUIZ_NOT_PASSED',
        },
        ipAddress: req.ip || '127.0.0.1',
      });

      res.status(400).json({
        success: false,
        error: {
          code: 'QUIZ_NOT_PASSED',
          message: 'You must answer the verification question correctly before claiming your reward.',
        },
      });
      return;
    }
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
              dwellTimeAccumulatedSeconds: Math.round(
                isFullVideoPolicy
                  ? (videoSession.timelineCoverageSeconds || videoSession.accumulatedWatchSeconds)
                  : videoSession.accumulatedWatchSeconds
              ),
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
                method: 'VIDEO_WATCH_SESSION',
                sessionId: videoSession.sessionId,
                completionPolicy: videoSession.completionPolicy,
                accumulatedWatchSeconds: videoSession.accumulatedWatchSeconds,
                timelineCoverageSeconds: videoSession.timelineCoverageSeconds || 0,
                playbackEnded: Boolean(videoSession.playbackEnded),
                requiredWatchSeconds: videoSession.requiredWatchSeconds,
                videoDuration: videoSession.videoDuration,
                intervalsCount: videoSession.intervals.length,
                progressEventsCount: videoSession.progressEventsCount,
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
                rewardPoints: task.rewardPoints,
                sessionId: videoSession.sessionId,
                accumulatedWatchSeconds: videoSession.accumulatedWatchSeconds,
              },
              ipAddress: req.ip || '127.0.0.1',
            },
          ],
          { session: dbSession }
        );

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
            sessionId: videoSession.sessionId,
            accumulatedWatchSeconds: videoSession.accumulatedWatchSeconds,
            status: 'COMPLETED',
          },
        };
      });

      // Post-commit: mark session COMPLETED and rewardGranted
      videoSession.status = 'COMPLETED';
      videoSession.completedAt = new Date();
      videoSession.rewardGranted = true;
      await videoSession.save();

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
      error: {
        code: 'TRANSACTION_FAILED',
        message: err.message || 'Failed to complete video verification transaction',
      },
    });
  }
}
