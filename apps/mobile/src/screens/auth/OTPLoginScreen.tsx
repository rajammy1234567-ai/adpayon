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

type Props = NativeStackScreenProps<RootStackParamList, 'OTPLogin'>;

export const OTPLoginScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { login } = useAuthStore();
  const [mobile, setMobile] = useState('9876543210');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ mobile?: string; password?: string }>({});

  const validate = () => {
    const err: { mobile?: string; password?: string } = {};
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      err.mobile = 'Enter a valid 10-digit Indian mobile number';
    }
    if (!password || password.length < 6) {
      err.password = 'Password must be at least 6 characters';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handlePasswordLogin = () => {
    if (!validate()) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // Navigate to OTP verification for 2-step verification security
      navigation.navigate('OTPVerify', { mobile, mode: 'LOGIN' });
    }, 800);
  };

  const handleRequestOtp = () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setErrors({ mobile: 'Enter a valid 10-digit mobile number' });
      return;
    }
    navigation.navigate('OTPVerify', { mobile, mode: 'LOGIN' });
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
            <Input
              label={t('auth.mobileNumber')}
              placeholder={t('auth.mobilePlaceholder')}
              keyboardType="phone-pad"
              maxLength={10}
              value={mobile}
              onChangeText={(text) => {
                setMobile(text);
                if (errors.mobile) setErrors({ ...errors, mobile: undefined });
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
                if (errors.password) setErrors({ ...errors, password: undefined });
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
