import {
  ChallengeItem,
  DailyStreakItem,
  LedgerTransactionItem,
  QuizLeaderboardEntry,
  QuizQuestionItem,
  RechargePlan,
  ScratchCardItem,
  ShoppingStoreItem,
  TeamMemberNode,
  UserProfile,
  WalletSummary,
} from '@adpayon/shared';

export const MOCK_USER_PROFILE: UserProfile = {
  id: 'usr_1001',
  name: 'Vikram Sharma',
  mobile: '9876543210',
  countryCode: '+91',
  role: 'USER',
  status: 'ACTIVE',
  isActive: true,
  referralCode: 'ADP8829',
  sponsorId: 'usr_1000',
  sponsorName: 'Rajesh Verma (Crown Diamond)',
  sponsorReferralCode: 'ADP1000',
  parentId: 'usr_1000',
  leg: 'LEFT',
  materializedPath: ',usr_root,usr_1000,',
  depth: 2,
  binaryStats: {
    leftCount: 42,
    rightCount: 38,
    leftVolumeUnits: 1420,
    rightVolumeUnits: 1100,
    leftCarryForwardUnits: 320,
    rightCarryForwardUnits: 0,
    lifetimeMatchedVolumeUnits: 1100,
  },
  directReferralsCount: 8,
  currentRank: 'SILVER',
  rankAchievedAt: '2026-09-15T10:00:00.000Z',
  deviceId: 'DEV-FINGERPRINT-X98273-IN',
  signupBonusClaimed: true,
  dashboardUnlocked: true,
  streakCount: 5,
  lastCheckInDate: '2026-10-12',
  isKycVerified: true,
  kycDetails: {
    panMasked: 'ABCDE****F',
    aadhaarLast4: '4589',
    bankAccountMasked: 'XXXXXXXXX4521',
    ifsc: 'HDFC0001234',
    upiIdMasked: 'vikram***@okhdfcbank',
    accountHolderName: 'Vikram Sharma',
    status: 'VERIFIED',
    verifiedAt: '2026-09-02T14:30:00.000Z',
  },
  createdAt: '2026-08-20T08:00:00.000Z',
};

export const MOCK_WALLET_SUMMARY: WalletSummary = {
  mainBalancePaise: 425000,     // ₹4,250.00
  bonusBalancePaise: 5000,      // ₹50.00
  escrowBalancePaise: 0,        // ₹0.00
  todayEarningsPaise: 45000,    // ₹450.00
  yesterdayEarningsPaise: 82000,// ₹820.00
  lifetimeEarningsPaise: 1245000,// ₹12,450.00
  earningsBreakdownPaise: {
    adsPaise: 245000,           // ₹2,450.00
    referralsPaise: 520000,     // ₹5,200.00
    challengesPaise: 180000,    // ₹1,800.00
    binaryPaise: 220000,        // ₹2,200.00
    rankRewardsPaise: 50000,    // ₹500.00 (Silver reward)
    gamificationPaise: 30000,   // ₹300.00
  },
};

export const MOCK_TRANSACTIONS: LedgerTransactionItem[] = [
  {
    id: 'tx_01',
    idempotencyKey: 'idemp_ad_88912',
    type: 'AD_VIEW',
    sourceCategory: 'ADS',
    amountPaise: 150, // ₹1.50
    description: 'Ad Reward: Video Impression #1042',
    status: 'CREDITED',
    createdAt: '2026-10-12T11:45:00.000Z',
  },
  {
    id: 'tx_02',
    idempotencyKey: 'idemp_bin_99182',
    type: 'BINARY_MATCHING',
    sourceCategory: 'REFERRALS',
    amountPaise: 30000, // ₹300.00
    description: 'Binary Matching Payout (50:50 Slab 6%)',
    status: 'CREDITED',
    createdAt: '2026-10-12T00:05:00.000Z',
  },
  {
    id: 'tx_03',
    idempotencyKey: 'idemp_lvl_48127',
    type: 'LEVEL_COMMISSION',
    sourceCategory: 'REFERRALS',
    amountPaise: 12500, // ₹125.00
    description: 'Level 1 Direct Commission from Rahul Mehta',
    status: 'CREDITED',
    createdAt: '2026-10-11T18:22:00.000Z',
  },
  {
    id: 'tx_04',
    idempotencyKey: 'idemp_chal_99120',
    type: 'CHALLENGE_REWARD',
    sourceCategory: 'CHALLENGES',
    amountPaise: 2500, // ₹25.00
    description: 'Task Complete: Kotak 811 Registration Postback',
    status: 'CREDITED',
    createdAt: '2026-10-10T14:10:00.000Z',
  },
  {
    id: 'tx_05',
    idempotencyKey: 'idemp_wd_33100',
    type: 'WITHDRAWAL_REQUEST',
    sourceCategory: 'WITHDRAWAL',
    amountPaise: 100000, // ₹1,000.00
    description: 'UPI Payout to vikram***@okhdfcbank',
    status: 'CREDITED',
    createdAt: '2026-10-09T09:15:00.000Z',
  },
  {
    id: 'tx_06',
    idempotencyKey: 'idemp_chk_55112',
    type: 'DAILY_CHECKIN',
    sourceCategory: 'ENGAGEMENT',
    amountPaise: 500, // ₹5.00
    description: 'Day 5 Attendance Streak Claim',
    status: 'CREDITED',
    createdAt: '2026-10-12T06:30:00.000Z',
  },
  {
    id: 'tx_07',
    idempotencyKey: 'idemp_scr_10029',
    type: 'SCRATCH_CARD',
    sourceCategory: 'ENGAGEMENT',
    amountPaise: 1800, // ₹18.00
    description: 'Lucky Golden Scratch Card Win',
    status: 'CREDITED',
    createdAt: '2026-10-11T19:40:00.000Z',
  },
];

