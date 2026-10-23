import { create } from 'zustand';
import {
  LedgerTransactionItem,
  SourceCategory,
  WalletSummary,
} from '@adpayon/shared';
import { MOCK_TRANSACTIONS, MOCK_WALLET_SUMMARY } from '../services/mockData';
import {
  fetchWalletSummaryApi,
  fetchWalletTransactionsApi,
  submitWithdrawalApi,
} from '../services/api/wallet.api';

interface WalletState {
  summary: WalletSummary;
  transactions: LedgerTransactionItem[];
  filter: SourceCategory;
  isLoading: boolean;
  setFilter: (filter: SourceCategory) => void;
  fetchSummary: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  recordWithdrawal: (amountPaise: number, payoutMethod: string, upiId?: string) => Promise<boolean>;
  claimReward: (amountPaise: number, category: SourceCategory, description: string) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  summary: MOCK_WALLET_SUMMARY,
  transactions: MOCK_TRANSACTIONS,
  filter: 'ALL',
  isLoading: false,

  setFilter: (filter) => set({ filter }),

  fetchSummary: async () => {
    try {
      set({ isLoading: true });
      const data = await fetchWalletSummaryApi();
      set((state) => ({
        isLoading: false,
        summary: {
          ...state.summary,
          mainBalancePaise: data.availableBalancePaise,
          escrowBalancePaise: data.reservedWithdrawalPaise,
          lifetimeEarningsPaise: data.totalEarnedPaise,
        },
      }));
    } catch {
      // In demo mode or offline, keep current state
      set({ isLoading: false });
    }
  },

  fetchTransactions: async () => {
    try {
      set({ isLoading: true });
      const data = await fetchWalletTransactionsApi();
      if (data && Array.isArray(data.transactions) && data.transactions.length > 0) {
        const mapped: LedgerTransactionItem[] = data.transactions.map((tx) => ({
          id: tx.id,
          idempotencyKey: `tx-${tx.id}`,
          type: tx.amountPaise >= 0 ? 'CHALLENGE_REWARD' : 'WITHDRAWAL_REQUEST',
          sourceCategory: tx.amountPaise >= 0 ? 'CHALLENGES' : 'WITHDRAWAL',
          amountPaise: Math.abs(tx.amountPaise),
          description: tx.notes || (tx.amountPaise >= 0 ? 'Verified Task Reward' : 'Withdrawal Hold'),
          status: tx.status === 'CONFIRMED' ? 'CREDITED' : tx.status === 'REVERSED' ? 'REJECTED' : 'PENDING',
          createdAt: tx.createdAt,
        }));
        set({ transactions: mapped, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  recordWithdrawal: async (amountPaise, payoutMethod, upiId) => {
    try {
      set({ isLoading: true });
      await submitWithdrawalApi({
        amountPaise,
        payoutMode: payoutMethod === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'UPI',
        beneficiaryDetails: {
          upiId: upiId || 'earner@upi',
        },
      });

      const newTx: LedgerTransactionItem = {
        id: `tx-wd-${Date.now()}`,
        idempotencyKey: `idemp-wd-${Date.now()}`,
        type: 'WITHDRAWAL_REQUEST',
        sourceCategory: 'WITHDRAWAL',
        amountPaise,
        description: `Withdrawal request via ${payoutMethod} (Queued for Review)`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        isLoading: false,
        summary: {
          ...state.summary,
          mainBalancePaise: Math.max(0, state.summary.mainBalancePaise - amountPaise),
          escrowBalancePaise: state.summary.escrowBalancePaise + amountPaise,
        },
        transactions: [newTx, ...state.transactions],
      }));
      return true;
    } catch (err) {
      set({ isLoading: false });
      // In offline/demo mode, fallback to optimistic UI
      const newTx: LedgerTransactionItem = {
        id: `tx-wd-${Date.now()}`,
        idempotencyKey: `idemp-wd-${Date.now()}`,
        type: 'WITHDRAWAL_REQUEST',
        sourceCategory: 'WITHDRAWAL',
        amountPaise,
        description: `Withdrawal request via ${payoutMethod} (Demo Mode)`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        summary: {
          ...state.summary,
          mainBalancePaise: Math.max(0, state.summary.mainBalancePaise - amountPaise),
          escrowBalancePaise: state.summary.escrowBalancePaise + amountPaise,
        },
        transactions: [newTx, ...state.transactions],
      }));
      return true;
    }
  },

  claimReward: (amountPaise, category, description) =>
    set((state) => {
      const newTx: LedgerTransactionItem = {
        id: `tx-rew-${Date.now()}`,
        idempotencyKey: `idemp-rew-${Date.now()}`,
        type: 'CHALLENGE_REWARD',
        sourceCategory: category,
        amountPaise,
        description,
        status: 'CREDITED',
        createdAt: new Date().toISOString(),
      };

      return {
        summary: {
          ...state.summary,
          mainBalancePaise: state.summary.mainBalancePaise + amountPaise,
          todayEarningsPaise: state.summary.todayEarningsPaise + amountPaise,
          lifetimeEarningsPaise: state.summary.lifetimeEarningsPaise + amountPaise,
        },
        transactions: [newTx, ...state.transactions],
      };
    }),
}));
