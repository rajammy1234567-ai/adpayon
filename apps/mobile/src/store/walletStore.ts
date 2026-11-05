import { create } from 'zustand';
import { LedgerTransactionItem, SourceCategory, WalletSummary } from '@adpayon/shared';
import { fetchWalletSummaryApi, fetchWalletTransactionsApi, submitWithdrawalApi } from '../services/api/wallet.api';
const emptySummary: WalletSummary = {
  mainBalancePaise: 0, bonusBalancePaise: 0, escrowBalancePaise: 0, todayEarningsPaise: 0,
  yesterdayEarningsPaise: 0, lifetimeEarningsPaise: 0,
  earningsBreakdownPaise: { adsPaise: 0, referralsPaise: 0, challengesPaise: 0, binaryPaise: 0, rankRewardsPaise: 0, gamificationPaise: 0 },
};
interface WalletState {
  summary: WalletSummary; transactions: LedgerTransactionItem[]; filter: SourceCategory; isLoading: boolean; error: string | null; promotionalPoints: number;
  setFilter: (filter: SourceCategory) => void; fetchSummary: () => Promise<void>; fetchTransactions: () => Promise<void>;
  recordWithdrawal: (amountPaise: number, payoutMethod: string, upiId?: string) => Promise<boolean>;
  claimReward: (amountPaise: number, category: SourceCategory, description: string) => void;
  reset: () => void;
}
let walletGeneration = 0;
export const useWalletStore = create<WalletState>((set, get) => ({
  summary: emptySummary, transactions: [], filter: 'ALL', isLoading: false, error: null, promotionalPoints: 0,
  reset: () => { walletGeneration++; set({ summary: emptySummary, transactions: [], error: null, promotionalPoints: 0 }); },
  setFilter: filter => set({ filter }),
  fetchSummary: async () => {
    const generation = walletGeneration;
    set({ isLoading: true, error: null });
    try {
      const data = await fetchWalletSummaryApi();
      if (generation !== walletGeneration) return;
      set({ summary: { ...emptySummary, mainBalancePaise: data.availableBalancePaise, escrowBalancePaise: data.reservedWithdrawalPaise, lifetimeEarningsPaise: data.totalEarnedPaise }, promotionalPoints: data.pointsBalance, isLoading: false });
    } catch (e: any) { if (generation === walletGeneration) set({ summary: emptySummary, promotionalPoints: 0, isLoading: false, error: e.message || 'Could not load your wallet.' }); }
  },
  fetchTransactions: async () => {
    const generation = walletGeneration;
    try {
      const data = await fetchWalletTransactionsApi();
      if (generation !== walletGeneration) return;
      if (!Array.isArray(data.transactions)) throw new Error('Invalid wallet history response.');
      const transactions: LedgerTransactionItem[] = data.transactions.map(tx => ({
        displayPoints: tx.rewardKind === 'PROMOTIONAL_POINTS' ? tx.pointsEquivalent : undefined,
        id: tx.id, idempotencyKey: `tx-${tx.id}`,
        type: tx.type === 'WITHDRAWAL_PAID' ? 'WITHDRAWAL_PAYOUT' : tx.type === 'WITHDRAWAL_HOLD' ? 'WITHDRAWAL_REQUEST' : tx.type === 'REFERRAL_COMMISSION' ? 'LEVEL_COMMISSION' : 'CHALLENGE_REWARD',
        sourceCategory: tx.type.startsWith('WITHDRAWAL') ? 'WITHDRAWAL' : tx.type === 'REFERRAL_COMMISSION' ? 'REFERRALS' : 'CHALLENGES',
        amountPaise: Math.abs(tx.amountPaise), description: tx.rewardKind === 'PROMOTIONAL_POINTS' ? `${tx.notes} · ${tx.pointsEquivalent} promotional points (not cash)` : tx.notes,
        status: tx.status === 'CONFIRMED' ? 'CREDITED' : tx.status === 'REVERSED' ? 'REJECTED' : 'PENDING', createdAt: tx.createdAt,
      }));
      set({ transactions });
    } catch (e: any) { if (generation === walletGeneration) set({ transactions: [], error: e.message || 'Could not load wallet history.' }); }
  },
  recordWithdrawal: async (amountPaise, payoutMethod, upiId) => {
    if (payoutMethod !== 'UPI' || !upiId) { set({ error: 'Enter valid payout details.' }); return false; }
    try { await submitWithdrawalApi({ amountPaise, payoutMode: 'UPI', beneficiaryDetails: { upiId } }); await Promise.all([get().fetchSummary(), get().fetchTransactions()]); return true; }
    catch (e: any) { set({ error: e.message || 'Withdrawal was not submitted.' }); return false; }
  },
  // Local gamification screens cannot mint real wallet funds. Only the server can credit rewards.
  claimReward: () => { set({ error: 'This reward requires server verification. No wallet credit was made.' }); },
}));