export const MOCK_CHALLENGES: ChallengeItem[] = [
  {
    id: 'ch_01',
    title: 'Install Angel One Trading App',
    description: 'Open free demat account, complete OTP, and keep app for 24h',
    icon: 'trending-up',
    taskType: 'APP_INSTALL',
    partnerName: 'Angel One',
    partnerUrl: 'https://angelone.in/partner/adpayon',
    rewardAmountPaise: 3500, // ₹35.00
    validationMethod: 'SERVER_POSTBACK',
    timerSeconds: 90,
    isRequiredForDashboard: true,
    order: 1,
    status: 'ACTIVE',
    userStatus: 'VERIFIED',
  },
  {
    id: 'ch_02',
    title: 'Watch AdPayOn Masterclass Video',
    description: 'Watch the full 2-minute introductory video on binary matching',
    icon: 'play-circle',
    taskType: 'VIDEO_WATCH',
    partnerName: 'AdPayOn Academy',
    partnerUrl: 'https://youtube.com/watch?v=mock_video',
    rewardAmountPaise: 1500, // ₹15.00
    validationMethod: 'AUTO_TIMER',
    timerSeconds: 120,
    isRequiredForDashboard: true,
    order: 2,
    status: 'ACTIVE',
    userStatus: 'VERIFIED',
  },
  {
    id: 'ch_03',
    title: 'Register on Tata Neu Super App',
    description: 'Sign up with your mobile number and browse NeuPass perks',
    icon: 'shopping-bag',
    taskType: 'PARTNER_REGISTER',
    partnerName: 'Tata Neu',
    partnerUrl: 'https://tataneu.com/ref/adpayon',
    rewardAmountPaise: 2500, // ₹25.00
    validationMethod: 'SERVER_POSTBACK',
    timerSeconds: 60,
    isRequiredForDashboard: false,
    order: 3,
    status: 'ACTIVE',
    userStatus: 'IN_PROGRESS',
  },
  {
    id: 'ch_04',
    title: 'Take Brand Survey by Nielsen',
    description: 'Answer 5 quick consumer preference questions',
    icon: 'check-square',
    taskType: 'SURVEY',
    partnerName: 'Nielsen Research',
    partnerUrl: 'https://nielsen.com/survey/adpayon',
    rewardAmountPaise: 2000, // ₹20.00
    validationMethod: 'SCREENSHOT_CONFIRM',
    timerSeconds: 180,
    isRequiredForDashboard: false,
    order: 4,
    status: 'ACTIVE',
    userStatus: 'NOT_STARTED',
  },
];

