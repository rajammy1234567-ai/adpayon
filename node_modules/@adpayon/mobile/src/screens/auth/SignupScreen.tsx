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

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

export const SignupScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('Rahul Mehta');
  const [mobile, setMobile] = useState('9811223344');
  const [password, setPassword] = useState('pass1234');
  const [sponsorCode, setSponsorCode] = useState('ADP1000');
  const [sponsorName, setSponsorName] = useState('Rajesh Verma (Crown Diamond)');
  const [leg, setLeg] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const err: Record<string, string> = {};
    if (!name || name.trim().length < 2) {
      err.name = 'Full name is required';
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      err.mobile = 'Enter a valid 10-digit Indian mobile number';
    }
    if (!password || password.length < 6) {
      err.password = 'Password must be at least 6 characters';
    }
    if (!sponsorCode || sponsorCode.length < 3) {
      err.sponsorCode = 'Valid Sponsor ID is required';
    }
    if (!agreeTerms) {
      err.terms = 'Please accept terms & conditions to proceed';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSponsorChange = (code: string) => {
    setSponsorCode(code.toUpperCase());
    // Simulate sponsor lookup
    if (code.toUpperCase() === 'ADP1000') {
      setSponsorName('Rajesh Verma (Crown Diamond)');
    } else if (code.length >= 4) {
      setSponsorName('Verified Leader • Placement Available');
    } else {
      setSponsorName('');
    }
  };

  const handleSignup = () => {
    if (!validate()) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      navigation.navigate('OTPVerify', { mobile, mode: 'SIGNUP' });
    }, 800);
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
              Start earning through India's most rewarding binary network
            </Text>
          </View>

          {/* Signup Bonus Highlight Banner */}
          <Card variant="gold" style={styles.bonusBanner}>
            <View style={styles.bonusRow}>
              <Text style={styles.bonusEmoji}>🎁</Text>
              <View style={styles.bonusTextCol}>
                <Text style={styles.bonusTitle}>₹50.00 Instant Signup Bonus</Text>
                <Text style={styles.bonusSub}>
                  Credited to your bonus wallet upon onboarding challenge completion!
                </Text>
              </View>
            </View>
          </Card>

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

            {/* Binary Placement Leg Selector */}
            <View style={styles.legSection}>
              <Text style={styles.legLabel}>{t('auth.selectLeg')}</Text>
              <View style={styles.legRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLeg('LEFT')}
                  style={[
                    styles.legBtn,
                    leg === 'LEFT' ? styles.legBtnActive : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.legText,
                      leg === 'LEFT' ? styles.legTextActive : undefined,
                    ]}
                  >
                    ⬅️ {t('common.left')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLeg('RIGHT')}
                  style={[
                    styles.legBtn,
                    leg === 'RIGHT' ? styles.legBtnActive : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.legText,
                      leg === 'RIGHT' ? styles.legTextActive : undefined,
                    ]}
                  >
                    ➡️ {t('common.right')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

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
  },
  bonusBanner: {
    marginBottom: 20,
    padding: THEME.spacing.md,
  },
  bonusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bonusEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  bonusTextCol: {
    flex: 1,
  },
  bonusTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  bonusSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
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
  legSection: {
    marginBottom: 20,
  },
  legLabel: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legRow: {
    flexDirection: 'row',
    gap: 12,
  },
  legBtn: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    paddingVertical: 12,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legBtnActive: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  legText: {
    color: THEME.colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  legTextActive: {
    color: THEME.colors.emerald,
    fontWeight: '800',
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
