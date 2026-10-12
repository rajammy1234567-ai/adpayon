import { create } from 'zustand';
import {
  LedgerTransactionItem,
  SourceCategory,
  WalletSummary,
} from '@adpayon/shared';
import { MOCK_TRANSACTIONS, MOCK_WALLET_SUMMARY } from '../services/mockData';

interface WalletState {
  summary: WalletSummary;
  transactions: LedgerTransactionItem[];
  filter: SourceCategory;
  isLoading: boolean;
  setFilter: (filter: SourceCategory) => void;
  recordWithdrawal: (amountPaise: number, payoutMethod: string) => void;
  claimReward: (amountPaise: number, category: SourceCategory, description: string) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  summary: MOCK_WALLET_SUMMARY,
  transactions: MOCK_TRANSACTIONS,
  filter: 'ALL',
  isLoading: false,

  setFilter: (filter) => set({ filter }),

  recordWithdrawal: (amountPaise, payoutMethod) =>
    set((state) => {
      const newTx: LedgerTransactionItem = {
        id: `tx-wd-${Date.now()}`,
        idempotencyKey: `idemp-wd-${Date.now()}`,
        type: 'WITHDRAWAL_REQUEST',
        sourceCategory: 'WITHDRAWAL',
        amountPaise,
        description: `Withdrawal request via ${payoutMethod} (Pending Admin Review)`,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      return {
        summary: {
          ...state.summary,
          mainBalancePaise: Math.max(0, state.summary.mainBalancePaise - amountPaise),
          escrowBalancePaise: state.summary.escrowBalancePaise + amountPaise,
        },
        transactions: [newTx, ...state.transactions],
      };
    }),

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
