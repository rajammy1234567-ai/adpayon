import { create } from 'zustand';
import { UserProfile } from '@adpayon/shared';
import {
  AuthTokens,
  BackendUser,
  getProfileApi,
  logoutApi,
  mapBackendUserToProfile,
} from '../services/api/auth.api';
import { setAccessToken } from '../services/api/client';
import {
  clearRefreshToken,
  getRefreshToken,
  setRefreshToken,
} from '../services/storage/secureStorage';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  initializeAuth: () => Promise<boolean>;
  setAuthSession: (backendUser: BackendUser, tokens: AuthTokens) => Promise<void>;
  login: (user: UserProfile, token: string) => void;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<UserProfile>) => void;
  unlockDashboard: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,

  /**
   * Initializes authentication state on app launch by rehydrating the refresh
   * token from hardware-backed secure storage and validating against the backend.
   */
  initializeAuth: async () => {
    set({ isLoading: true });
    const minSplashDelay = new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const persistedRefreshToken = await getRefreshToken();
      if (!persistedRefreshToken) {
        await minSplashDelay;
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
        return false;
      }

      // Validate session and retrieve live profile from backend (triggers refresh under the hood if required)
      const profileResponse = await getProfileApi();
      await minSplashDelay;
      if (profileResponse.success && profileResponse.data?.user) {
        const userProfile = mapBackendUserToProfile(profileResponse.data.user);
        set({
          user: userProfile,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });
        return true;
      }

      // If profile could not be validated, clean up stale tokens
      await clearRefreshToken();
      setAccessToken(null);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
      return false;
    } catch {
      await minSplashDelay;
      // In case of network failure or invalid session during rehydration
      await clearRefreshToken();
      setAccessToken(null);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
      return false;
    }
  },

  /**
   * Establishes an authenticated session: stores access token in memory,
   * stores refresh token in secure storage, and sets user profile in state.
   */
  setAuthSession: async (backendUser: BackendUser, tokens: AuthTokens) => {
    setAccessToken(tokens.accessToken);
    await setRefreshToken(tokens.refreshToken);
    const userProfile = mapBackendUserToProfile(backendUser);

    set({
      user: userProfile,
      token: tokens.accessToken,
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
    });
  },

  /**
   * Backward-compatible login helper.
   */
  login: (user, token) => {
    setAccessToken(token);
    set({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
    });
  },

  /**
   * Completely tears down authenticated session on device and backend.
   */
  logout: async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await logoutApi(refreshToken).catch(() => {});
      }
    } catch {
      // Silent error during network logout
    } finally {
      await clearRefreshToken();
      setAccessToken(null);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  updateUser: (patch) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...patch } : null,
    })),

  unlockDashboard: () =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            dashboardUnlocked: true,
            isActive: true,
            signupBonusClaimed: true,
          }
        : null,
    })),
}));
