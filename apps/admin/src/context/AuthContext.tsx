import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, STORAGE_KEYS } from '../services/api';
import { AdminUser } from '../types';

interface AuthContextType {
  admin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    mobile: string,
    password: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ) => Promise<{
    mfaRequired: boolean;
    mfaSessionToken: string;
    maskedMobile: string;
    message: string;
  }>;
  verifyMfa: (
    mfaSessionToken: string,
    otp: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ) => Promise<AdminUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initAuth() {
      if (api.hasToken()) {
        try {
          const res = await api.getMe();
          if (res.success && res.data.admin) {
            setAdmin(res.data.admin);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.data.admin));
          } else {
            api.clearTokens();
            setAdmin(null);
          }
        } catch {
          api.clearTokens();
          setAdmin(null);
        }
      } else {
        setAdmin(null);
      }
      setIsLoading(false);
    }
    initAuth();
  }, []);

  const login = async (
    mobile: string,
    password: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ) => {
    const res = await api.login(mobile, password, options);
    return res.data;
  };

  const verifyMfa = async (
    mfaSessionToken: string,
    otp: string,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ) => {
    const res = await api.verifyMfa(mfaSessionToken, otp, options);
    setAdmin(res.data.admin);
    return res.data.admin;
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setAdmin(null);
      window.location.href = '/login';
    }
  };

  const refreshProfile = async () => {
    const res = await api.getMe();
    if (res.success && res.data.admin) {
      setAdmin(res.data.admin);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.data.admin));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        isAuthenticated: !!admin,
        isLoading,
        login,
        verifyMfa,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
