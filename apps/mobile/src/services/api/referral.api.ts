import { apiClient } from './client';
import { ReferralSummaryResponse, ReferralTreeNode } from '@adpayon/shared';
import { useDemoStore } from '../../store/demoStore';

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
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        referralCode: 'DEMO777',
        sponsorCode: 'DIRECT_FOUNDER',
        directReferralsCount: 2,
        teamReferralsCount: 5,
        totalCommissionsEarned: 0,
        activeDirectsCount: 2,
        binaryVolumes: {
          leftVolume: 0,
          rightVolume: 0,
          matchedVolume: 0,
        },
      } as any,
    };
  }
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
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        items: [
          {
            id: 'demo_ref_1',
            name: 'Demo Referral Alpha',
            mobileMasked: 'XXXXXX1234',
            role: 'USER',
            status: 'ACTIVE',
            directCount: 1,
            teamCount: 2,
            hasChildren: false,
            joinedAt: new Date(Date.now() - 86400000).toISOString(),
          } as any,
          {
            id: 'demo_ref_2',
            name: 'Demo Referral Beta',
            mobileMasked: 'XXXXXX5678',
            role: 'USER',
            status: 'ACTIVE',
            directCount: 0,
            teamCount: 0,
            hasChildren: false,
            joinedAt: new Date(Date.now() - 172800000).toISOString(),
          } as any,
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      },
    };
  }
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
  if (useDemoStore.getState().isDemoMode) {
    return {
      success: true,
      data: {
        nodeId: nodeId || 'demo_client_reviewer',
        children: [],
      },
    };
  }
  const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
  return apiClient<TreeChildrenResponse>(`/referrals/tree${query}`, {
    method: 'GET',
    requiresAuth: true,
  });
}

