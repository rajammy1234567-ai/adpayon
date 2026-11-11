import { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Dashboard: undefined;
  Categories: { categoryId?: string; categorySlug?: string } | undefined;
  Wallet: undefined;
  Team: undefined;
  Earn: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Intro: undefined;
  OTPLogin: undefined;
  Signup: undefined;
  OTPVerify: { mobile: string; mode: 'SIGNUP' | 'LOGIN' | 'RESET'; testOtp?: string };
  ForgotPassword: undefined;
  OnboardingChallenges: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  OfferDetails: { offerId: string; slug?: string; refCode?: string };
  ReferralInvite: undefined;
  QuizLeaderboard: undefined;
  ScratchEarn: undefined;
  RankRewards: undefined;
  DailyStreak: undefined;
  PlayAndEarn: undefined;
  VideoWall: undefined;
  NewsTasks: undefined;
  MobileRecharge: undefined;
  ShoppingCashback: undefined;
  KycUpload: undefined;
  VideoWatchTask: { taskId: string; assignmentId?: string };
  YouTubeLearningTask: { taskId: string; assignmentId?: string };
  ArticleReadTask: { taskId: string; assignmentId?: string };
  AppInstallTask: { taskId: string; assignmentId?: string };
};

