import { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Dashboard: undefined;
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
  OTPVerify: { mobile: string; mode: 'SIGNUP' | 'LOGIN' | 'RESET' };
  ForgotPassword: undefined;
  OnboardingChallenges: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  ReferralInvite: undefined;
  QuizLeaderboard: undefined;
  ScratchEarn: undefined;
  RankRewards: undefined;
  DailyStreak: undefined;
  MobileRecharge: undefined;
  ShoppingCashback: undefined;
  KycUpload: undefined;
};
