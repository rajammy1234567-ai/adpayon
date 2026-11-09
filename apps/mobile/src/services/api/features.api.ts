import { apiClient } from './client';
import {
  AttendanceStatusResponse,
  SponsoredBannerItem,
  PlayEarnActivityInfo,
  PlayEarnSpinResult,
  PlayEarnScratchCard,
  PlayEarnQuizQuestion,
  VideoContentItem,
  ShoppingMerchantItem,
  CashbackClaimItem,
  ReferralLeaderboardEntry,
} from '@adpayon/shared';

// Attendance
export async function getAttendanceStatusApi(): Promise<AttendanceStatusResponse> {
  const res = await apiClient<{ success: boolean; data: AttendanceStatusResponse }>('/attendance/status', {
    requiresAuth: true,
  });
  return res.data;
}

export async function claimAttendanceApi(): Promise<{
  message: string;
  currentStreak: number;
  dayOfCycle: number;
  pointsAwarded: number;
  usdValue: number;
  claimedToday: boolean;
}> {
  const res = await apiClient<{ success: boolean; data: any }>('/attendance/check-in', {
    method: 'POST',
    requiresAuth: true,
  });
  return res.data;
}

// Banners
export async function getSponsoredBannersApi(): Promise<SponsoredBannerItem[]> {
  const res = await apiClient<{ success: boolean; data: SponsoredBannerItem[] }>('/banners');
  return res.data || [];
}

export async function trackBannerClickApi(id: string): Promise<void> {
  try {
    await apiClient(`/banners/${id}/click`, { method: 'POST' });
  } catch {
    // Non-blocking
  }
}

// Play & Earn Activities
export async function getPlayEarnActivitiesApi(): Promise<PlayEarnActivityInfo[]> {
  const res = await apiClient<{ success: boolean; data: PlayEarnActivityInfo[] }>('/play-earn/activities', {
    requiresAuth: true,
  });
  return res.data || [];
}

export async function spinWheelApi(): Promise<PlayEarnSpinResult> {
  const res = await apiClient<{ success: boolean; data: PlayEarnSpinResult }>('/play-earn/spin', {
    method: 'POST',
    requiresAuth: true,
  });
  return res.data;
}

export async function scratchCardApi(): Promise<PlayEarnScratchCard> {
  const res = await apiClient<{ success: boolean; data: PlayEarnScratchCard }>('/play-earn/scratch', {
    method: 'POST',
    requiresAuth: true,
  });
  return res.data;
}

export async function validatePuzzleApi(data: {
  finalBoard: number[];
  moves: number;
  elapsedSeconds: number;
}): Promise<{ pointsAwarded: number; usdValue: number; message: string; remainingAttempts: number }> {
  const res = await apiClient<{ success: boolean; data: any }>('/play-earn/puzzle/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    requiresAuth: true,
  });
  return res.data;
}

export async function getQuizQuestionsApi(): Promise<{ questions: PlayEarnQuizQuestion[]; remainingAttempts: number }> {
  const res = await apiClient<{ success: boolean; data: any }>('/play-earn/quiz/questions', {
    requiresAuth: true,
  });
  return res.data;
}

export async function submitQuizAnswersApi(answers: Record<string, number>): Promise<{
  correctCount: number;
  totalQuestions: number;
  pointsAwarded: number;
  usdValue: number;
  message: string;
  remainingAttempts: number;
}> {
  const res = await apiClient<{ success: boolean; data: any }>('/play-earn/quiz/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
    requiresAuth: true,
  });
  return res.data;
}

// Video Content
export async function getPublishedVideosApi(category?: string): Promise<VideoContentItem[]> {
  const q = category && category !== 'ALL' ? `?category=${encodeURIComponent(category)}` : '';
  const res = await apiClient<{ success: boolean; data: VideoContentItem[] }>(`/videos${q}`);
  return res.data || [];
}

// Shopping & Cashback
export async function getShoppingMerchantsApi(): Promise<ShoppingMerchantItem[]> {
  const res = await apiClient<{ success: boolean; data: ShoppingMerchantItem[] }>('/shopping/merchants');
  return res.data || [];
}

export async function submitCashbackClaimApi(data: {
  merchantId: string;
  orderId: string;
  orderAmount: number;
  currency?: string;
  claimedPoints: number;
  proofFileId?: string;
  proofUrl?: string;
  notes?: string;
}): Promise<any> {
  const res = await apiClient<{ success: boolean; data: any }>('/shopping/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    requiresAuth: true,
  });
  return res.data;
}

export async function getUserCashbackClaimsApi(): Promise<CashbackClaimItem[]> {
  const res = await apiClient<{ success: boolean; data: CashbackClaimItem[] }>('/shopping/my-claims', {
    requiresAuth: true,
  });
  return res.data || [];
}

// Leaderboard
export async function getReferralLeaderboardApi(): Promise<ReferralLeaderboardEntry[]> {
  const res = await apiClient<{ success: boolean; data: ReferralLeaderboardEntry[] }>('/referrals/leaderboard', {
    requiresAuth: true,
  });
  return res.data || [];
}

