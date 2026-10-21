import { apiClient } from './client';
import { UserProfile } from '@adpayon/shared';
import { useDemoStore } from '../../store/demoStore';

export interface BackendUser {
  id: string;
  mobile: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'SUPPORT' | 'FINANCE_AUDITOR';
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  referralCode: string;
  sponsorId: string | null;
  directReferralsCount?: number;
  metadata?: {
    language?: 'hi' | 'en';
    kycStatus?: 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  };
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string;
}

export interface RegisterPayload {
  name: string;
  mobile: string;
  password: string;
  sponsorReferralCode?: string;
  leg?: 'LEFT' | 'RIGHT'; // Deprecated optional leg
  acceptTerms: boolean;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    userId: string;
    mobile: string;
    status: string;
  };
}

export interface SendOtpPayload {
  mobile: string;
  purpose: 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET';
}

export interface SendOtpResponse {
  success: boolean;
  message: string;
  data: {
    mobile: string;
  };
}

export interface VerifyOtpPayload {
  mobile: string;
  otp: string;
  purpose: 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET';
}

export interface AuthSessionResponse {
  success: boolean;
  message: string;
  data: {
    tokens: AuthTokens;
    user: BackendUser;
  };
}

export interface LoginPayload {
  mobile: string;
  password: string;
}

export interface GetProfileResponse {
  success: boolean;
  data: {
    user: BackendUser;
  };
}

/**
 * Maps backend user document representation to mobile UI UserProfile.
 */
export function mapBackendUserToProfile(backendUser: BackendUser): UserProfile {
  const strippedMobile = backendUser.mobile.replace(/^\+91/, '');
  return {
    id: backendUser.id,
    name: backendUser.name,
    mobile: strippedMobile,
    countryCode: '+91',
    role: (backendUser.role === 'FINANCE_AUDITOR' ? 'SUPPORT' : backendUser.role) as any,
    status: backendUser.status === 'PENDING_VERIFICATION' ? 'INACTIVE' : (backendUser.status as any),
    isActive: backendUser.status === 'ACTIVE',
    referralCode: backendUser.referralCode,
    sponsorId: backendUser.sponsorId,
    parentId: null,
    leg: null,
    materializedPath: '',
    depth: 1,
    binaryStats: {
      leftCount: 0,
      rightCount: 0,
      leftVolumeUnits: 0,
      rightVolumeUnits: 0,
      leftCarryForwardUnits: 0,
      rightCarryForwardUnits: 0,
      lifetimeMatchedVolumeUnits: 0,
    },
    directReferralsCount: backendUser.directReferralsCount || 0,
    currentRank: 'NONE',
    deviceId: '',
    signupBonusClaimed: false,
    dashboardUnlocked: backendUser.status === 'ACTIVE',
    streakCount: 0,
    isKycVerified: backendUser.metadata?.kycStatus === 'VERIFIED',
    kycDetails: {
      status: backendUser.metadata?.kycStatus || 'NOT_SUBMITTED',
    },
    createdAt: backendUser.createdAt,
  };
}

export async function registerApi(payload: RegisterPayload): Promise<RegisterResponse> {
  return apiClient<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
    requiresAuth: false,
  });
}

export async function sendOtpApi(payload: SendOtpPayload): Promise<SendOtpResponse> {
  return apiClient<SendOtpResponse>('/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify(payload),
    requiresAuth: false,
  });
}

export async function verifyOtpApi(payload: VerifyOtpPayload): Promise<AuthSessionResponse> {
  return apiClient<AuthSessionResponse>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
    requiresAuth: false,
  });
}

export async function loginApi(payload: LoginPayload): Promise<AuthSessionResponse> {
  return apiClient<AuthSessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    requiresAuth: false,
  });
}

export async function logoutApi(refreshToken?: string): Promise<{ success: boolean }> {
  return apiClient<{ success: boolean }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
    requiresAuth: true,
  });
}

export async function getProfileApi(): Promise<GetProfileResponse> {
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        user: {
          id: 'demo_client_reviewer',
          mobile: '+919876543210',
          name: 'Client Demo Reviewer',
          role: 'USER',
          status: 'ACTIVE',
          referralCode: 'DEMO777',
          sponsorId: null,
          directReferralsCount: 0,
          metadata: {
            language: 'en',
            kycStatus: 'VERIFIED',
          },
          createdAt: new Date().toISOString(),
        },
      },
    };
  }
  return apiClient<GetProfileResponse>('/auth/me', {
    method: 'GET',
    requiresAuth: true,
  });
}

