// ============================================================================
// AdPayOn Shared Domain Types (Strict Integer Paise & PII Protection)
// ============================================================================

export type LegPosition = 'LEFT' | 'RIGHT';

export type UserRole = 'USER' | 'ADMIN' | 'SUPPORT';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BANNED';

export type RankTier =
  | 'NONE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'CROWN_DIAMOND'
  | 'AMBASSADOR'
  | 'ROYAL_AMBASSADOR'
  | 'CHAMPION';

export type LedgerAccountType =
  | 'USER_MAIN_WALLET'
  | 'USER_BONUS_WALLET'
  | 'COMPANY_COMMISSION_POOL'
  | 'WITHDRAWAL_ESCROW';

export type LedgerEntryType = 'DEBIT' | 'CREDIT';

export type LedgerStatus = 'PENDING' | 'VERIFIED' | 'CREDITED' | 'REJECTED';

export type TransactionType =
  | 'SIGNUP_BONUS'
  | 'LEVEL_COMMISSION'
  | 'BINARY_MATCHING'
  | 'RANK_REWARD'
  | 'CHALLENGE_REWARD'
  | 'AD_VIEW'
  | 'QUIZ_REWARD'
  | 'DAILY_CHECKIN'
  | 'SCRATCH_CARD'
  | 'WITHDRAWAL_REQUEST'
  | 'WITHDRAWAL_PAYOUT'
  | 'WITHDRAWAL_REFUND'
  | 'MOBILE_RECHARGE'
  | 'CASHBACK';

export type SourceCategory =
  | 'ALL'
  | 'ADS'
  | 'REFERRALS'
  | 'CHALLENGES'
  | 'ENGAGEMENT'
  | 'SYSTEM'
  | 'WITHDRAWAL';

export interface BinaryStats {
  leftCount: number;
  rightCount: number;
  leftVolumeUnits: number;
  rightVolumeUnits: number;
  leftCarryForwardUnits: number;
  rightCarryForwardUnits: number;
  lifetimeMatchedVolumeUnits: number;
}

export interface UserKycDetails {
  panMasked?: string;
  aadhaarLast4?: string; // Strictly last 4 digits only! Full Aadhaar is NEVER stored.
  bankAccountMasked?: string;
  ifsc?: string;
  upiIdMasked?: string;
  accountHolderName?: string;
  status: 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedAt?: string;
  rejectionReason?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  mobile: string;
  countryCode: string;
  role: UserRole;
  status: UserStatus;
  isActive: boolean;
  referralCode: string;
  sponsorId: string | null;
  sponsorName?: string;
  sponsorReferralCode?: string;
  parentId: string | null;
  leg?: LegPosition | null; // Deprecated binary artifact
  materializedPath: string;
  depth: number;
  binaryStats?: BinaryStats; // Deprecated binary artifact
  directReferralsCount: number;
  totalDownlineCount?: number;
  currentRank: RankTier;
  rankAchievedAt?: string;
  deviceId: string;
  signupBonusClaimed: boolean;
  dashboardUnlocked: boolean;
  streakCount: number;
  lastCheckInDate?: string;
  isKycVerified: boolean;
  kycDetails?: UserKycDetails;
  createdAt: string;
}

export interface WalletSummary {
  // All monetary values strictly in integer paise (1 INR = 100 paise)
  mainBalancePaise: number;
  bonusBalancePaise: number;
  escrowBalancePaise: number;
  todayEarningsPaise: number;
  yesterdayEarningsPaise: number;
  lifetimeEarningsPaise: number;
  earningsBreakdownPaise: {
    adsPaise: number;
    referralsPaise: number;
    challengesPaise: number;
    binaryPaise: number;
    rankRewardsPaise: number;
    gamificationPaise: number;
  };
}

export interface LedgerTransactionItem {
  id: string;
  idempotencyKey: string;
  type: TransactionType;
  sourceCategory: SourceCategory;
  // Strictly integer paise
  amountPaise: number;
  description: string;
  referenceId?: string;
  status: LedgerStatus;
  createdAt: string;
}

