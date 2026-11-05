export interface BalanceEntry { status: string; entryType: string; amountPaise: number; pointsEquivalent?: number; metadata?: Record<string, any> }
/** Legacy task points remain promotional; only explicitly verified V1 credits are cash-redeemable. */
export function ledgerBalance(entries: BalanceEntry[]) {
  let credits = 0, holds = 0, paid = 0, promo = 0;
  for (const e of entries) {
    if (e.status === 'CONFIRMED') {
      if (['REFERRAL_COMMISSION', 'ADMIN_ADJUSTMENT'].includes(e.entryType) || (e.entryType === 'TASK_REWARD' && e.metadata?.rewardPolicy === 'REDEEMABLE_V1')) credits += e.amountPaise;
      else if (e.entryType === 'TASK_REWARD') promo += Math.max(0, e.pointsEquivalent || 0);
      else if (e.entryType === 'WITHDRAWAL_PAID') paid += Math.abs(e.amountPaise);
    } else if (e.status === 'PENDING' && e.entryType === 'WITHDRAWAL_HOLD') holds += Math.abs(e.amountPaise);
  }
  return { confirmedBalancePaise: credits, reservedWithdrawalPaise: holds, totalWithdrawnPaise: paid, availableBalancePaise: Math.max(0, credits - holds - paid), totalEarnedPaise: credits, pointsBalance: promo };
}