export const MOCK_TEAM_TREE: TeamMemberNode = {
  id: 'usr_1001',
  name: 'Vikram Sharma (You)',
  referralCode: 'ADP8829',
  mobileMasked: '98765****0',
  level: 0,
  leg: null,
  parentId: null,
  sponsorName: 'Rajesh Verma',
  status: 'ACTIVE',
  isActive: true,
  currentRank: 'SILVER',
  directReferralsCount: 8,
  leftCount: 42,
  rightCount: 38,
  joinedAt: '2026-08-20',
  hasChildren: true,
  children: [
    {
      id: 'usr_2001',
      name: 'Amit Patel',
      referralCode: 'ADP3310',
      mobileMasked: '98111****2',
      level: 1,
      leg: 'LEFT',
      parentId: 'usr_1001',
      sponsorName: 'Vikram Sharma',
      status: 'ACTIVE',
      isActive: true,
      currentRank: 'SILVER',
      directReferralsCount: 5,
      leftCount: 22,
      rightCount: 19,
      joinedAt: '2026-08-25',
      hasChildren: true,
      children: [
        {
          id: 'usr_3001',
          name: 'Pooja Iyer',
          referralCode: 'ADP5520',
          mobileMasked: '97222****5',
          level: 2,
          leg: 'LEFT',
          parentId: 'usr_2001',
          sponsorName: 'Amit Patel',
          status: 'ACTIVE',
          isActive: true,
          currentRank: 'NONE',
          directReferralsCount: 3,
          leftCount: 12,
          rightCount: 9,
          joinedAt: '2026-09-01',
          hasChildren: false,
        },
        {
          id: 'usr_3002',
          name: 'Karan Mehra',
          referralCode: 'ADP6640',
          mobileMasked: '99333****8',
          level: 2,
          leg: 'RIGHT',
          parentId: 'usr_2001',
          sponsorName: 'Amit Patel',
          status: 'INACTIVE',
          isActive: false,
          currentRank: 'NONE',
          directReferralsCount: 0,
          leftCount: 0,
          rightCount: 0,
          joinedAt: '2026-09-04',
          hasChildren: false,
        },
      ],
    },
    {
      id: 'usr_2002',
      name: 'Sneha Roy',
      referralCode: 'ADP4420',
      mobileMasked: '98444****7',
      level: 1,
      leg: 'RIGHT',
      parentId: 'usr_1001',
      sponsorName: 'Vikram Sharma',
      status: 'ACTIVE',
      isActive: true,
      currentRank: 'NONE',
      directReferralsCount: 4,
      leftCount: 20,
      rightCount: 17,
      joinedAt: '2026-08-28',
      hasChildren: true,
      children: [
        {
          id: 'usr_3003',
          name: 'Deepak Joshi',
          referralCode: 'ADP7710',
          mobileMasked: '97555****1',
          level: 2,
          leg: 'LEFT',
          parentId: 'usr_2002',
          sponsorName: 'Sneha Roy',
          status: 'ACTIVE',
          isActive: true,
          currentRank: 'NONE',
          directReferralsCount: 2,
          leftCount: 10,
          rightCount: 7,
          joinedAt: '2026-09-10',
          hasChildren: false,
        },
        {
          id: 'usr_3004',
          name: 'Manish Gupta',
          referralCode: 'ADP8830',
          mobileMasked: '99666****4',
          level: 2,
          leg: 'RIGHT',
          parentId: 'usr_2002',
          sponsorName: 'Sneha Roy',
          status: 'ACTIVE',
          isActive: true,
          currentRank: 'NONE',
          directReferralsCount: 1,
          leftCount: 5,
          rightCount: 4,
          joinedAt: '2026-09-12',
          hasChildren: false,
        },
      ],
    },
  ],
};

export const MOCK_STREAK: DailyStreakItem[] = [
  { day: 1, rewardAmountPaise: 200, isClaimed: true, isToday: false, isLocked: false },
  { day: 2, rewardAmountPaise: 300, isClaimed: true, isToday: false, isLocked: false },
  { day: 3, rewardAmountPaise: 400, isClaimed: true, isToday: false, isLocked: false },
  { day: 4, rewardAmountPaise: 500, isClaimed: true, isToday: false, isLocked: false },
  { day: 5, rewardAmountPaise: 700, isClaimed: true, isToday: true, isLocked: false },
  { day: 6, rewardAmountPaise: 1000, isClaimed: false, isToday: false, isLocked: true },
  { day: 7, rewardAmountPaise: 2500, isClaimed: false, isToday: false, isLocked: true },
];

export const MOCK_QUIZ_QUESTIONS: QuizQuestionItem[] = [
  {
    id: 'q_1',
    question: 'How many upline generations receive level commissions in AdPayOn?',
    options: ['4 Levels', '6 Levels', '8 Levels', '10 Levels'],
    correctIndex: 2,
    category: 'Plan Knowledge',
    timeLimitSec: 20,
  },
  {
    id: 'q_2',
    question: 'What percentage of Level 1 direct sponsorship commission is paid?',
    options: ['15%', '20%', '25%', '30%'],
    correctIndex: 2,
    category: 'Commissions',
    timeLimitSec: 20,
  },
  {
    id: 'q_3',
    question: 'What happens to the remaining volume on the stronger leg after binary matching?',
    options: ['Flushed completely', 'Carried forward to next cycle', 'Converted to bonus points', 'Given to upline'],
    correctIndex: 1,
    category: 'Binary Rules',
    timeLimitSec: 20,
  },
];

