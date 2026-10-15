import { apiClient } from './client';
import { ReferralSummaryResponse, ReferralTreeNode } from '@adpayon/shared';

export interface DirectReferralsResponse {
  success: boolean;
  data: {
    items: ReferralTreeNode[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface TreeChildrenResponse {
  success: boolean;
  data: {
    nodeId: string;
    children: ReferralTreeNode[];
  };
}

export interface SummaryApiResponse {
  success: boolean;
  data: ReferralSummaryResponse;
}

/**
 * Fetches referral summary metrics (Directs, Downline, Referral code, Sponsor).
 */
export async function getReferralSummaryApi(): Promise<SummaryApiResponse> {
  return apiClient<SummaryApiResponse>('/referrals/summary', {
    method: 'GET',
    requiresAuth: true,
  });
}

/**
 * Fetches paginated direct referrals (Level 1).
 */
export async function getDirectReferralsApi(
  page = 1,
  limit = 20
): Promise<DirectReferralsResponse> {
  return apiClient<DirectReferralsResponse>(
    `/referrals/directs?page=${page}&limit=${limit}`,
    {
      method: 'GET',
      requiresAuth: true,
    }
  );
}

/**
 * Fetches lazy-expandable children of a specific node in the user's subtree.
 */
export async function getTreeChildrenApi(
  nodeId?: string
): Promise<TreeChildrenResponse> {
  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
  return apiClient<TreeChildrenResponse>(`/referrals/tree${query}`, {
    method: 'GET',
    requiresAuth: true,
  });
}
