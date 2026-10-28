import {
  AppInstallConfig,
  ArticleReadConfigClient,
  ArticleSessionData,
  ArticleSessionProgressPayload,
  ArticleSessionProgressResponse,
  ArticleQuizAnswerPayload,
  ArticleQuizAnswerResponse,
  VideoSessionData,
  VideoSessionProgressPayload,
  VideoSessionProgressResponse,
  VideoWatchConfig,
} from '@adpayon/shared';
import { apiClient } from './client';
import { useDemoStore } from '../../store/demoStore';
import { DEMO_TASKS, DEMO_SUMMARY, DEMO_HISTORY } from '../../constants/demoData';

export type TaskCategory =
  | 'IN_APP_ACTION'
  | 'PARTNER_WEBHOOK'
  | 'SURVEY'
  | 'MANUAL_VERIFY'
  | 'APP_INSTALL'
  | 'VIDEO_WATCH'
  | 'ARTICLE_READ';
export type VerificationMethod = 'FIRST_PARTY_ACTION' | 'AUTHENTICATED_WEBHOOK' | 'MANUAL_REVIEW';
export type TaskAssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
export type TaskCompletionStatus = 'VERIFIED' | 'FLAGGED' | 'REJECTED';

export interface EngagementInterval {
  start: number;
  end: number;
}

export interface TaskFeedItem {
  id: string;
  campaignName: string;
  title: string;
  description: string;
  category: TaskCategory;
  verificationMethod: VerificationMethod;
  rewardPoints: number; // Promotional points (PTS)
  dailyCapPerUser: number;
  completedToday: number;
  dwellTimeSeconds: number;
  instructions?: string;
  isEligible: boolean;
  ineligibilityReason?: string;
  hasActiveAssignment: boolean;
  appInstallConfig?: AppInstallConfig;
  videoWatchConfig?: VideoWatchConfig;
  articleReadConfig?: ArticleReadConfigClient;
  expiresAt?: string;
  activeAssignment?: {
    id: string;
    clickId: string;
    status: TaskAssignmentStatus;
    assignedAt?: string;
    expiresAt: string;
    dwellTimeAccumulatedSeconds?: number;
    remainingDwellSeconds?: number;
  } | null;
}

export interface TaskAssignmentResponse {
  id: string;
  taskId: string;
  title: string;
  clickId: string;
  status: TaskAssignmentStatus;
  assignedAt?: string;
  expiresAt: string;
  dwellTimeRequiredSeconds: number;
  dwellTimeAccumulatedSeconds?: number;
  remainingDwellSeconds?: number;
  actionUrl?: string;
}

export interface TaskCompletionItem {
  id: string;
  task: {
    id: string;
    title: string;
    category: TaskCategory;
  } | null;
  rewardPoints: number;
  status: TaskCompletionStatus;
  verificationMethod: VerificationMethod;
  completedAt: string;
}

export interface TaskStatusResponse {
  hasAssignment: boolean;
  status: string;
  task?: {
    id: string;
    title: string;
    description?: string;
    category: TaskCategory;
    rewardPoints: number;
    status: string;
    verificationMethod: VerificationMethod;
    appInstallConfig?: AppInstallConfig;
    campaignName?: string;
  };
  assignment?: {
    id: string;
    clickId: string;
    status: TaskAssignmentStatus;
    assignedAt: string;
    expiresAt: string;
    completedAt?: string;
    dwellTimeRequiredSeconds?: number;
    dwellTimeAccumulatedSeconds?: number;
    remainingDwellSeconds?: number;
    isExpired?: boolean;
    hasOpenedStore?: boolean;
    storeVisitedAt?: string;
    initialInstallStatus?: 'INSTALLED' | 'NOT_INSTALLED' | 'UNAVAILABLE';
    initialPackageName?: string;
  };
}

export interface TaskSummaryData {
  totalCompleted: number;
  totalRewardPoints: number;
}

export interface TaskHistoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/**
 * GET /api/tasks/feed
 * Fetches published tasks eligible for the current authenticated earner.
 */
