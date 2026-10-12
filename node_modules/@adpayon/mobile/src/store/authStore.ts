import { create } from 'zustand';
import { UserProfile } from '@adpayon/shared';
import { MOCK_USER_PROFILE } from '../services/mockData';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  updateUser: (patch: Partial<UserProfile>) => void;
  unlockDashboard: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: MOCK_USER_PROFILE,
  token: 'mock-jwt-token-adpayon-session',
  isAuthenticated: true,
  isLoading: false,

  login: (user, token) =>
    set({
      user,
      token,
      isAuthenticated: true,
    }),

  logout: () =>
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    }),

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
