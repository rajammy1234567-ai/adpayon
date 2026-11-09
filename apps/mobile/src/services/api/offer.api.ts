import { apiClient } from './client';
import { Offer } from '@adpayon/shared';

export interface OffersApiResponse {
  success: boolean;
  data: Offer[];
}

export interface OfferDetailApiResponse {
  success: boolean;
  data: Offer;
}

export interface OfferShareLinkResponse {
  success: boolean;
  data: {
    offerId: string;
    shareUrl: string;
    referralCode: string;
    expiresAt?: string;
  };
}

export interface OfferCompletionResponse {
  success: boolean;
  message: string;
  data: { id: string; status: 'PENDING' };
}
export async function getOfferActivityApi(id: string) {
  return apiClient<{ success: boolean; data: { personalStats: NonNullable<Offer['personalStats']>; submission: Offer['submission'] | null } }>(`/offers/${encodeURIComponent(id)}/activity`, { method: 'GET', requiresAuth: true });
}

export async function getOffersApi(params?: {
  categoryId?: string;
  search?: string;
}): Promise<OffersApiResponse> {
  const queryParts: string[] = [];
  if (params?.categoryId) queryParts.push(`categoryId=${encodeURIComponent(params.categoryId)}`);
  if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  const query = queryParts.length ? `?${queryParts.join('&')}` : '';

  return apiClient<OffersApiResponse>(`/offers${query}`, {
    method: 'GET',
  });
}

export async function getOfferDetailsApi(idOrSlug: string): Promise<OfferDetailApiResponse> {
  return apiClient<OfferDetailApiResponse>(`/offers/${encodeURIComponent(idOrSlug)}`, {
    method: 'GET',
  });
}

export async function generateOfferShareLinkApi(
  offerId: string
): Promise<OfferShareLinkResponse> {
  return apiClient<OfferShareLinkResponse>(`/offers/${encodeURIComponent(offerId)}/share-link`, {
    method: 'POST',
    requiresAuth: true,
  });
}

export async function completeOfferApi(
  offerId: string,
  body?: { proofUrl?: string; proofFileId?: string; completionCode?: string; notes?: string }
): Promise<OfferCompletionResponse> {
  return apiClient<OfferCompletionResponse>(`/offers/${encodeURIComponent(offerId)}/complete`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
    requiresAuth: true,
  });
}
