import { apiClient } from './client';

export interface WalletSummaryResponse {
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
  amountPaise: number;
  payoutMode: 'UPI' | 'BANK_TRANSFER';
  beneficiaryDetails: {
    upiId?: string;
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
  };
}) {
  const res = await apiClient<ApiResponse<{ withdrawal: any; remainingBalancePaise: number }>>(
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
