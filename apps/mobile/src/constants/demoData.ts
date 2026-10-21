import { TaskFeedItem, TaskSummaryData } from '../services/api/task.api';
import { UserProfile } from '@adpayon/shared';

export const DEMO_USER: UserProfile = {
  id: 'demo_client_reviewer',
  name: 'Client Demo Reviewer',
  mobile: '9876543210',
  countryCode: '+91',
  role: 'USER',
  status: 'ACTIVE',
  isActive: true,
  referralCode: 'DEMO777',
  sponsorId: null,
  parentId: null,
  leg: null,
  materializedPath: '',
  depth: 1,
  binaryStats: {
    leftCount: 0,
    rightCount: 0,
    leftVolumeUnits: 0,
    rightVolumeUnits: 0,
    leftCarryForwardUnits: 0,
    rightCarryForwardUnits: 0,
    lifetimeMatchedVolumeUnits: 0,
  },
  directReferralsCount: 0,
  currentRank: 'NONE',
  deviceId: 'DEMO_DEVICE_ID',
  signupBonusClaimed: true,
  dashboardUnlocked: true,
  streakCount: 3,
  isKycVerified: true,
  kycDetails: {
    status: 'VERIFIED',
  },
  createdAt: new Date().toISOString(),
};

export const DEMO_TASKS: TaskFeedItem[] = [
  {
    id: 'demo_video_task_001',
    campaignName: 'Android QA Media Labs [DEMO]',
    title: 'Android QA: Watch Test Video',
    description: 'Watch the promotional video and complete verification to preview the video player experience.',
    category: 'VIDEO_WATCH',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 50,
    dailyCapPerUser: 1,
    completedToday: 0,
    dwellTimeSeconds: 5,
    isEligible: true,
    hasActiveAssignment: false,
    videoWatchConfig: {
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      videoDurationSeconds: 60,
      requiredWatchSeconds: 5,
      allowSeeking: false,
      sessionTimeoutSeconds: 300,
      completionPolicy: 'MINIMUM_DURATION',
    },
  },
  {
    id: 'demo_article_task_001',
    campaignName: 'Android QA Editorial Labs [DEMO]',
    title: 'Android QA: Read How Internet Works',
    description: 'Read the technical guide, scroll through the content, and solve the quiz to test the reader engine.',
    category: 'ARTICLE_READ',
    verificationMethod: 'FIRST_PARTY_ACTION',
    rewardPoints: 25,
    dailyCapPerUser: 1,
    completedToday: 0,
    dwellTimeSeconds: 15,
    isEligible: true,
    hasActiveAssignment: false,
    articleReadConfig: {
      articleTitle: 'How the Internet Works: From DNS to Packets',
      articleContent: `The Internet is a globally interconnected network of computers communicating through standardized protocols. When you type a web address into your browser, the system first contacts a Domain Name System (DNS) server to translate the human-readable domain into a machine-readable IP address.

Once the destination IP address is determined, your device initiates a Transmission Control Protocol (TCP) handshake to establish a reliable end-to-end communication channel. Data is fragmented into discrete packets, each stamped with origin and destination addresses, and routed dynamically across undersea fiber cables and regional internet exchange points.

Security is maintained through Transport Layer Security (TLS), which encrypts the data stream to prevent eavesdropping and man-in-the-middle tampering. This ensures your financial and personal data remains strictly confidential across open networks.`,
      minReadDurationSeconds: 10,
      minScrollPercentage: 80,
      comprehensionQuiz: {
        question: 'What is the primary role of DNS?',
        options: [
          'Translates domain names to IP addresses',
          'Encrypts your hard drive',
          'Generates cryptocurrencies',
          'Provides cellular connectivity',
        ],
      },
    },
  },
  {
    id: 'demo_app_task_001',
    campaignName: 'Android QA Discovery Labs [DEMO]',
    title: 'Android QA: Discover Public Utility App',
    description: 'Review the app description and launch the official Google Play Store listing to test the safe store redirection flow.',
    category: 'APP_INSTALL',
    verificationMethod: 'AUTHENTICATED_WEBHOOK',
    rewardPoints: 25,
    dailyCapPerUser: 1,
    completedToday: 0,
    dwellTimeSeconds: 0,
    isEligible: true,
    hasActiveAssignment: false,
    appInstallConfig: {
      appName: 'DiskUsage Utility',
      packageName: 'com.google.android.diskusage',
      platform: 'ANDROID',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.google.android.diskusage',
      attributionMethod: 'SIGNED_POSTBACK',
      conversionEvent: 'FIRST_OPEN',
    },
  },
];

export const DEMO_SUMMARY: TaskSummaryData = {
  totalCompleted: 2,
  totalRewardPoints: 75,
};

export const DEMO_HISTORY = [
  {
    id: 'demo_hist_001',
    task: {
      id: 'demo_video_task_001',
      title: 'Android QA: Watch Test Video',
      category: 'VIDEO_WATCH' as const,
    },
    rewardPoints: 50,
    status: 'VERIFIED' as const,
    verificationMethod: 'FIRST_PARTY_ACTION' as const,
    completedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'demo_hist_002',
    task: {
      id: 'demo_article_task_001',
      title: 'Android QA: Read How Internet Works',
      category: 'ARTICLE_READ' as const,
    },
    rewardPoints: 25,
    status: 'VERIFIED' as const,
    verificationMethod: 'FIRST_PARTY_ACTION' as const,
    completedAt: new Date(Date.now() - 1800000).toISOString(),
  },
];
