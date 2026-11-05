export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

export interface Campaign {
  id: string;
  name: string;
  advertiserName: string;
  description?: string;
  status: CampaignStatus;
  isSandbox?: boolean;
  advertiserBudgetPaise: number;
  spentBudgetPaise: number;
  authorizedAgreementRef: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskCategory =
  | 'IN_APP_ACTION'
  | 'PARTNER_WEBHOOK'
  | 'SURVEY'
  | 'MANUAL_VERIFY'
  | 'ARTICLE_READ'
  | 'VIDEO_WATCH'
  | 'APP_INSTALL'
  | 'YOUTUBE_LEARNING'
  | 'APP_TESTING';
export type VerificationMethod = 'FIRST_PARTY_ACTION' | 'AUTHENTICATED_WEBHOOK' | 'MANUAL_REVIEW';
export type TaskStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';

export interface TaskTargeting {
  minAncestryDepth?: number;
  kycRequired?: boolean;
  allowedStates?: string[];
  assignedUserIds?: string[];
  userGroups?: string[];
}

export interface ComprehensionQuiz {
  question: string;
  options: string[];
  correctOptionIndex: number;
}

export interface ArticleReadConfig {
  articleTitle: string;
  articleContent: string;
  sourceUrl?: string;
  minReadDurationSeconds: number;
  minScrollPercentage: number;
  comprehensionQuiz?: ComprehensionQuiz;
}

export interface VideoWatchConfig {
  videoUrl: string;
  videoDurationSeconds: number;
  videoDuration?: number;
  requiredWatchSeconds: number;
  allowSeeking?: boolean;
  sessionTimeoutSeconds?: number;
  completionPolicy?: 'FULL_VIDEO' | 'MINIMUM_DURATION';
  comprehensionQuiz?: ComprehensionQuiz;
}

export interface YouTubeLearningConfig {
  youtubeUrl: string;
  videoId: string;
  videoTitle?: string;
  requiredDurationSeconds?: number;
  sessionDurationSeconds?: number;
  instructions?: string;
  educationalNotice?: string;
  comprehensionQuiz?: ComprehensionQuiz;
}

export interface AppInstallConfig {
  appName: string;
  packageName: string;
  platform: 'ANDROID' | 'IOS' | 'CROSS_PLATFORM';
  storeUrl: string;
  attributionMethod: 'SIGNED_POSTBACK' | 'MANUAL_REVIEW' | 'IN_APP_FEEDBACK' | 'PARTNER_CALLBACK' | 'USAGE_STATS' | 'CLIENT_PACKAGE_PRESENCE';
  conversionEvent: 'INSTALL' | 'FIRST_OPEN' | 'REGISTER' | 'IN_APP_PURCHASE' | 'INSTALL_ONLY';
  testingSteps?: string;
  feedbackQuestion?: string;
  requiredTestingSeconds?: number;
  completionCode?: string;
}

export interface Task {
  id: string;
  campaignId: string;
  isSandbox?: boolean;
  campaign?: {
    id: string;
    name: string;
    advertiserName: string;
    status: CampaignStatus;
    isSandbox?: boolean;
  };
  title: string;
  description: string;
  category: TaskCategory;
  verificationMethod: VerificationMethod;
  rewardPoints: number; // Non-withdrawable promotional points
  totalCap: number;
  completionsCount: number;
  dailyCapPerUser: number;
  dwellTimeSeconds: number;
  targeting?: TaskTargeting;
  externalActionUrl?: string;
  instructions?: string;
  articleReadConfig?: ArticleReadConfig;
  videoWatchConfig?: VideoWatchConfig;
  youtubeLearningConfig?: YouTubeLearningConfig;
  appInstallConfig?: AppInstallConfig;
  expiresAt?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export type CompletionStatus = 'VERIFIED' | 'FLAGGED' | 'REJECTED' | 'PENDING_REVIEW';

export interface VerificationEvidence {
  id: string;
  externalTransactionId?: string;
  payload?: any;
  ipAddress?: string;
  signatureReceived?: string;
  signatureValid?: boolean;
  createdAt: string;
}

export interface TaskCompletion {
  id: string;
  taskId: {
    _id: string;
    title: string;
    rewardPoints: number;
    category: TaskCategory;
  } | string;
  campaignId: {
    _id: string;
    name: string;
    advertiserName: string;
  } | string;
  userId: {
    _id: string;
    name: string;
    mobile: string;
  } | string;
  clickId: string;
  rewardPoints: number;
  status: CompletionStatus;
  verificationMethod: VerificationMethod;
  evidence?: VerificationEvidence;
  completedAt: string;
  rejectionReason?: string;
  adminReviewNotes?: string;
  reviewedBy?: string;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  admin?: {
    _id: string;
    name: string;
    mobile: string;
    role: string;
  };
  action: string;
  targetEntity: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  createdAt: string;
}

export interface PlatformMetrics {
  campaigns: {
    total: number;
    active: number;
    draft: number;
    paused: number;
  };
  tasks: {
    total: number;
    published: number;
    draft: number;
    paused: number;
  };
  completions: {
    total: number;
    verified: number;
    flagged: number;
    rejected: number;
  };
  financial: {
    totalBudgetPaise: number;
    totalSpentPaise: number;
    totalRewardPointsAwarded: number;
  };
}

export interface AdminUser {
  id: string;
  mobile: string;
  name: string;
  role: 'ADMIN';
  status: 'ACTIVE';
  referralCode: string;
  permissions: string[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminNewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  category: string;
  isPublished: boolean;
  priority: number;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoryStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  bannerUrl?: string;
  displayOrder: number;
  status: CategoryStatus;
  offersCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type OfferStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'EXPIRED';

export interface OfferContent {
  logoUrl?: string;
  benefits?: string[];
  eligibility?: string[];
  documents?: string[];
  terms?: string[];
  trackingNotes?: string[];
  payoutNotes?: string[];
  marketingMessage?: string;
  marketingBanners?: { title: string; imageUrl: string }[];
}

export interface OfferTrainingLink {
  title: string;
  url: string;
  description?: string;
  thumbnailUrl?: string;
}

export interface OfferFaq {
  question: string;
  answer: string;
}

export interface OfferCompletionConditions {
  actionType: 'LINK_VISIT' | 'SIGNUP_SUBMIT' | 'FORM_FILL' | 'PURCHASE' | 'CUSTOM';
  targetUrl?: string;
  requiresProof?: boolean;
  proofInstructions?: string;
  completionCodeRequired?: boolean;
}

export interface Offer {
  content?: OfferContent;
  personalStats?: { earningsPaise: number; totalLeads: number; totalSales: number };
  submission?: { id: string; status: string; reviewNotes?: string };
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  category?: Category;
  description: string;
  rewardPoints: number;
  status: OfferStatus;
  displayOrder: number;
  expiresAt?: string | null;
  bannerUrl?: string;
  images: string[];
  instructions: string[];
  additionalNotes?: string;
  trainingLinks: OfferTrainingLink[];
  faqs: OfferFaq[];
  completionConditions: OfferCompletionConditions;
  completionsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

