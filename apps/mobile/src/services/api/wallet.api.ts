import { apiClient } from './client';

export interface WalletSummaryResponse {
  availablePoints: number;
  availableUsd: number;
  reservedPoints: number;
  reservedUsd: number;
  totalEarnedPoints: number;
  totalEarnedUsd: number;
  totalWithdrawnPoints: number;
  totalWithdrawnUsd: number;
  pointsConversionRate?: string;
  minWithdrawalPoints?: number;
  minWithdrawalUsd?: number;
  // Legacy INR fields
  availableBalancePaise: number;
  availableBalanceRupees: number;
  confirmedBalancePaise: number;
  confirmedBalanceRupees: number;
  reservedWithdrawalPaise: number;
  reservedWithdrawalRupees: number;
  totalEarnedPaise: number;
  totalEarnedRupees: number;
  totalWithdrawnPaise: number;
  totalWithdrawnRupees: number;
  pointsBalance: number;
  minWithdrawalPaise: number;
  minWithdrawalRupees: number;
}

export interface WalletTransactionItem {
  id: string;
  type: string;
  amountPaise: number;
  amountRupees: number;
  pointsEquivalent: number;
  usdEquivalent?: number;
  rewardKind?: 'CASH' | 'PROMOTIONAL_POINTS';
  status: string;
  notes: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export async function fetchWalletSummaryApi(): Promise<WalletSummaryResponse> {
  const res = await apiClient<ApiResponse<WalletSummaryResponse>>('/wallet/summary', {
    method: 'GET',
    requiresAuth: true,
  });
  return res.data;
}

export async function fetchWalletTransactionsApi(
  page: number = 1
): Promise<{ transactions: WalletTransactionItem[] }> {
  const res = await apiClient<ApiResponse<{ transactions: WalletTransactionItem[] }>>(
    `/wallet/transactions?page=${page}`,
    {
      method: 'GET',
      requiresAuth: true,
    }
  );
  return res.data;
}

export async function submitWithdrawalApi(payload: {
  pointsAmount?: number;
  amountPaise?: number;
  payoutMode: 'BANK_ACCOUNT' | 'USDT_WALLET' | 'BANK_TRANSFER' | 'UPI' | 'USD_ACCOUNT';
  accountPassword: string;
  currency?: 'USD' | 'INR';
  quoteToken?: string;
  idempotencyKey?: string;
  beneficiaryDetails: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    usdtAddress?: string;
    network?: 'BEP20';
    usdAccount?: string;
    upiId?: string;
  };
}) {
  const res = await apiClient<ApiResponse<{ withdrawal: any; remainingPoints?: number }>>(
    '/wallet/withdraw',
    {
      method: 'POST',
      body: JSON.stringify(payload),
      requiresAuth: true,
    }
  );
  return res.data;
}

export async function submitKycApi(payload: {
  panNumber: string;
  aadhaarLast4?: string;
  accountHolderName?: string;
  bankAccount?: string;
  ifscCode?: string;
}) {
  const res = await apiClient<ApiResponse<{ kycStatus: string }>>('/users/kyc', {
    method: 'POST',
    body: JSON.stringify(payload),
    requiresAuth: true,
  });
  return res.data;
}

export async function deleteAccountApi() {
  const res = await apiClient<ApiResponse<{ message: string }>>('/users/delete-account', {
    method: 'POST',
    body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
    requiresAuth: true,
  });
  return res.data;
}

export interface RedemptionOptions {
  usdEnabled: boolean;
  minPaise: number;
  paisePerUsd?: number | null;
  usdInstructions?: string;
}

export interface RedemptionQuote {
  token: string;
  amountPaise: number;
  currency: 'INR' | 'USD';
  payoutMinor: number;
  paisePerUsd?: number;
  expiresAt: string;
}

export async function fetchRedemptionOptions(): Promise<RedemptionOptions> {
  const res = await apiClient<ApiResponse<RedemptionOptions>>('/wallet/redemption-policy', {
    method: 'GET',
    requiresAuth: true,
  });
  return res.data;
}

export async function fetchRedemptionQuote(amountPaise: number, currency: 'INR' | 'USD'): Promise<RedemptionQuote> {
  const res = await apiClient<ApiResponse<RedemptionQuote>>('/wallet/quote', {
    method: 'POST',
    body: JSON.stringify({ amountPaise, currency }),
    requiresAuth: true,
  });
  return res.data;
}
