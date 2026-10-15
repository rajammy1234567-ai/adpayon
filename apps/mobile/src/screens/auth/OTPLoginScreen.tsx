import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { loginApi, sendOtpApi } from '../../services/api/auth.api';

type Props = NativeStackScreenProps<RootStackParamList, 'OTPLogin'>;

export const OTPLoginScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { setAuthSession } = useAuthStore();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [errors, setErrors] = useState<{ mobile?: string; password?: string; general?: string }>({});

  const validate = () => {
    const err: { mobile?: string; password?: string } = {};
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      err.mobile = 'Enter a valid 10-digit Indian mobile number';
    }
    if (!password || password.length < 6) {
      err.password = 'Password must be at least 6 characters';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handlePasswordLogin = async () => {
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});

    try {
      const response = await loginApi({
        mobile: mobile.trim(),
        password,
      });

      if (response.success && response.data?.tokens && response.data?.user) {
        // Securely establish authenticated session (declaratively transitions RootNavigator to MainTabs)
        await setAuthSession(response.data.user, response.data.tokens);
      }
    } catch (err: any) {
      if (err.code === 'PENDING_VERIFICATION') {
        // Account needs phone verification before first password login; redirect to OTP verify
        navigation.navigate('OTPVerify', {
          mobile: mobile.trim(),
          mode: 'SIGNUP',
        });
      } else if (err.code === 'INVALID_CREDENTIALS') {
        setErrors({ general: 'Invalid mobile number or password.' });
      } else if (err.code === 'ACCOUNT_SUSPENDED') {
        setErrors({ general: err.message || 'Account is suspended. Please contact support.' });
      } else {
        setErrors({ general: err.message || 'Login failed. Please verify credentials.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      setErrors({ mobile: 'Enter a valid 10-digit mobile number' });
      return;
    }
    setIsOtpLoading(true);
    setErrors({});

    try {
      await sendOtpApi({
        mobile: mobile.trim(),
        purpose: 'LOGIN',
      });
      navigation.navigate('OTPVerify', { mobile: mobile.trim(), mode: 'LOGIN' });
    } catch (err: any) {
      setErrors({ general: err.message || 'Failed to dispatch login OTP. Please try again.' });
    } finally {
      setIsOtpLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconEmoji}>🔐</Text>
            </View>
            <Text style={styles.title}>{t('auth.welcome')}</Text>
            <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
          </View>

          {/* Form Card */}
          <Card variant="elevated" style={styles.card}>
            {errors.general ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            ) : null}

            <Input
              label={t('auth.mobileNumber')}
              placeholder={t('auth.mobilePlaceholder')}
              keyboardType="phone-pad"
              maxLength={10}
              value={mobile}
              onChangeText={(text) => {
                setMobile(text);
                if (errors.mobile || errors.general) {
                  setErrors({ ...errors, mobile: undefined, general: undefined });
                }
              }}
              error={errors.mobile}
              leftIcon={<Text style={styles.prefix}>+91</Text>}
            />

            <Input
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password || errors.general) {
                  setErrors({ ...errors, password: undefined, general: undefined });
                }
              }}
              error={errors.password}
              rightIcon={
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              }
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>

            <Button
              title={t('auth.login')}
              onPress={handlePasswordLogin}
              variant="primary"
              size="lg"
              isLoading={isLoading}
              style={styles.submitBtn}
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <Button
              title="Sign in with Quick OTP"
              onPress={handleRequestOtp}
              variant="secondary"
              size="md"
              isLoading={isOtpLoading}
            />
          </Card>

          {/* Register Link */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>{t('auth.dontHaveAccount')}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Signup')}
            >
              <Text style={styles.footerLink}> {t('auth.signup')}</Text>
            </TouchableOpacity>
          </View>
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
  scroll: {
    padding: THEME.spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    padding: THEME.spacing.xl,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: THEME.colors.danger,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  prefix: {
    color: THEME.colors.emerald,
    fontWeight: '800',
    fontSize: 15,
    marginRight: 6,
  },
  eyeIcon: {
    fontSize: 18,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -4,
  },
  forgotText: {
    color: THEME.colors.emerald,
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    marginBottom: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.colors.border,
  },
  dividerText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
  },
  footerLink: {
    color: THEME.colors.emerald,
    fontSize: 14,
    fontWeight: '800',
  },
});
