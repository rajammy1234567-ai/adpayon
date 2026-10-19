import { apiClient } from './client';

export type TaskCategory = 'IN_APP_ACTION' | 'PARTNER_WEBHOOK' | 'SURVEY' | 'MANUAL_VERIFY';
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
  };
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
    pagination: TaskHistoryPagination;
  };
}> {
  return apiClient<{
    success: boolean;
    data: {
      completions: TaskCompletionItem[];
      pagination: TaskHistoryPagination;
    };
  }>(`/tasks/history?page=${page}&limit=${limit}`);
}

/**
 * GET /api/tasks/:id/status
 * Retrieves current assignment and completion status for a specific task.
 */
export async function getTaskStatusApi(taskId: string): Promise<{
  success: boolean;
  data: TaskStatusResponse;
}> {
  return apiClient<{
    success: boolean;
    data: TaskStatusResponse;
  }>(`/tasks/${taskId}/status`);
}