export async function getTaskFeedApi(): Promise<{
  success: boolean;
  data: { tasks: TaskFeedItem[] };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return { success: true, data: { tasks: DEMO_TASKS } };
  }
  return apiClient<{ success: boolean; data: { tasks: TaskFeedItem[] } }>('/tasks/feed');
}

/**
 * POST /api/tasks/:id/start
 * Claims an assignment slot and issues a unique clickId token.
 */
export async function startTaskApi(taskId: string): Promise<{
  success: boolean;
  data: { assignment: TaskAssignmentResponse };
}> {
  if (useDemoStore.getState().isDemoMode) {
    const task = DEMO_TASKS.find((t) => t.id === taskId) || DEMO_TASKS[0];
    return {
      success: true,
      data: {
        assignment: {
          id: `demo-assignment-${taskId}`,
          taskId,
          title: task.title,
          clickId: `demo-click-${taskId}`,
          status: 'IN_PROGRESS',
          assignedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          dwellTimeRequiredSeconds: task.dwellTimeSeconds,
          dwellTimeAccumulatedSeconds: 0,
          remainingDwellSeconds: task.dwellTimeSeconds,
        },
      },
    };
  }
  return apiClient<{ success: boolean; data: { assignment: TaskAssignmentResponse } }>(
    `/tasks/${taskId}/start`,
    { method: 'POST' }
  );
}

/**
 * POST /api/tasks/:id/verify-action
 * Submits first-party action for server-side dwell time verification with active foreground intervals.
 */
