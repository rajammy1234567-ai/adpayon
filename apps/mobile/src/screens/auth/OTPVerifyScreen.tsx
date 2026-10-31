import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { sendOtpApi, verifyOtpApi } from '../../services/api/auth.api';

type Props = NativeStackScreenProps<RootStackParamList, 'OTPVerify'>;

export const OTPVerifyScreen: React.FC<Props> = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { mobile, mode, testOtp } = route.params;
  const isProduction = process.env.EXPO_PUBLIC_APP_ENV === 'production';
  const { setAuthSession } = useAuthStore();
  const inputRef = useRef<TextInput>(null);

  const [otp, setOtp] = useState('');
  const [currentTestOtp, setCurrentTestOtp] = useState<string | undefined>(
    isProduction ? undefined : testOtp
  );
  const [timer, setTimer] = useState(45);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getPurpose = (): 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET' => {
    if (mode === 'SIGNUP') return 'REGISTRATION';
    if (mode === 'LOGIN') return 'LOGIN';
    return 'PASSWORD_RESET';
  };

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Please enter all 6 digits of your verification code');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const response = await verifyOtpApi({
        mobile: mobile.trim(),
        otp: otp.trim(),
        purpose: getPurpose(),
      });

      if (response.success && response.data?.tokens && response.data?.user) {
        // Securely persist tokens (declaratively transitions RootNavigator to authenticated stack)
        await setAuthSession(response.data.user, response.data.tokens);
      } else {
        if (mode === 'RESET') {
          navigation.replace('OTPLogin');
        }
      }
    } catch (err: any) {
      if (err.code === 'MAX_ATTEMPTS_EXCEEDED') {
        setError('Maximum verification attempts exceeded. Please request a new code.');
      } else if (err.code === 'INVALID_OTP') {
        setError(err.message || 'Invalid verification code entered.');
      } else if (err.code === 'EXPIRED_OR_NOT_FOUND') {
        setError('Verification code expired or not found. Please request a new code.');
      } else {
        setError(err.message || 'Verification failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0 || isResending) return;
    setIsResending(true);
    setError('');

    try {
      const res = await sendOtpApi({
        mobile: mobile.trim(),
        purpose: getPurpose(),
      });
      if (res.data?.testOtp && !isProduction) {
        setCurrentTestOtp(res.data.testOtp);
      }
      setTimer(45);
      setOtp('');
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.container}>
      <Header title={t('auth.verifyOtp')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>📱</Text>
          </View>
          <Text style={styles.title}>{t('auth.verifyOtp')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.otpSentTo')} +91 {mobile}
          </Text>

          {!isProduction && currentTestOtp ? (
            <View style={styles.stagingBanner}>
              <View style={styles.stagingBadge}>
                <Text style={styles.stagingBadgeText}>Staging test OTP — no SMS sent</Text>
              </View>
              <Text style={styles.stagingOtpCode}>{currentTestOtp}</Text>
              <Text style={styles.stagingWarning}>TEST OTP — NOT FOR PRODUCTION</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.stagingAutoFillBtn}
                onPress={() => {
                  setOtp(currentTestOtp);
                  setError('');
                }}
              >
                <Text style={styles.stagingAutoFillText}>⚡ Tap to Auto-fill Code</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Card variant="elevated" style={styles.card}>
            <Text style={styles.otpLabel}>{t('auth.enterOtp')}</Text>

            {/* Clickable OTP Digit Box Area - Focusing input on tap */}
            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={styles.otpBoxRow}
              accessibilityRole="button"
              accessibilityLabel="Verification code input"
            >
              {Array.from({ length: 6 }).map((_, index) => {
                const digit = otp[index] || '';
                const isCurrent = otp.length === index;
                return (
                  <View
                    key={index}
                    style={[
                      styles.digitBox,
                      digit ? styles.digitBoxFilled : undefined,
                      isCurrent ? styles.digitBoxActive : undefined,
                    ]}
                  >
                    <Text style={styles.digitText}>{digit}</Text>
                  </View>
                );
              })}
            </Pressable>

            {/* Hidden Input to handle keyboard */}
            <TextInput
              ref={inputRef}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(text) => {
                setOtp(text);
                setError('');
              }}
              style={styles.hiddenInput}
              autoFocus
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button
              title="Verify & Continue"
              onPress={handleVerify}
              variant="primary"
              size="lg"
              isLoading={isLoading}
              style={styles.verifyBtn}
            />

            <View style={styles.resendRow}>
              {timer > 0 ? (
                <Text style={styles.timerText}>
                  Resend OTP in <Text style={styles.timerBold}>{timer}s</Text>
                </Text>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleResend}
                  disabled={isResending}
                >
                  <Text style={styles.resendLink}>
                    {isResending ? 'Sending...' : t('auth.resendOtp')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: THEME.colors.primarySubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    padding: THEME.spacing.xl,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
  },
  otpLabel: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  otpBoxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    gap: 8,
  },
  digitBox: {
    flex: 1,
    height: 52,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitBoxFilled: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primarySubtle,
  },
  digitBoxActive: {
    borderColor: THEME.colors.primary,
  },
  digitText: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  verifyBtn: {
    width: '100%',
    marginTop: 8,
  },
  resendRow: {
    marginTop: 20,
  },
  timerText: {
    color: THEME.colors.textMuted,
    fontSize: 13,
  },
  timerBold: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  resendLink: {
    color: THEME.colors.primary,
    fontWeight: '800',
    fontSize: 14,
  },
  stagingBanner: {
    width: '100%',
    backgroundColor: THEME.colors.goldSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.gold,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.md,
    alignItems: 'center',
    marginBottom: 20,
  },
  stagingBadge: {
    backgroundColor: THEME.colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  stagingBadgeText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stagingOtpCode: {
    fontSize: 28,
    fontWeight: '900',
    color: THEME.colors.gold,
    letterSpacing: 6,
    marginVertical: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  stagingWarning: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  stagingAutoFillBtn: {
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.gold,
    ...THEME.shadows.card,
  },
  stagingAutoFillText: {
    color: THEME.colors.gold,
    fontSize: 12,
    fontWeight: '700',
  },
});
