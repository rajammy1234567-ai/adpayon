export interface BalanceEntry {
  status: string;
  entryType: string;
  amountPaise: number;
  pointsEquivalent?: number;
  metadata?: Record<string, any>;
}

/**
 * Calculates authoritative wallet balances.
 * 1,000 points = USD $1.00 (1 point = $0.001 USD).
 * Points are maintained as authoritative integers.
 * Legacy promotional points remain separated from redeemable credits.
 */
export function ledgerBalance(entries: BalanceEntry[]) {
  let creditsPaise = 0;
  let holdsPaise = 0;
  let paidPaise = 0;
  let promoPoints = 0;

  let earnedPoints = 0;
  let reservedPoints = 0;
  let paidPoints = 0;

  for (const e of entries) {
    const pts = Math.abs(
      e.pointsEquivalent !== undefined && e.pointsEquivalent !== 0
        ? e.pointsEquivalent
        : (e.metadata?.points ? Number(e.metadata.points) : 0)
    );

    if (e.status === 'CONFIRMED') {
      if (
        ['REFERRAL_COMMISSION', 'ADMIN_ADJUSTMENT'].includes(e.entryType) ||
        (e.entryType === 'TASK_REWARD' && e.metadata?.rewardPolicy === 'REDEEMABLE_V1')
      ) {
        creditsPaise += e.amountPaise;
        earnedPoints += pts;
      } else if (e.entryType === 'TASK_REWARD') {
        promoPoints += Math.max(0, e.pointsEquivalent || 0);
      } else if (e.entryType === 'WITHDRAWAL_PAID') {
        paidPaise += Math.abs(e.amountPaise);
        paidPoints += pts;
      }
    } else if (e.status === 'PENDING' && e.entryType === 'WITHDRAWAL_HOLD') {
      holdsPaise += Math.abs(e.amountPaise);
      reservedPoints += pts;
    }
  }

  const availablePoints = Math.max(0, earnedPoints - reservedPoints - paidPoints);
  const availableBalancePaise = Math.max(0, creditsPaise - holdsPaise - paidPaise);

  return {
    confirmedBalancePaise: creditsPaise,
    reservedWithdrawalPaise: holdsPaise,
    totalWithdrawnPaise: paidPaise,
    availableBalancePaise,
    totalEarnedPaise: creditsPaise,
    pointsBalance: promoPoints,
    // Authoritative Points & USD breakdown
    availablePoints,
    availableUsd: Number((availablePoints * 0.001).toFixed(3)),
    reservedPoints,
    reservedUsd: Number((reservedPoints * 0.001).toFixed(3)),
    totalEarnedPoints: earnedPoints,
    totalEarnedUsd: Number((earnedPoints * 0.001).toFixed(3)),
    totalWithdrawnPoints: paidPoints,
    totalWithdrawnUsd: Number((paidPoints * 0.001).toFixed(3)),
  };
}