export type ChallengeTaskType =
  | 'APP_INSTALL'
  | 'PARTNER_REGISTER'
  | 'SURVEY'
  | 'VIDEO_WATCH'
  | 'SUBSCRIBE';

export type ChallengeValidationMethod =
  | 'SERVER_POSTBACK'
  | 'SCREENSHOT_CONFIRM'
  | 'AUTO_TIMER';

export interface ChallengeItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  taskType: ChallengeTaskType;
  partnerName: string;
  partnerUrl: string;
  deepLink?: string;
  // Strictly integer paise
  rewardAmountPaise: number;
  validationMethod: ChallengeValidationMethod;
  timerSeconds: number;
  isRequiredForDashboard: boolean;
  order: number;
  status: 'ACTIVE' | 'INACTIVE';
  userStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
}

export interface TeamMemberNode {
  id: string;
  name: string;
  referralCode: string;
  mobileMasked: string;
  level: number;
  leg?: LegPosition | null; // Deprecated binary artifact
  parentId?: string | null;
  sponsorName: string;
  status: UserStatus;
  isActive: boolean;
  currentRank: RankTier;
  directReferralsCount: number;
  totalDownlineCount?: number;
  leftCount?: number; // Deprecated binary artifact
  rightCount?: number; // Deprecated binary artifact
  joinedAt: string;
  hasChildren: boolean;
  children?: TeamMemberNode[];
}

export interface ReferralSummaryResponse {
  directCount: number;
  activeDirectCount: number;
  totalDownlineCount: number;
  activeDownlineCount: number;
  referralCode: string;
  sponsor: {
    name: string;
    referralCode: string;
    mobileMasked?: string;
  } | null;
}

export interface ReferralTreeNode {
  id: string;
  name: string;
  referralCode: string;
  mobileMasked: string;
  level: number;
  status: UserStatus;
  isActive: boolean;
  directReferralsCount: number;
  totalDownlineCount: number;
  joinedAt: string;
  hasChildren: boolean;
  children?: ReferralTreeNode[];
}

export interface LevelSlabConfig {
  level: number;
  percentage: number;
}

export interface BinarySlabConfig {
  leftUnits: number;
  rightUnits: number;
  percentage: number;
}

export interface RankMilestoneConfig {
  rank: RankTier;
  title: string;
  directReferralsRequired: number;
  leftCountRequired: number;
  rightCountRequired: number;
  rewardAmountPaise: number;
  badgeIcon: string;
  achievedCount?: number;
}

export interface CommissionConfigData {
  version: number;
  isActive: boolean;
  levelIncome: {
    poolBudgetPercentage: number;
    slabs: LevelSlabConfig[];
  };
  binaryIncome: {
    poolBudgetPercentage: number;
    matchingSlabs: BinarySlabConfig[];
    dailyCappingPaise: number;
  };
  rankRewards: {
    poolBudgetPercentage: number;
    ranks: RankMilestoneConfig[];
  };
  signupBonusPaise: number;
  withdrawalLimits: {
    minWithdrawalPaise: number;
    maxDailyWithdrawalPaise: number;
    kycMandatory: boolean;
  };
}

export interface DailyStreakItem {
  day: number;
  rewardAmountPaise: number;
  isClaimed: boolean;
  isToday: boolean;
  isLocked: boolean;
}

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  correctIndex?: number; // only provided on reveal/eval
  category: string;
  timeLimitSec: number;
}

export interface QuizLeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  score: number;
  timeTakenSec: number;
  rewardPaise: number;
}

export interface ScratchCardItem {
  id: string;
  title: string;
  source: string;
  isScratched: boolean;
  rewardAmountPaise: number;
  revealedAt?: string;
}

export interface RechargePlan {
  id: string;
  operator: string;
  circle: string;
  planType: 'TOPUP' | 'UNLIMITED' | 'DATA' | 'ENTERTAINMENT';
  amountPaise: number;
  validity: string;
  talktime?: string;
  data?: string;
  description: string;
}

export interface ShoppingStoreItem {
  id: string;
  name: string;
  logo: string;
  category: string;
  cashbackRate: string;
  affiliateUrl: string;
  badge?: string;
}