export async function verifyTaskActionApi(
  taskId: string,
  data?: { intervals?: EngagementInterval[] }
): Promise<{
  success: boolean;
  data: {
    completion: {
      id: string;
      status: TaskCompletionStatus;
      rewardPoints: number;
      completedAt: string;
    };
    message?: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        completion: {
          id: `demo-comp-${taskId}`,
          status: 'VERIFIED',
          rewardPoints: 25,
          completedAt: new Date().toISOString(),
        },
        message: 'Demo action verified (Sample Mode)',
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: {
      completion: {
        id: string;
        status: TaskCompletionStatus;
        rewardPoints: number;
        completedAt: string;
      };
      message?: string;
    };
  }>(`/tasks/${taskId}/verify-action`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * POST /api/tasks/:id/heartbeat
 * Syncs foreground active engagement intervals with the server.
 */
export async function heartbeatTaskApi(
  taskId: string,
  data: { intervals?: EngagementInterval[]; activeDurationSeconds?: number }
): Promise<{
  success: boolean;
  data: {
    dwellTimeAccumulatedSeconds: number;
    remainingDwellSeconds: number;
    dwellTimeRequiredSeconds: number;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        dwellTimeAccumulatedSeconds: data.activeDurationSeconds || 5,
        remainingDwellSeconds: 0,
        dwellTimeRequiredSeconds: 5,
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: {
      dwellTimeAccumulatedSeconds: number;
      remainingDwellSeconds: number;
      dwellTimeRequiredSeconds: number;
    };
  }>(`/tasks/${taskId}/heartbeat`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * GET /api/tasks/history
 * Fetches paginated task completions and promotional reward records for the current user.
 */
export async function getTaskHistoryApi(
  page = 1,
  limit = 20
): Promise<{
  success: boolean;
  data: {
    completions: TaskCompletionItem[];
    summary?: TaskSummaryData;
    pagination: TaskHistoryPagination;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        completions: DEMO_HISTORY as unknown as TaskCompletionItem[],
        summary: DEMO_SUMMARY,
        pagination: {
          page: 1,
          limit: 20,
          total: DEMO_HISTORY.length,
          pages: 1,
        },
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: {
      completions: TaskCompletionItem[];
      summary?: TaskSummaryData;
      pagination: TaskHistoryPagination;
    };
  }>(`/tasks/history?page=${page}&limit=${limit}`);
}

/**
 * GET /api/tasks/summary
 * Fetches authoritative aggregate summary of user's task completions and promotional reward points.
 */
export async function getTaskSummaryApi(): Promise<{
  success: boolean;
  data: TaskSummaryData;
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: DEMO_SUMMARY,
    };
  }
  return apiClient<{
    success: boolean;
    data: TaskSummaryData;
  }>('/tasks/summary');
}

/**
 * GET /api/tasks/:id/status
 * Retrieves current assignment and completion status for a specific task.
 */
export async function getTaskStatusApi(taskId: string): Promise<{
  success: boolean;
  data: TaskStatusResponse;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const task = DEMO_TASKS.find((t) => t.id === taskId);
    return {
      success: true,
      data: {
        hasAssignment: true,
        status: 'IN_PROGRESS',
        task: task
          ? {
              id: task.id,
              title: task.title,
              description: task.description,
              category: task.category,
              rewardPoints: task.rewardPoints,
              status: 'PUBLISHED',
              verificationMethod: task.verificationMethod,
              appInstallConfig: task.appInstallConfig,
              campaignName: task.campaignName,
            }
          : undefined,
        assignment: {
          id: `demo-assignment-${taskId}`,
          clickId: `demo-click-${taskId}`,
          status: 'IN_PROGRESS',
          assignedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          hasOpenedStore: true,
          storeVisitedAt: new Date().toISOString(),
        },
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: TaskStatusResponse;
  }>(`/tasks/${taskId}/status`);
}

/**
 * POST /api/tasks/:id/store-visit
 * Authoritatively records official Google Play Store opening and initial package check baseline.
 */
export async function recordStoreVisitApi(
  taskId: string,
  payload?: {
    initialInstallStatus?: 'INSTALLED' | 'NOT_INSTALLED' | 'UNAVAILABLE';
    packageName?: string;
  }
): Promise<{
  success: boolean;
  message?: string;
  data: {
    assignmentId: string;
    hasOpenedStore: boolean;
    storeVisitedAt: string;
    initialInstallStatus?: 'INSTALLED' | 'NOT_INSTALLED' | 'UNAVAILABLE';
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      message: 'Store visit recorded (Sample Mode)',
      data: {
        assignmentId: `demo-assignment-${taskId}`,
        hasOpenedStore: true,
        storeVisitedAt: new Date().toISOString(),
        initialInstallStatus: payload?.initialInstallStatus,
      },
    };
  }
  return apiClient<{
    success: boolean;
    message?: string;
    data: {
      assignmentId: string;
      hasOpenedStore: boolean;
      storeVisitedAt: string;
      initialInstallStatus?: 'INSTALLED' | 'NOT_INSTALLED' | 'UNAVAILABLE';
    };
  }>(`/tasks/${taskId}/store-visit`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

/**
 * POST /api/tasks/:id/verify-install
 * Verifies app installation on device and authoritatively completes task exactly once.
 */
export async function verifyAppInstallApi(
  taskId: string,
  payload: {
    packageName: string;
  }
): Promise<{
  success: boolean;
  message?: string;
  data: {
    status: 'VERIFIED';
    rewardPoints: number;
    completionId: string;
    message: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        status: 'VERIFIED',
        rewardPoints: 20,
        completionId: `demo-comp-${taskId}`,
        message: 'Installation verified! +20 promotional points credited.',
      },
    };
  }
  return apiClient<{
    success: boolean;
    message?: string;
    data: {
      status: 'VERIFIED';
      rewardPoints: number;
      completionId: string;
      message: string;
    };
  }>(`/tasks/${taskId}/verify-install`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/tasks/:id/video-session/start
 * Starts or resumes a server-authoritative video watch session.
 */
export async function startVideoSessionApi(
  taskId: string,
  assignmentId?: string
): Promise<{
  success: boolean;
  data: VideoSessionData;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const task = DEMO_TASKS.find((t) => t.id === taskId) || DEMO_TASKS[0];
    const cfg = task.videoWatchConfig!;
    return {
      success: true,
      data: {
        sessionId: `demo-video-session-${taskId}`,
        taskId,
        assignmentId: assignmentId || `demo-assignment-${taskId}`,
        videoUrl: cfg.videoUrl,
        videoDuration: cfg.videoDurationSeconds,
        requiredWatchSeconds: cfg.requiredWatchSeconds,
        allowSeeking: cfg.allowSeeking,
        completionPolicy: cfg.completionPolicy,
        accumulatedWatchSeconds: 0,
        remainingWatchSeconds: cfg.requiredWatchSeconds,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        isQualified: false,
        hasQuiz: Boolean(cfg.comprehensionQuiz),
        comprehensionQuiz: cfg.comprehensionQuiz,
        quizAnswerCorrect: false,
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: VideoSessionData;
  }>(`/tasks/${taskId}/video-session/start`, {
    method: 'POST',
    body: assignmentId ? JSON.stringify({ assignmentId }) : undefined,
  });
}

/**
 * POST /api/tasks/:id/video-session/progress
 * Sends periodic video playback telemetry beacon to the server.
 */
export async function recordVideoProgressApi(
  taskId: string,
  payload: VideoSessionProgressPayload
): Promise<{
  success: boolean;
  data: VideoSessionProgressResponse;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const isQualified = (payload.playbackPositionSeconds || 0) >= 5;
    return {
      success: true,
      data: {
        sessionId: payload.sessionId,
        accumulatedWatchSeconds: Math.min(5, Math.floor(payload.playbackPositionSeconds || 0)),
        requiredWatchSeconds: 5,
        remainingWatchSeconds: isQualified ? 0 : Math.max(0, 5 - Math.floor(payload.playbackPositionSeconds || 0)),
        isQualified,
        status: 'ACTIVE',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: VideoSessionProgressResponse;
  }>(`/tasks/${taskId}/video-session/progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * GET /api/tasks/:id/video-session/:sessionId
 * Retrieves the current authoritative status of a video session.
 */
export async function getVideoSessionStatusApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  data: VideoSessionData;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const task = DEMO_TASKS.find((t) => t.id === taskId) || DEMO_TASKS[0];
    const cfg = task.videoWatchConfig!;
    return {
      success: true,
      data: {
        sessionId,
        taskId,
        assignmentId: `demo-assignment-${taskId}`,
        videoUrl: cfg.videoUrl,
        videoDuration: cfg.videoDurationSeconds,
        requiredWatchSeconds: cfg.requiredWatchSeconds,
        allowSeeking: cfg.allowSeeking,
        accumulatedWatchSeconds: cfg.requiredWatchSeconds,
        remainingWatchSeconds: 0,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        isQualified: true,
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: VideoSessionData;
  }>(`/tasks/${taskId}/video-session/${sessionId}`);
}

/**
 * POST /api/tasks/:id/video-session/verify
 * Authoritatively verifies video watch completion and triggers promotional reward transaction.
 */
export async function verifyVideoWatchApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  data: {
    completion: {
      id: string;
      taskId: string;
      clickId: string;
      rewardPoints: number;
      status: TaskCompletionStatus;
      completedAt: string;
    };
    session: {
      sessionId: string;
      accumulatedWatchSeconds: number;
      status: string;
    };
    reconciled?: boolean;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        completion: {
          id: `demo-video-comp-${taskId}`,
          taskId,
          clickId: `demo-click-${taskId}`,
          rewardPoints: 50,
          status: 'VERIFIED',
          completedAt: new Date().toISOString(),
        },
        session: {
          sessionId,
          accumulatedWatchSeconds: 5,
          status: 'COMPLETED',
        },
        reconciled: false,
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: {
      completion: {
        id: string;
        taskId: string;
        clickId: string;
        rewardPoints: number;
        status: TaskCompletionStatus;
        completedAt: string;
      };
      session: {
        sessionId: string;
        accumulatedWatchSeconds: number;
        status: string;
      };
      reconciled?: boolean;
    };
  }>(`/tasks/${taskId}/video-session/verify`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

/**
 * POST /api/tasks/:id/article-session/start
 * Starts or resumes a server-authoritative article reading session.
 */
export async function startArticleSessionApi(
  taskId: string,
  assignmentId?: string
): Promise<{
  success: boolean;
  data: ArticleSessionData;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const task = DEMO_TASKS.find((t) => t.id === taskId) || DEMO_TASKS[1];
    const cfg = task.articleReadConfig!;
    return {
      success: true,
      data: {
        sessionId: `demo-article-session-${taskId}`,
        taskId,
        assignmentId: assignmentId || `demo-assignment-${taskId}`,
        articleTitle: cfg.articleTitle,
        articleContent: cfg.articleContent,
        minReadDurationSeconds: cfg.minReadDurationSeconds,
        minScrollPercentage: cfg.minScrollPercentage,
        accumulatedReadSeconds: 0,
        maxScrollPercentage: 0,
        remainingReadSeconds: cfg.minReadDurationSeconds,
        status: 'ACTIVE',
        hasQuiz: true,
        quizQuestion: cfg.comprehensionQuiz?.question,
        quizOptions: cfg.comprehensionQuiz?.options,
        quizAnswered: false,
        quizAnswerCorrect: false,
        quizAttempts: 0,
        quizMaxAttempts: 3,
        isQualified: false,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: ArticleSessionData;
  }>(`/tasks/${taskId}/article-session/start`, {
    method: 'POST',
    body: assignmentId ? JSON.stringify({ assignmentId }) : undefined,
  });
}

/**
 * POST /api/tasks/:id/article-session/progress
 * Sends periodic reading progress and scroll telemetry to the server.
 */
export async function recordArticleProgressApi(
  taskId: string,
  payload: ArticleSessionProgressPayload
): Promise<{
  success: boolean;
  data: ArticleSessionProgressResponse;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const isQualified = (payload.scrollPercentage || 0) >= 80;
    return {
      success: true,
      data: {
        sessionId: payload.sessionId,
        accumulatedReadSeconds: 10,
        maxScrollPercentage: Math.max(80, payload.scrollPercentage || 0),
        remainingReadSeconds: 0,
        isQualified,
        quizRequired: true,
        quizAnswered: true,
        quizAnswerCorrect: true,
        status: 'ACTIVE',
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: ArticleSessionProgressResponse;
  }>(`/tasks/${taskId}/article-session/progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * GET /api/tasks/:id/article-session/:sessionId
 * Retrieves the current authoritative status of an article reading session.
 */
export async function getArticleSessionStatusApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  data: ArticleSessionData;
}> {
  if (useDemoStore.getState().isDemoMode) {
    const task = DEMO_TASKS.find((t) => t.id === taskId) || DEMO_TASKS[1];
    const cfg = task.articleReadConfig!;
    return {
      success: true,
      data: {
        sessionId,
        taskId,
        assignmentId: `demo-assignment-${taskId}`,
        articleTitle: cfg.articleTitle,
        articleContent: cfg.articleContent,
        minReadDurationSeconds: cfg.minReadDurationSeconds,
        minScrollPercentage: cfg.minScrollPercentage,
        accumulatedReadSeconds: 10,
        maxScrollPercentage: 100,
        remainingReadSeconds: 0,
        status: 'ACTIVE',
        hasQuiz: true,
        quizQuestion: cfg.comprehensionQuiz?.question,
        quizOptions: cfg.comprehensionQuiz?.options,
        quizAnswered: true,
        quizAnswerCorrect: true,
        quizAttempts: 1,
        quizMaxAttempts: 3,
        isQualified: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: ArticleSessionData;
  }>(`/tasks/${taskId}/article-session/${sessionId}`);
}

/**
 * POST /api/tasks/:id/article-session/quiz
 * Submits multiple-choice comprehension quiz answer.
 */
export async function submitArticleQuizAnswerApi(
  taskId: string,
  payload: ArticleQuizAnswerPayload
): Promise<{
  success: boolean;
  data: ArticleQuizAnswerResponse;
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        success: true,
        correct: true,
        message: 'Correct! DNS translates domain names to IP addresses (Demo Mode).',
        remainingAttempts: 1,
        isQualified: true,
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: ArticleQuizAnswerResponse;
  }>(`/tasks/${taskId}/article-session/quiz`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/tasks/:id/article-session/verify
 * Authoritatively verifies article read completion and awards promotional points.
 */
export async function verifyArticleReadApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  data: {
    completion: {
      id: string;
      taskId: string;
      clickId: string;
      rewardPoints: number;
      status: TaskCompletionStatus;
      completedAt: string;
    };
    session: {
      sessionId: string;
      accumulatedReadSeconds: number;
      maxScrollPercentage: number;
      status: string;
    };
    reconciled?: boolean;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        completion: {
          id: `demo-article-comp-${taskId}`,
          taskId,
          clickId: `demo-click-${taskId}`,
          rewardPoints: 25,
          status: 'VERIFIED',
          completedAt: new Date().toISOString(),
        },
        session: {
          sessionId,
          accumulatedReadSeconds: 10,
          maxScrollPercentage: 100,
          status: 'COMPLETED',
        },
        reconciled: false,
      },
    };
  }
  return apiClient<{
    success: boolean;
    data: {
      completion: {
        id: string;
        taskId: string;
        clickId: string;
        rewardPoints: number;
        status: TaskCompletionStatus;
        completedAt: string;
      };
      session: {
        sessionId: string;
        accumulatedReadSeconds: number;
        maxScrollPercentage: number;
        status: string;
      };
      reconciled?: boolean;
    };
  }>(`/tasks/${taskId}/article-session/verify`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

/**
 * POST /api/tasks/:id/video-session/quiz
 * Submits the user's answer to the video learning comprehension question.
 */
export async function submitVideoQuizAnswerApi(
  taskId: string,
  sessionIdOrPayload: string | { sessionId: string; selectedOptionIndex: number },
  selectedOptionIndex?: number
): Promise<{
  success: boolean;
  data: {
    isCorrect: boolean;
    attemptsCount: number;
    message: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        isCorrect: true,
        attemptsCount: 1,
        message: 'Correct answer verified (Demo Mode)',
      },
    };
  }

  const body =
    typeof sessionIdOrPayload === 'string'
      ? { sessionId: sessionIdOrPayload, selectedOptionIndex: selectedOptionIndex ?? 0 }
      : sessionIdOrPayload;

  return apiClient<{
    success: boolean;
    data: {
      isCorrect: boolean;
      attemptsCount: number;
      message: string;
    };
  }>(`/tasks/${taskId}/video-session/quiz`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * POST /api/tasks/:id/app-feedback/submit
 * Submits user testing feedback and awards promotional points or queues for manual review.
 */
export async function submitAppFeedbackApi(
  taskId: string,
  payload: {
    feedback: string;
    rating?: number;
    answer?: string;
    completionCode?: string;
  }
): Promise<{
  success: boolean;
  data: {
    status: 'VERIFIED' | 'PENDING_REVIEW';
    rewardPoints: number;
    completionId: string;
    message: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        status: 'VERIFIED',
        rewardPoints: 25,
        completionId: `demo-feedback-comp-${taskId}`,
        message: 'Feedback submitted and points credited (Demo Mode)',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: {
      status: 'VERIFIED' | 'PENDING_REVIEW';
      rewardPoints: number;
      completionId: string;
      message: string;
    };
  }>(`/tasks/${taskId}/app-feedback/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/tasks/:id/youtube-session/start
 * Initializes educational YouTube video learning session.
 */
export async function startYouTubeSessionApi(taskId: string): Promise<{
  success: boolean;
  data: {
    sessionId: string;
    taskId: string;
    assignmentId?: string;
    youtubeConfig: {
      youtubeUrl: string;
      videoId: string;
      videoTitle: string;
      sessionDurationSeconds: number;
      requiredDurationSeconds: number;
      instructions?: string;
      educationalNotice?: string;
      comprehensionQuiz?: {
        question: string;
        options: string[];
      };
    };
    accumulatedSeconds: number;
    status: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        sessionId: `demo-yt-session-${taskId}`,
        taskId,
        youtubeConfig: {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          videoId: 'dQw4w9WgXcQ',
          videoTitle: 'Educational Learning Session',
          sessionDurationSeconds: 45,
          requiredDurationSeconds: 45,
          comprehensionQuiz: {
            question: 'What is the safest action when an unknown caller asks for your OTP?',
            options: [
              'Never share the OTP with anyone under any circumstances',
              'Share only if the caller claims to be bank security',
              'Share only the first 2 digits',
              'Email the OTP',
            ],
          },
        },
        accumulatedSeconds: 0,
        status: 'IN_PROGRESS',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: {
      sessionId: string;
      taskId: string;
      assignmentId?: string;
      youtubeConfig: {
        youtubeUrl: string;
        videoId: string;
        videoTitle: string;
        sessionDurationSeconds: number;
        requiredDurationSeconds: number;
        instructions?: string;
        educationalNotice?: string;
        comprehensionQuiz?: {
          question: string;
          options: string[];
        };
      };
      accumulatedSeconds: number;
      status: string;
      isCompleted?: boolean;
      rewardGranted?: boolean;
    };
  }>(`/tasks/${taskId}/youtube-session/start`, {
    method: 'POST',
  });
}

/**
 * POST /api/tasks/:id/youtube-session/progress
 * Heartbeat recording educational session engagement time.
 */
export async function recordYouTubeProgressApi(
  taskId: string,
  sessionId: string,
  accumulatedSeconds: number
): Promise<{
  success: boolean;
  data: {
    sessionId: string;
    accumulatedSeconds: number;
    requiredDurationSeconds: number;
    isDurationMet: boolean;
    status: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        sessionId,
        accumulatedSeconds,
        requiredDurationSeconds: 45,
        isDurationMet: accumulatedSeconds >= 45,
        status: 'IN_PROGRESS',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: {
      sessionId: string;
      accumulatedSeconds: number;
      requiredDurationSeconds: number;
      isDurationMet: boolean;
      status: string;
    };
  }>(`/tasks/${taskId}/youtube-session/progress`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, accumulatedSeconds }),
  });
}

/**
 * GET /api/tasks/:id/youtube-session/status
 * Fetches current session status and quiz verification state.
 */
export async function getYouTubeSessionStatusApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  data: {
    sessionId: string;
    accumulatedSeconds: number;
    requiredDurationSeconds: number;
    isDurationMet: boolean;
    isQuizAnswered: boolean;
    status: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        sessionId,
        accumulatedSeconds: 45,
        requiredDurationSeconds: 45,
        isDurationMet: true,
        isQuizAnswered: true,
        status: 'READY_TO_CLAIM',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: {
      sessionId: string;
      accumulatedSeconds: number;
      requiredDurationSeconds: number;
      isDurationMet: boolean;
      isQuizAnswered: boolean;
      status: string;
    };
  }>(`/tasks/${taskId}/youtube-session/status?sessionId=${encodeURIComponent(sessionId)}`);
}

/**
 * POST /api/tasks/:id/youtube-session/quiz
 * Submits the user's answer to the YouTube comprehension question.
 */
export async function submitYouTubeQuizAnswerApi(
  taskId: string,
  sessionId: string,
  selectedOptionIndex: number
): Promise<{
  success: boolean;
  data: {
    isCorrect: boolean;
    attemptsCount: number;
    message: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        isCorrect: true,
        attemptsCount: 1,
        message: 'Quiz answer verified (Demo Mode)',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: {
      isCorrect: boolean;
      attemptsCount: number;
      message: string;
    };
  }>(`/tasks/${taskId}/youtube-session/quiz`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, selectedOptionIndex }),
  });
}

/**
 * POST /api/tasks/:id/youtube-learning/verify
 * Final verification of educational session & quiz completion, creating a double-entry ledger reward.
 */
export async function verifyYouTubeLearningApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  data: {
    status: 'VERIFIED';
    rewardPoints: number;
    completionId: string;
    message: string;
  };
}> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        status: 'VERIFIED',
        rewardPoints: 250,
        completionId: `demo-yt-comp-${taskId}`,
        message: 'Educational video learning verified and rewards credited! (Demo Mode)',
      },
    };
  }

  return apiClient<{
    success: boolean;
    data: {
      status: 'VERIFIED';
      rewardPoints: number;
      completionId: string;
      message: string;
    };
  }>(`/tasks/${taskId}/youtube-learning/verify`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export interface ExternalLinkSessionData {
  sessionId: string;
  attemptId?: string;
  attemptStatus?: string;
  message?: string;
  taskId: string;
  assignmentId?: string;
  targetUrl: string;
  category: string;
  requiredDurationSeconds: number;
  startedAt: string;
  linkLaunched: boolean;
  linkLaunchedAt?: string;
  launchFailure?: boolean;
  launchFailureReason?: string;
  accumulatedAwaySeconds?: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  isDurationMet: boolean;
  isAway?: boolean;
  resumed?: boolean;
  status?: string;
  isCompleted?: boolean;
  rewardGranted?: boolean;
}

/**
 * POST /api/tasks/:id/external-link/start
 */
export async function startExternalLinkSessionApi(taskId: string): Promise<{
  success: boolean;
  data: ExternalLinkSessionData;
}> {
  return apiClient<{ success: boolean; data: ExternalLinkSessionData }>(`/tasks/${taskId}/external-link/start`, {
    method: 'POST',
  });
}

/**
 * POST /api/tasks/:id/external-link/launch
 */
export async function reportExternalLinkLaunchApi(
  taskId: string,
  sessionId: string,
  success: boolean,
  failureReason?: string
): Promise<{
  success: boolean;
  data: {
    sessionId: string;
    attemptId?: string;
    attemptStatus?: string;
    linkLaunched: boolean;
    linkLaunchedAt?: string;
    launchFailure: boolean;
    launchFailureReason?: string;
    accumulatedAwaySeconds?: number;
    elapsedSeconds: number;
    remainingSeconds: number;
    isDurationMet: boolean;
    isAway?: boolean;
  };
}> {
  return apiClient(`/tasks/${taskId}/external-link/launch`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, success, failureReason }),
  });
}

/**
 * POST /api/tasks/:id/external-link/return
 * Closes attempt, invalidates if returned early or confirms single uninterrupted duration.
 */
export async function reportExternalLinkReturnApi(
  taskId: string,
  sessionId?: string,
  attemptId?: string
): Promise<{
  success: boolean;
  data: ExternalLinkSessionData;
}> {
  return apiClient(`/tasks/${taskId}/external-link/return`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, attemptId }),
  });
}

/**
 * GET /api/tasks/:id/external-link/status
 */
export async function getExternalLinkSessionStatusApi(
  taskId: string,
  sessionId?: string
): Promise<{
  success: boolean;
  data: ExternalLinkSessionData;
}> {
  const url = sessionId
    ? `/tasks/${taskId}/external-link/${sessionId}`
    : `/tasks/${taskId}/external-link/status`;
  return apiClient(url);
}

/**
 * POST /api/tasks/:id/external-link/verify
 */
export async function verifyExternalLinkElapsedApi(
  taskId: string,
  sessionId: string
): Promise<{
  success: boolean;
  status: 'COMPLETED' | 'INCOMPLETE' | 'NOT_ELIGIBLE';
  message?: string;
  data: {
    completionId?: string;
    rewardPoints?: number;
    evidenceId?: string;
    evidenceLabel?: string;
    sessionId?: string;
    elapsedSeconds?: number;
    requiredDurationSeconds?: number;
    remainingSeconds?: number;
  };
}> {
  return apiClient(`/tasks/${taskId}/external-link/verify`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}


