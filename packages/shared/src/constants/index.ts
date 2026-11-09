import {
  CommissionConfigData,
  RankMilestoneConfig,
  RankTier,
} from '../types';

/**
 * Converts integer paise into formatted INR string (Legacy).
 * @param paise Integer paise amount (e.g., 5000)
 * @param includeDecimals Whether to format with .00 if cents exist (default true)
 * @returns Formatted currency string (e.g., "₹50.00" or "₹50")
 */
export function formatPaiseToRupees(paise: number, includeDecimals = true): string {
  const rupees = (paise || 0) / 100;
  if (!includeDecimals && Number.isInteger(rupees)) {
    return `₹${rupees.toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Converts INR floating input into safe integer paise.
 * @param inr Rupees
 * @returns Integer paise
 */
export function inrToPaise(inr: number): number {
  return Math.round(inr * 100);
}

/**
 * Legacy 1000 Points = ₹100 Integer Accounting Specification:
 * Preserved for backward compatibility with existing INR history.
 */
export const POINTS_TO_PAISE_RATIO = 10;
export const POINTS_PER_RUPEE = 10;

export function pointsToPaise(points: number): number {
  return Math.round((points || 0) * POINTS_TO_PAISE_RATIO);
}

export function paiseToPoints(paise: number): number {
  return Math.floor((paise || 0) / POINTS_TO_PAISE_RATIO);
}

export function pointsToRupees(points: number): number {
  return ((points || 0) * POINTS_TO_PAISE_RATIO) / 100;
}

/**
 * Authoritative Point Conversion Specification:
 * 1,000 Points = USD $1.00
 * 1 Point = USD $0.001
 * Points are authoritative integers. Fractional dollar accuracy is preserved down to 1 point ($0.001).
 */
export const POINTS_PER_USD = 1000;
export const USD_PER_POINT = 0.001;

export function pointsToUsd(points: number): number {
  return (points || 0) * USD_PER_POINT;
}

export function usdToPoints(usd: number): number {
  return Math.round((usd || 0) * POINTS_PER_USD);
}

export function formatUsd(amount: number): string {
  if (amount === 0 || !amount) return '$0.00';
  const fixed3 = amount.toFixed(3);
  if (fixed3.endsWith('0')) {
    return `$${amount.toFixed(2)}`;
  }
  return `$${fixed3}`;
}

export function formatPointsToUsd(points: number): string {
  return formatUsd(pointsToUsd(points));
}

export function formatRewardDisplay(points: number): string {
  return `${(points || 0).toLocaleString()} pts (${formatPointsToUsd(points)})`;
}

export const DEFAULT_RANKS: RankMilestoneConfig[] = [
  {
    rank: 'SILVER',
    title: 'Silver Achiever',
    directReferralsRequired: 5,
    leftCountRequired: 25,
    rightCountRequired: 25,
    rewardAmountPaise: 50000, // ₹500
    badgeIcon: 'award-silver',
  },
  {
    rank: 'GOLD',
    title: 'Gold Leader',
    directReferralsRequired: 10,
    leftCountRequired: 100,
    rightCountRequired: 100,
    rewardAmountPaise: 200000, // ₹2,000
    badgeIcon: 'award-gold',
  },
  {
    rank: 'PLATINUM',
    title: 'Platinum Director',
    directReferralsRequired: 20,
    leftCountRequired: 500,
    rightCountRequired: 500,
    rewardAmountPaise: 1000000, // ₹10,000
    badgeIcon: 'award-platinum',
  },
  {
    rank: 'DIAMOND',
    title: 'Diamond Executive',
    directReferralsRequired: 35,
    leftCountRequired: 2000,
    rightCountRequired: 2000,
    rewardAmountPaise: 5000000, // ₹50,000
    badgeIcon: 'award-diamond',
  },
  {
    rank: 'CROWN_DIAMOND',
    title: 'Crown Diamond',
    directReferralsRequired: 50,
    leftCountRequired: 10000,
    rightCountRequired: 10000,
    rewardAmountPaise: 25000000, // ₹2,50,00,000
    badgeIcon: 'award-crown',
  },
  {
    rank: 'AMBASSADOR',
    title: 'Global Ambassador',
    directReferralsRequired: 75,
    leftCountRequired: 50000,
    rightCountRequired: 50000,
    rewardAmountPaise: 100000000, // ₹10,00,000
    badgeIcon: 'award-ambassador',
  },
  {
    rank: 'ROYAL_AMBASSADOR',
    title: 'Royal Ambassador',
    directReferralsRequired: 100,
    leftCountRequired: 200000,
    rightCountRequired: 200000,
    rewardAmountPaise: 500000000, // ₹50,00,000
    badgeIcon: 'award-royal',
  },
  {
    rank: 'CHAMPION',
    title: 'Crown Champion Legend',
    directReferralsRequired: 150,
    leftCountRequired: 500000,
    rightCountRequired: 500000,
    rewardAmountPaise: 1500000000, // ₹1,50,00,000
    badgeIcon: 'award-champion',
  },
];

export const DEFAULT_COMMISSION_CONFIG: CommissionConfigData = {
  version: 1,
  isActive: true,
  levelIncome: {
    poolBudgetPercentage: 55,
    slabs: [
      { level: 1, percentage: 25 },
      { level: 2, percentage: 10 },
      { level: 3, percentage: 5 },
      { level: 4, percentage: 4 },
      { level: 5, percentage: 3 },
      { level: 6, percentage: 3 },
      { level: 7, percentage: 3 },
      { level: 8, percentage: 2 },
    ],
  },
  binaryIncome: {
    poolBudgetPercentage: 20,
    matchingSlabs: [
      { leftUnits: 50, rightUnits: 50, percentage: 6 },
      { leftUnits: 600, rightUnits: 600, percentage: 6 },
      { leftUnits: 2000, rightUnits: 2000, percentage: 5 },
      { leftUnits: 10000, rightUnits: 10000, percentage: 5 },
      { leftUnits: 30000, rightUnits: 30000, percentage: 5 },
      { leftUnits: 100000, rightUnits: 100000, percentage: 4 },
      { leftUnits: 300000, rightUnits: 300000, percentage: 4 },
      { leftUnits: 500000, rightUnits: 500000, percentage: 5 },
    ],
    dailyCappingPaise: 2500000,
  },
  rankRewards: {
    poolBudgetPercentage: 25,
    ranks: DEFAULT_RANKS,
  },
  signupBonusPaise: 5000,
  withdrawalLimits: {
    minWithdrawalPaise: 10000,
    maxDailyWithdrawalPaise: 1000000,
    kycMandatory: true,
  },
};
