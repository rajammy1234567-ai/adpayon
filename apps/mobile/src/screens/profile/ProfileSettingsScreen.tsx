import React from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useDemoStore } from '../../store/demoStore';

export const ProfileSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout } = useAuthStore();
  const { language, setLanguage, isDarkMode, toggleDarkMode } = useSettingsStore();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of AdPayOn?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          useDemoStore.getState().exitDemoMode();
          await logout();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & Data',
      'Are you sure you want to delete your account? All personal data, active sessions, and profile details will be permanently anonymized and scheduled for deletion in compliance with Google Play and Indian DPDP Act requirements. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              const { deleteAccountApi } = await import('../../services/api/wallet.api');
              await deleteAccountApi();
              Alert.alert('Account Deleted', 'Your account has been scheduled for deletion.');
              useDemoStore.getState().exitDemoMode();
              await logout();
            } catch {
              useDemoStore.getState().exitDemoMode();
              await logout();
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title={t('profile.title')} />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Profile Card */}
        <Card variant="elevated" style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {user?.name ? user.name[0].toUpperCase() : 'V'}
              </Text>
            </View>

            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={styles.userName}>{user?.name}</Text>
                <Badge
                  label={user?.isActive ? 'Active Member' : 'Inactive'}
                  variant={user?.isActive ? 'active' : 'inactive'}
                  style={styles.activeBadge}
                />
              </View>
              <Text style={styles.userPhone}>+91 {user?.mobile}</Text>
              <Text style={styles.userRefCode}>
                Referral Code: <Text style={styles.goldText}>{user?.referralCode}</Text>
              </Text>
              <Text style={styles.sponsorText}>
                Sponsor: {user?.sponsorName || 'Rajesh Verma'}
              </Text>
            </View>
          </View>
        </Card>

        {/* KYC Verification Status Strip */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation.navigate('KycUpload')}
        >
          <Card
            variant={user?.isKycVerified ? 'emerald' : 'gold'}
            style={styles.kycCard}
          >
            <View style={styles.kycRow}>
              <View style={styles.kycIconBox}>
                <Text style={styles.kycEmoji}>
                  {user?.isKycVerified ? '🛡️' : '⚠️'}
                </Text>
              </View>

              <View style={styles.kycInfo}>
                <Text style={styles.kycTitle}>
                  {user?.isKycVerified
                    ? 'KYC Verification Verified'
                    : 'KYC Verification Incomplete'}
                </Text>
                <Text style={styles.kycSub}>
                  {user?.isKycVerified
                    ? 'PAN, Bank Account & Aadhaar (Last 4) Verified'
                    : 'Upload PAN & Bank details to unlock full withdrawals'}
                </Text>
              </View>

              <Text style={styles.chevron}>→</Text>
            </View>
          </Card>
        </TouchableOpacity>

        {/* Security & Device Binding Info */}
        <Card variant="default" style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>{t('profile.security')}</Text>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>{t('profile.deviceId')}</Text>
              <Text style={styles.settingVal}>{user?.deviceId}</Text>
            </View>
            <Badge label="1-Device Bound" variant="cyan" />
          </View>

          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>Cryptographic Ledger Integrity</Text>
              <Text style={styles.settingVal}>Append-only audit enabled</Text>
            </View>
            <Badge label="Secure" variant="active" />
          </View>
        </Card>

        {/* App Preferences */}
        <Card variant="default" style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Preferences & Localization</Text>

          {/* Language Toggle */}
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>{t('profile.language')}</Text>
              <Text style={styles.settingVal}>
                {language === 'en' ? 'English (Current)' : 'हिन्दी (सक्रिय)'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              style={styles.langSwitchBtn}
            >
              <Text style={styles.langSwitchText}>
                {language === 'en' ? 'Switch to हिन्दी' : 'Switch to English'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Dark Mode */}
          <View style={styles.settingRow}>
            <View>
              <Text style={styles.settingLabel}>{t('profile.darkMode')}</Text>
              <Text style={styles.settingVal}>Obsidian Fintech Theme</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: THEME.colors.border, true: THEME.colors.emerald }}
              thumbColor={THEME.colors.textPrimary}
            />
          </View>
        </Card>

        {/* Legal & Version */}
        <Card variant="default" style={styles.sectionCard}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Alert.alert('Terms & Privacy', 'AdPayOn complies with all consumer protection direct-selling guidelines in India.')}
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>Direct Selling Guidelines & Terms</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Alert.alert('Grievance Redressal', 'Nodal Grievance Officer: grievance@adpayon.com (Response within 48h).')}
            style={styles.linkRow}
          >
            <Text style={styles.linkText}>Grievance Redressal & Support</Text>
            <Text style={styles.chevron}>→</Text>
          </TouchableOpacity>
        </Card>

        {/* Logout Button */}
        <Button
          title={t('profile.logout')}
          onPress={handleLogout}
          variant="danger"
          size="md"
          style={styles.logoutBtn}
        />

        {/* Google Play Mandated Account Deletion */}
        <Button
          title="Delete Account & Personal Data"
          onPress={handleDeleteAccount}
          variant="outline"
          size="sm"
          style={{ marginTop: 12, borderColor: THEME.colors.textMuted }}
        />

        <Text style={styles.versionFooter}>
          AdPayOn Mobile Engine • v1.0.0 Production Build
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scroll: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  profileCard: {
    padding: THEME.spacing.lg,
    marginBottom: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 2,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: THEME.colors.emerald,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  userPhone: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  userRefCode: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  goldText: {
    color: THEME.colors.goldLight,
    fontWeight: '800',
  },
  sponsorText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  kycCard: {
    padding: 14,
    marginBottom: 16,
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kycIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  kycEmoji: {
    fontSize: 20,
  },
  kycInfo: {
    flex: 1,
  },
  kycTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  kycSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 18,
    color: THEME.colors.textMuted,
    fontWeight: '700',
  },
  sectionCard: {
    padding: THEME.spacing.md,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  settingVal: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  langSwitchBtn: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.md,
  },
  langSwitchText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.emerald,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  linkText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  logoutBtn: {
    marginTop: 8,
    marginBottom: 20,
  },
  versionFooter: {
    textAlign: 'center',
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
});
