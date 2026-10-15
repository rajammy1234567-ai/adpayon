import { API_BASE_URL, API_REQUEST_TIMEOUT_MS } from './config';
import { getRefreshToken, setRefreshToken, clearRefreshToken } from '../storage/secureStorage';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// In-memory access token storage (Strict security: Access token is never persisted to disk/AsyncStorage)
let inMemoryAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

// Single-flight refresh coordination to prevent concurrent token rotation race conditions
let activeRefreshPromise: Promise<string | null> | null = null;

export interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
  skipRefreshOn401?: boolean;
}

/**
 * Executes token refresh via single-flight promise.
 */
async function performTokenRefresh(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const persistedRefreshToken = await getRefreshToken();
      if (!persistedRefreshToken) {
        return null;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: persistedRefreshToken }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        // Refresh token revoked, expired, or reuse detected
        await clearRefreshToken();
        setAccessToken(null);
        return null;
      }

      const data = (await response.json()) as {
        success: boolean;
        data?: {
          tokens: {
            accessToken: string;
            refreshToken: string;
          };
        };
      };

      if (data.data?.tokens) {
        const newAccessToken = data.data.tokens.accessToken;
        const newRefreshToken = data.data.tokens.refreshToken;
        setAccessToken(newAccessToken);
        await setRefreshToken(newRefreshToken);
        return newAccessToken;
      }

      return null;
    } catch {
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Universal mobile HTTP client with:
 * - Request timeout enforcement
 * - Automatic Authorization header injection
 * - Single-flight 401 token refresh & retry
 * - Structured error handling
 * - Zero logging of sensitive payloads/tokens
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { requiresAuth = true, skipRefreshOn401 = false, headers, ...restOptions } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (requiresAuth && inMemoryAccessToken) {
    requestHeaders['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...restOptions,
      headers: requestHeaders,
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError(408, 'REQUEST_TIMEOUT', 'Network request timed out. Please check your connection.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach AdPayOn server. Please verify your connection.');
  } finally {
    clearTimeout(timeoutId);
  }

  // Handle 401 Unauthorized with token refresh if authentication is required
  if (response.status === 401 && requiresAuth && !skipRefreshOn401) {
    const newAccessToken = await performTokenRefresh();
    if (newAccessToken) {
      // Replay original request with refreshed token
      return apiClient<T>(endpoint, {
        ...options,
        skipRefreshOn401: true, // Prevent infinite refresh loops
      });
    }
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorCode = body?.error?.code || `HTTP_${response.status}`;
    const errorMessage =
      body?.error?.message ||
      body?.message ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, errorCode, errorMessage, body?.error?.details);
  }

  return body as T;
}
