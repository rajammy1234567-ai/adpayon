import {
  Campaign,
  Task,
  TaskCompletion,
  AdminAuditLog,
  PlatformMetrics,
  AdminUser,
  Pagination,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  public code?: string;
  public details?: any;
  public fieldErrors?: Record<string, string>;

  constructor(message: string, code?: string, details?: any, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.fieldErrors = fieldErrors;
  }
}

export const isSandboxMode =
  import.meta.env.VITE_APP_ENV === 'sandbox' ||
  (typeof window !== 'undefined' && window.location.port === '5174');

const STORAGE_PREFIX = isSandboxMode ? 'adpayon_sandbox_admin_' : 'adpayon_admin_';

export const STORAGE_KEYS = {
  ACCESS_TOKEN: `${STORAGE_PREFIX}access_token`,
  REFRESH_TOKEN: `${STORAGE_PREFIX}refresh_token`,
  USER: `${STORAGE_PREFIX}user`,
};

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    this.refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  public setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh);
  }

  public clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }

  public hasToken(): boolean {
    return !!this.accessToken;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    let response = await fetch(`${API_BASE}${endpoint}`, config);

    // Automatic token rotation on 401 Unauthorized
    if (response.status === 401 && this.refreshToken && !endpoint.includes('/auth/')) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await fetch(`${API_BASE}${endpoint}`, { ...config, headers });
      } else {
        this.clearTokens();
        window.location.href = '/login';
        throw new Error('Session expired. Please log in again.');
      }
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error?.message || data.error?.code || `Request failed with status ${response.status}`;
      throw new ApiError(errorMsg, data.error?.code, data.error?.details, data.error?.fieldErrors);
    }

    return data;
  }

  private async tryRefreshToken(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const body = await res.json();
      if (body.success && body.data?.tokens) {
        this.setTokens(body.data.tokens.accessToken, body.data.tokens.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // --- Auth Endpoints ---
  public async login(mobile: string, password: string) {
    return this.request<{
      success: boolean;
      data: { mfaRequired: boolean; mfaSessionToken: string; maskedMobile: string; message: string };
    }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mobile, password }),
    });
  }

  public async verifyMfa(mfaSessionToken: string, otp: string) {
    const res = await this.request<{
      success: boolean;
      data: { accessToken: string; refreshToken: string; admin: AdminUser };
    }>('/admin/auth/mfa-verify', {
      method: 'POST',
      body: JSON.stringify({ mfaSessionToken, otp }),
    });
    if (res.success && res.data.accessToken) {
      this.setTokens(res.data.accessToken, res.data.refreshToken);
      localStorage.setItem('adpayon_admin_user', JSON.stringify(res.data.admin));
    }
    return res;
  }

  public async logout() {
    try {
      if (this.refreshToken) {
        await this.request('/admin/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });
      }
    } finally {
      this.clearTokens();
    }
  }

  public async getMe() {
    return this.request<{ success: boolean; data: { admin: AdminUser } }>('/admin/auth/me');
  }

  // --- Metrics ---
  public async getMetrics() {
    return this.request<{ success: boolean; data: PlatformMetrics }>('/admin/metrics');
  }

  // --- Campaigns ---
  public async listCampaigns(query: { page?: number; limit?: number; status?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page) params.set('page', query.page.toString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.status && query.status !== 'ALL') params.set('status', query.status);

    return this.request<{
      success: boolean;
      data: { campaigns: Campaign[]; pagination: Pagination };
    }>(`/admin/campaigns?${params.toString()}`);
  }

  public async getCampaign(id: string) {
    return this.request<{ success: boolean; data: { campaign: Campaign } }>(`/admin/campaigns/${id}`);
  }

  public async createCampaign(data: {
    name: string;
    advertiserName: string;
    description?: string;
    advertiserBudgetPaise: number;
    authorizedAgreementRef?: string;
    isSandbox?: boolean;
    startDate?: string;
    endDate?: string;
  }) {
    return this.request<{ success: boolean; data: { campaign: Campaign } }>('/admin/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateCampaign(id: string, data: Partial<Campaign>) {
    return this.request<{ success: boolean; data: { campaign: Campaign } }>(`/admin/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  public async revealCampaignSecret(id: string) {
    return this.request<{ success: boolean; data: { campaignId: string; webhookSecret: string } }>(
      `/admin/campaigns/${id}/reveal-secret`,
      { method: 'POST' }
    );
  }

  // --- Tasks ---
  public async listTasks(query: { page?: number; limit?: number; campaignId?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page) params.set('page', query.page.toString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.campaignId) params.set('campaignId', query.campaignId);
    if (query.status && query.status !== 'ALL') params.set('status', query.status);

    return this.request<{
      success: boolean;
      data: { tasks: Task[]; pagination: Pagination };
    }>(`/admin/tasks?${params.toString()}`);
  }

  public async getTask(id: string) {
    return this.request<{ success: boolean; data: { task: Task } }>(`/admin/tasks/${id}`);
  }

  public async createTask(data: {
    campaignId: string;
    title: string;
    description: string;
    category: string;
    verificationMethod: string;
    rewardPoints: number;
    totalCap: number;
    dailyCapPerUser: number;
    dwellTimeSeconds: number;
    targeting?: {
      minAncestryDepth?: number;
      kycRequired?: boolean;
      allowedStates?: string[];
    };
    externalActionUrl?: string;
    instructions?: string;
  }) {
    return this.request<{ success: boolean; data: { task: Task } }>('/admin/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateTask(id: string, data: Partial<Task>) {
    return this.request<{ success: boolean; data: { task: Task } }>(`/admin/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  public async publishTask(id: string) {
    return this.request<{ success: boolean; data: { task: Task } }>(`/admin/tasks/${id}/publish`, {
      method: 'POST',
    });
  }

  public async pauseTask(id: string) {
    return this.request<{ success: boolean; data: { task: Task } }>(`/admin/tasks/${id}/pause`, {
      method: 'POST',
    });
  }

  // --- Completions & Review Queue ---
  public async listCompletions(query: {
    page?: number;
    limit?: number;
    status?: string;
    verificationMethod?: string;
    taskId?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (query.page) params.set('page', query.page.toString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.status && query.status !== 'ALL') params.set('status', query.status);
    if (query.verificationMethod && query.verificationMethod !== 'ALL') {
      params.set('verificationMethod', query.verificationMethod);
    }
    if (query.taskId) params.set('taskId', query.taskId);

    return this.request<{
      success: boolean;
      data: { completions: TaskCompletion[]; pagination: Pagination };
    }>(`/admin/tasks/completions?${params.toString()}`);
  }

  public async reviewCompletion(id: string, data: {
    status: 'VERIFIED' | 'REJECTED';
    adminReviewNotes: string;
    rejectionReason?: string;
  }) {
    return this.request<{ success: boolean; data: { completion: any } }>(
      `/admin/tasks/completions/${id}/review`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  // --- Audit Logs ---
  public async listAuditLogs(query: { page?: number; limit?: number; action?: string; targetEntity?: string } = {}) {
    const params = new URLSearchParams();
    if (query.page) params.set('page', query.page.toString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.action) params.set('action', query.action);
    if (query.targetEntity) params.set('targetEntity', query.targetEntity);

    return this.request<{
      success: boolean;
      data: { logs: AdminAuditLog[]; pagination: Pagination };
    }>(`/admin/audit-logs?${params.toString()}`);
  }
}

export const api = new ApiClient();
