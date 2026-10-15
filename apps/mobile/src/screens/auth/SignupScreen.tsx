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
import { registerApi } from '../../services/api/auth.api';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  // Use ADP1000 exclusively as a development bootstrap example in dev mode
  const [sponsorCode, setSponsorCode] = useState(__DEV__ ? 'ADP1000' : '');
  const [sponsorName, setSponsorName] = useState(
    __DEV__ ? 'ADPAYON Dev Sponsor' : ''
  );
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const err: Record<string, string> = {};
    if (!name || name.trim().length < 2) {
      err.name = 'Full name is required';
    }
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      err.mobile = 'Enter a valid 10-digit Indian mobile number';
    }
    if (!password || password.length < 6) {
      err.password = 'Password must be at least 6 characters';
    }
    if (!sponsorCode || sponsorCode.trim().length < 3) {
      err.sponsorCode = 'Valid Sponsor ID is required';
    }
    if (!agreeTerms) {
      err.terms = 'Please accept terms & conditions to proceed';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSponsorChange = (code: string) => {
    const upper = code.toUpperCase();
    setSponsorCode(upper);
    if (upper === 'ADP1000') {
      setSponsorName('ADPAYON Dev Sponsor');
    } else if (upper.length >= 4) {
      setSponsorName('Verified Sponsor');
    } else {
      setSponsorName('');
    }
  };

  const handleSignup = async () => {
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});

    try {
      await registerApi({
        name: name.trim(),
        mobile: mobile.trim(),
        password,
        sponsorReferralCode: sponsorCode.trim() ? sponsorCode.trim().toUpperCase() : undefined,
        acceptTerms: agreeTerms,
      });

      navigation.navigate('OTPVerify', {
        mobile: mobile.trim(),
        mode: 'SIGNUP',
      });
    } catch (err: any) {
      if (err.code === 'MOBILE_EXISTS') {
        setErrors({ mobile: 'An account with this mobile number already exists.' });
      } else if (err.code === 'INVALID_SPONSOR') {
        setErrors({ sponsorCode: 'Sponsor referral code was not found. Please verify the code.' });
      } else {
        setErrors({ terms: err.message || 'Registration failed. Please try again.' });
      }
    } finally {
      setIsLoading(false);
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
            <Text style={styles.title}>{t('auth.signup')}</Text>
            <Text style={styles.subtitle}>
              Join AdPayOn to build your referral network and unlock verified rewards
            </Text>
          </View>

          {/* Form */}
          <Card variant="elevated" style={styles.card}>
            <Input
              label={t('auth.fullName')}
              placeholder={t('auth.fullNamePlaceholder')}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              error={errors.name}
            />

            <Input
              label={t('auth.mobileNumber')}
              placeholder={t('auth.mobilePlaceholder')}
              keyboardType="phone-pad"
              maxLength={10}
              value={mobile}
              onChangeText={(text) => {
                setMobile(text);
                if (errors.mobile) setErrors({ ...errors, mobile: '' });
              }}
              error={errors.mobile}
              leftIcon={<Text style={styles.prefix}>+91</Text>}
            />

            <Input
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
              error={errors.password}
            />

            {/* Sponsor ID with Real-Time Validation Preview */}
            <Input
              label={t('auth.sponsorId')}
              placeholder={t('auth.sponsorPlaceholder')}
              autoCapitalize="characters"
              value={sponsorCode}
              onChangeText={handleSponsorChange}
              error={errors.sponsorCode}
              helperText={
                sponsorName ? `✓ Sponsor: ${sponsorName}` : undefined
              }
            />

            {/* Terms Agreement */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setAgreeTerms(!agreeTerms)}
              style={styles.termsRow}
            >
              <View style={[styles.checkbox, agreeTerms ? styles.checkboxActive : undefined]}>
                {agreeTerms ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.termsText}>{t('auth.agreeTerms')}</Text>
            </TouchableOpacity>
            {errors.terms ? <Text style={styles.termsError}>{errors.terms}</Text> : null}

            <Button
              title={t('auth.signup')}
              onPress={handleSignup}
              variant="primary"
              size="lg"
              isLoading={isLoading}
              style={styles.submitBtn}
            />
          </Card>

          {/* Already have an account */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('OTPLogin')}
            >
              <Text style={styles.footerLink}> {t('auth.login')}</Text>
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
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxActive: {
    backgroundColor: THEME.colors.emerald,
    borderColor: THEME.colors.emerald,
  },
  checkMark: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '900',
  },
  termsText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  termsError: {
    color: THEME.colors.danger,
    fontSize: 12,
    marginTop: -12,
    marginBottom: 16,
  },
  submitBtn: {
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
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
