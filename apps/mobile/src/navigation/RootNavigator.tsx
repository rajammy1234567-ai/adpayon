import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { THEME } from '../constants/theme';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { IntroScreen } from '../screens/auth/IntroScreen';
import { OTPLoginScreen } from '../screens/auth/OTPLoginScreen';
import { OTPVerifyScreen } from '../screens/auth/OTPVerifyScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { DailyStreakScreen } from '../screens/gamification/DailyStreakScreen';
import { RankRewardsScreen } from '../screens/gamification/RankRewardsScreen';
import { ScratchEarnScreen } from '../screens/gamification/ScratchEarnScreen';
import { ChallengeListScreen } from '../screens/onboarding/ChallengeListScreen';
import { KycUploadScreen } from '../screens/profile/KycUploadScreen';
import { QuizLeaderboardScreen } from '../screens/quiz/QuizLeaderboardScreen';
import { ReferralInviteScreen } from '../screens/referral/ReferralInviteScreen';
import { MobileRechargeScreen } from '../screens/utility/MobileRechargeScreen';
import { ShoppingCashbackScreen } from '../screens/utility/ShoppingCashbackScreen';
import { VideoWatchTaskScreen } from '../screens/earn/VideoWatchTaskScreen';
import { YouTubeLearningTaskScreen } from '../screens/earn/YouTubeLearningTaskScreen';
import { ArticleReadTaskScreen } from '../screens/earn/ArticleReadTaskScreen';
import { AppInstallTaskScreen } from '../screens/earn/AppInstallTaskScreen';
import { AppTabs } from './AppTabs';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/authStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: THEME.colors.emerald,
    background: THEME.colors.background,
    card: THEME.colors.surface,
    text: THEME.colors.textPrimary,
    border: THEME.colors.borderSubtle,
    notification: THEME.colors.gold,
  },
};

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isInitialized, user } = useAuthStore();

  return (
    <NavigationContainer theme={AppNavTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: THEME.colors.background },
        }}
      >
        {!isInitialized ? (
          // 1. App Launch & Session Rehydration Phase
          <Stack.Screen name="Splash" component={SplashScreen} />
        ) : !isAuthenticated ? (
          // 2. Unauthenticated Auth Flow (Zero authenticated screens in memory or back stack)
          <Stack.Group>
            <Stack.Screen name="Intro" component={IntroScreen} />
            <Stack.Screen name="OTPLogin" component={OTPLoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="OTPVerify" component={OTPVerifyScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </Stack.Group>
        ) : (
          // 3. Authenticated App Flow (Zero auth/login screens in memory or back history)
          <Stack.Group>
            {user && !user.dashboardUnlocked ? (
              <Stack.Screen name="OnboardingChallenges" component={ChallengeListScreen} />
            ) : null}
            <Stack.Screen name="MainTabs" component={AppTabs} />
            {user?.dashboardUnlocked ? (
              <Stack.Screen name="OnboardingChallenges" component={ChallengeListScreen} />
            ) : null}
            <Stack.Screen name="ReferralInvite" component={ReferralInviteScreen} />
            <Stack.Screen name="QuizLeaderboard" component={QuizLeaderboardScreen} />
            <Stack.Screen name="ScratchEarn" component={ScratchEarnScreen} />
            <Stack.Screen name="RankRewards" component={RankRewardsScreen} />
            <Stack.Screen name="DailyStreak" component={DailyStreakScreen} />
            <Stack.Screen name="MobileRecharge" component={MobileRechargeScreen} />
            <Stack.Screen name="ShoppingCashback" component={ShoppingCashbackScreen} />
            <Stack.Screen name="KycUpload" component={KycUploadScreen} />
            <Stack.Screen name="VideoWatchTask" component={VideoWatchTaskScreen} />
            <Stack.Screen name="YouTubeLearningTask" component={YouTubeLearningTaskScreen} />
            <Stack.Screen name="ArticleReadTask" component={ArticleReadTaskScreen} />
            <Stack.Screen name="AppInstallTask" component={AppInstallTaskScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
