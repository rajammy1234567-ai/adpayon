import { create } from 'zustand';
import { LedgerTransactionItem, SourceCategory, WalletSummary } from '@adpayon/shared';
import {
  fetchWalletSummaryApi,
  fetchWalletTransactionsApi,
  submitWithdrawalApi,
} from '../services/api/wallet.api';

const emptySummary: WalletSummary = {
  mainBalancePaise: 0,
  bonusBalancePaise: 0,
  escrowBalancePaise: 0,
  todayEarningsPaise: 0,
  yesterdayEarningsPaise: 0,
  lifetimeEarningsPaise: 0,
  earningsBreakdownPaise: {
    adsPaise: 0,
    referralsPaise: 0,
    challengesPaise: 0,
    binaryPaise: 0,
    rankRewardsPaise: 0,
    gamificationPaise: 0,
  },
};

interface WalletState {
  summary: WalletSummary;
  availablePoints: number;
  availableUsd: number;
  reservedPoints: number;
  reservedUsd: number;
  totalEarnedPoints: number;
  totalEarnedUsd: number;
  totalWithdrawnPoints: number;
  totalWithdrawnUsd: number;
  transactions: LedgerTransactionItem[];
  filter: SourceCategory;
  isLoading: boolean;
  error: string | null;
  promotionalPoints: number;

  setFilter: (filter: SourceCategory) => void;
  fetchSummary: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  recordWithdrawal: (amountPaise: number, payoutMethod: string, upiId?: string) => Promise<boolean>;
  claimReward: (amountPaise: number, category: SourceCategory, description: string) => void;
  reset: () => void;
}

let walletGeneration = 0;

export const useWalletStore = create<WalletState>((set, get) => ({
  summary: emptySummary,
  availablePoints: 0,
  availableUsd: 0,
  reservedPoints: 0,
  reservedUsd: 0,
  totalEarnedPoints: 0,
  totalEarnedUsd: 0,
  totalWithdrawnPoints: 0,
  totalWithdrawnUsd: 0,
  transactions: [],
  filter: 'ALL',
  isLoading: false,
  error: null,
  promotionalPoints: 0,

  reset: () => {
    walletGeneration++;
    set({
      summary: emptySummary,
      availablePoints: 0,
      availableUsd: 0,
      reservedPoints: 0,
      reservedUsd: 0,
      totalEarnedPoints: 0,
      totalEarnedUsd: 0,
      totalWithdrawnPoints: 0,
      totalWithdrawnUsd: 0,
      transactions: [],
      error: null,
      promotionalPoints: 0,
    });
  },

  setFilter: (filter) => set({ filter }),

  fetchSummary: async () => {
    const generation = walletGeneration;
    set({ isLoading: true, error: null });
    try {
      const data = await fetchWalletSummaryApi();
      if (generation !== walletGeneration) return;

      const availPts = data.availablePoints ?? Math.floor(data.availableBalancePaise / 10);
      const resPts = data.reservedPoints ?? Math.floor(data.reservedWithdrawalPaise / 10);
      const earnPts = data.totalEarnedPoints ?? Math.floor(data.totalEarnedPaise / 10);
      const withPts = data.totalWithdrawnPoints ?? Math.floor(data.totalWithdrawnPaise / 10);

      set({
        summary: {
          ...emptySummary,
          mainBalancePaise: data.availableBalancePaise,
          escrowBalancePaise: data.reservedWithdrawalPaise,
          lifetimeEarningsPaise: data.totalEarnedPaise,
        },
        availablePoints: availPts,
        availableUsd: data.availableUsd ?? Number((availPts * 0.001).toFixed(2)),
        reservedPoints: resPts,
        reservedUsd: data.reservedUsd ?? Number((resPts * 0.001).toFixed(2)),
        totalEarnedPoints: earnPts,
        totalEarnedUsd: data.totalEarnedUsd ?? Number((earnPts * 0.001).toFixed(2)),
        totalWithdrawnPoints: withPts,
        totalWithdrawnUsd: data.totalWithdrawnUsd ?? Number((withPts * 0.001).toFixed(2)),
        promotionalPoints: data.pointsBalance || 0,
        isLoading: false,
      });
    } catch (e: any) {
      if (generation === walletGeneration) {
        set({
          summary: emptySummary,
          availablePoints: 0,
          availableUsd: 0,
          reservedPoints: 0,
          reservedUsd: 0,
          totalEarnedPoints: 0,
          totalEarnedUsd: 0,
          totalWithdrawnPoints: 0,
          totalWithdrawnUsd: 0,
          promotionalPoints: 0,
          isLoading: false,
          error: e.message || 'Could not load your wallet.',
        });
      }
    }
  },

  fetchTransactions: async () => {
    const generation = walletGeneration;
    try {
      const data = await fetchWalletTransactionsApi();
      if (generation !== walletGeneration) return;
      if (!Array.isArray(data.transactions)) throw new Error('Invalid wallet history response.');

      const transactions: LedgerTransactionItem[] = data.transactions.map((tx) => ({
        displayPoints: tx.pointsEquivalent || Math.floor(Math.abs(tx.amountPaise) / 10),
        id: tx.id,
        idempotencyKey: `tx-${tx.id}`,
        type:
          tx.type === 'WITHDRAWAL_PAID'
            ? 'WITHDRAWAL_PAYOUT'
            : tx.type === 'WITHDRAWAL_HOLD'
            ? 'WITHDRAWAL_REQUEST'
            : tx.type === 'REFERRAL_COMMISSION'
            ? 'LEVEL_COMMISSION'
            : 'CHALLENGE_REWARD',
        sourceCategory: tx.type.startsWith('WITHDRAWAL')
          ? 'WITHDRAWAL'
          : tx.type === 'REFERRAL_COMMISSION'
          ? 'REFERRALS'
          : 'CHALLENGES',
        amountPaise: Math.abs(tx.amountPaise),
        description: tx.notes,
        status:
          tx.status === 'CONFIRMED'
            ? 'CREDITED'
            : tx.status === 'REVERSED'
            ? 'REJECTED'
            : 'PENDING',
        createdAt: tx.createdAt,
      }));

      set({ transactions });
    } catch (e: any) {
      if (generation === walletGeneration) {
        set({ transactions: [], error: e.message || 'Could not load wallet history.' });
      }
    }
  },

  recordWithdrawal: async (amountPaise: number, payoutMethod: string, upiId?: string) => {
    if (payoutMethod !== 'UPI' || !upiId) {
      set({ error: 'Enter valid payout details.' });
      return false;
    }
    try {
      await submitWithdrawalApi({
        amountPaise,
        payoutMode: 'UPI',
        accountPassword: '',
        beneficiaryDetails: { upiId },
      });
      await Promise.all([get().fetchSummary(), get().fetchTransactions()]);
      return true;
    } catch (e: any) {
      set({ error: e.message || 'Withdrawal was not submitted.' });
      return false;
    }
  },

  claimReward: () => {
    set({ error: 'This reward requires server verification. No wallet credit was made.' });
  },
}));
