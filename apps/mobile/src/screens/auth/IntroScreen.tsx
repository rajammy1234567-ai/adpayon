import React, { useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useSettingsStore } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { useDemoStore } from '../../store/demoStore';
import { DEMO_USER } from '../../constants/demoData';

type Props = NativeStackScreenProps<RootStackParamList, 'Intro'>;

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '💎',
    title: 'Fintech Earning Engine',
    desc: 'Watch ads, complete partner offers, and solve daily quizzes to earn real money directly into your double-entry wallet ledger.',
  },
  {
    icon: '🌳',
    title: '8-Level Direct Network',
    desc: 'Earn up to 55% level commissions across 8 upline generations from your active referral team members.',
  },
  {
    icon: '⚖️',
    title: '40% Binary Matching',
    desc: 'Automated daily matching slabs on Left & Right leg volume with fair carry-forward of weaker legs.',
  },
  {
    icon: '⚡',
    title: 'Instant KYC Withdrawals',
    desc: 'Bank-grade security, instant UPI transfers, and mobile recharges with append-only ledger audit integrity.',
  },
];

export const IntroScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettingsStore();
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      navigation.navigate('Signup');
    }
  };

  const isProduction = process.env.EXPO_PUBLIC_APP_ENV === 'production';

  const handleEnterDemo = () => {
    useDemoStore.getState().enterDemoMode();
    useAuthStore.getState().login(DEMO_USER, 'demo_access_token');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar with Language Toggle */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Text style={styles.brandEmoji}>⚡</Text>
          <Text style={styles.brandText}>AdPayOn</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setLanguage(language === 'en' ? 'hi' : 'en')}
          style={styles.langBadge}
        >
          <Text style={styles.langText}>
            {language === 'en' ? '🌐 हिन्दी' : '🌐 English'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Slide Content */}
      <View style={styles.slideContainer}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>{SLIDES[currentSlide].icon}</Text>
        </View>
        <Text style={styles.slideTitle}>{SLIDES[currentSlide].title}</Text>
        <Text style={styles.slideDesc}>{SLIDES[currentSlide].desc}</Text>

        {/* Indicators */}
        <View style={styles.indicatorRow}>
          {SLIDES.map((_, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setCurrentSlide(index)}
              style={[
                styles.dot,
                currentSlide === index ? styles.activeDot : undefined,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <Button
          title={
            currentSlide === SLIDES.length - 1
              ? t('auth.signup')
              : t('common.continue')
          }
          onPress={handleNext}
          variant="primary"
          size="lg"
          style={styles.primaryBtn}
        />
        <Button
          title={t('auth.login')}
          onPress={() => navigation.navigate('OTPLogin')}
          variant="secondary"
          size="md"
        />
        {!isProduction && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleEnterDemo}
            style={styles.demoBtn}
          >
            <Text style={styles.demoBtnText}>🚀 Explore Client Demo Mode (Sample Data)</Text>
            <Text style={styles.demoBtnSub}>Offline preview • No login required</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    justifyContent: 'space-between',
    padding: THEME.spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandEmoji: {
    fontSize: 24,
    marginRight: 6,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.5,
  },
  langBadge: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
  },
  langText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  slideContainer: {
    alignItems: 'center',
    paddingHorizontal: THEME.spacing.xl,
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: THEME.colors.emerald,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  iconEmoji: {
    fontSize: 52,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  slideDesc: {
    fontSize: 15,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.border,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 24,
    backgroundColor: THEME.colors.emerald,
  },
  actions: {
    paddingBottom: THEME.spacing.lg,
  },
  primaryBtn: {
    marginBottom: 12,
  },
  demoBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.lg,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: THEME.colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBtnText: {
    color: THEME.colors.emerald,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  demoBtnSub: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});