export const MOCK_QUIZ_LEADERBOARD: QuizLeaderboardEntry[] = [
  { rank: 1, userId: 'usr_501', name: 'Rohan Deshmukh', score: 300, timeTakenSec: 14, rewardPaise: 25000 },
  { rank: 2, userId: 'usr_502', name: 'Priya Nambiar', score: 290, timeTakenSec: 16, rewardPaise: 15000 },
  { rank: 3, userId: 'usr_503', name: 'Vikram Sharma (You)', score: 280, timeTakenSec: 18, rewardPaise: 10000 },
  { rank: 4, userId: 'usr_504', name: 'Kunal Singhania', score: 270, timeTakenSec: 21, rewardPaise: 5000 },
  { rank: 5, userId: 'usr_505', name: 'Ananya Roy', score: 260, timeTakenSec: 22, rewardPaise: 2500 },
];

export const MOCK_SCRATCH_CARDS: ScratchCardItem[] = [
  {
    id: 'sc_01',
    title: 'Daily Streak Bonus Card',
    source: 'Attendance Milestone',
    isScratched: true,
    rewardAmountPaise: 1800, // ₹18.00
    revealedAt: '2026-10-11T19:40:00.000Z',
  },
  {
    id: 'sc_02',
    title: 'Silver Achiever Gold Card',
    source: 'Rank Promotion Bonus',
    isScratched: false,
    rewardAmountPaise: 5000, // ₹50.00
  },
  {
    id: 'sc_03',
    title: 'Lucky Weekend Surprise Card',
    source: 'Active Binary Pair',
    isScratched: false,
    rewardAmountPaise: 2500, // ₹25.00
  },
];

export const MOCK_RECHARGE_PLANS: RechargePlan[] = [
  {
    id: 'plan_1',
    operator: 'Jio',
    circle: 'Mumbai / Maharashtra',
    planType: 'UNLIMITED',
    amountPaise: 29900, // ₹299.00
    validity: '28 Days',
    data: '1.5 GB/Day',
    talktime: 'Unlimited',
    description: 'Unlimited Voice Calls + 1.5 GB/Day 4G/5G data + 100 SMS/day + JioCinema',
  },
  {
    id: 'plan_2',
    operator: 'Airtel',
    circle: 'Delhi / NCR',
    planType: 'UNLIMITED',
    amountPaise: 34900, // ₹349.00
    validity: '28 Days',
    data: '2.0 GB/Day',
    talktime: 'Unlimited',
    description: 'True 5G Unlimited + Wynk Music + Apollo 24/7 Circle + FASTag Cashback',
  },
  {
    id: 'plan_3',
    operator: 'Vi',
    circle: 'Pan India',
    planType: 'DATA',
    amountPaise: 11800, // ₹118.00
    validity: 'Existing',
    data: '12 GB',
    talktime: 'NA',
    description: 'Data Add-on with Binge All Night benefits from 12 AM to 6 AM',
  },
];

export const MOCK_SHOPPING_STORES: ShoppingStoreItem[] = [
  {
    id: 'st_1',
    name: 'Amazon India',
    logo: 'shopping-cart',
    category: 'Mega Store',
    cashbackRate: 'Up to 7.5% Cashback',
    affiliateUrl: 'https://amazon.in/?tag=adpayon-21',
    badge: 'Popular',
  },
  {
    id: 'st_2',
    name: 'Flipkart',
    logo: 'box',
    category: 'Electronics & Fashion',
    cashbackRate: 'Up to 8.2% Cashback',
    affiliateUrl: 'https://flipkart.com/?affid=adpayon',
    badge: 'Super Saver',
  },
  {
    id: 'st_3',
    name: 'Myntra Fashion',
    logo: 'tag',
    category: 'Apparel & Footwear',
    cashbackRate: 'Flat 6.0% Cashback',
    affiliateUrl: 'https://myntra.com/?ref=adpayon',
    badge: 'Trending',
  },
  {
    id: 'st_4',
    name: 'Ajio Luxe',
    logo: 'gem',
    category: 'Premium Lifestyle',
    cashbackRate: 'Up to 10% Cashback',
    affiliateUrl: 'https://ajio.com/?aff=adpayon',
  },
];
