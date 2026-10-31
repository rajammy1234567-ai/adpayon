import React, { useState } from 'react';
import {
  Alert,

  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';

export const ReferralInviteScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);

  const code = user?.referralCode || 'ADP1000';
  const referralLink = `https://adpayon.com/join?ref=${code}`;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('Copied!', `Referral Link copied: ${referralLink}`);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'Join My AdPayOn Team',
        message: `Join my team on AdPayOn to build your network and unlock verified rewards! Register with my referral code ${code}: ${referralLink}`,
      });
    } catch {
      // User dismissed share
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title={t('referral.title')}
        subtitle="Invite friends and build your verified referral team"
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Referral Code Card */}
        <Card variant="gold" style={styles.codeCard}>
          <Text style={styles.codeLabel}>{t('referral.yourCode')}</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{code}</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleCopy}
              style={styles.copyBtn}
            >
              <Text style={styles.copyBtnText}>
                {copied ? '✓ COPIED' : '📋 COPY CODE'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Referral Link Quick Display */}
          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>
              {referralLink}
            </Text>
          </View>

          {/* Share Buttons */}
          <Button
            title="💬 Share Invite Link"
            onPress={handleShare}
            variant="primary"
            size="lg"
            style={styles.shareBtn}
          />
          <Button
            title="🔗 Copy Referral Link"
            onPress={handleCopy}
            variant="secondary"
            size="md"
          />
        </Card>

        {/* QR Code Presentation */}
        <Card variant="elevated" style={styles.qrCard}>
          <Text style={styles.qrTitle}>Instant Scan & Join QR</Text>
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrSymbol}>📱</Text>
            <Text style={styles.qrCodeText}>SCAN TO JOIN</Text>
            <Text style={styles.qrSub}>{code}</Text>
          </View>
          <Text style={styles.qrHelper}>
            Show this QR code at local meetups or share directly for instant registration.
          </Text>
        </Card>

        {/* How Referrals Work Guide Card */}
        <Card variant="default" style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>How Unilevel Referrals Work</Text>
          <Text style={styles.benefitsSubtitle}>
            Grow your team network without artificial binary placement limits.
          </Text>

          <View style={styles.stepsList}>
            <View style={styles.stepItem}>
              <View style={styles.stepNumberCircle}>
                <Text style={styles.stepNumber}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Share Your Code</Text>
                <Text style={styles.stepDesc}>
                  Share your unique referral code or link with friends, colleagues, and community partners.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepNumberCircle}>
                <Text style={styles.stepNumber}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Direct Team (Level 1)</Text>
                <Text style={styles.stepDesc}>
                  Every user who signs up with your code becomes your direct team member with unlimited width.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepNumberCircle}>
                <Text style={styles.stepNumber}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Multi-Level Downline</Text>
                <Text style={styles.stepDesc}>
                  When your direct team invites others, your downstream genealogy expands across deep levels.
                </Text>
              </View>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepNumberCircle}>
                <Text style={styles.stepNumber}>4</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Verified Rank Progression</Text>
                <Text style={styles.stepDesc}>
                  Building an active, verified network unlocks community tiers, higher daily streak rewards, and team challenges.
                </Text>
              </View>
            </View>
          </View>
        </Card>
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
  codeCard: {
    padding: THEME.spacing.xl,
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.goldLight,
    letterSpacing: 2,
  },
  copyBtn: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: THEME.borderRadius.md,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  linkRow: {
    backgroundColor: THEME.colors.surfaceSubtle,
    padding: 10,
    borderRadius: THEME.borderRadius.sm,
    marginBottom: 16,
  },
  linkText: {
    fontSize: 12,
    color: THEME.colors.emerald,
    fontFamily: 'monospace',
  },
  shareBtn: {
    marginBottom: 10,
  },
  qrCard: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
    marginBottom: 20,
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 14,
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: THEME.borderRadius.lg,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: THEME.colors.emerald,
    marginBottom: 12,
  },
  qrSymbol: {
    fontSize: 48,
  },
  qrCodeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  qrSub: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  qrHelper: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
  benefitsCard: {
    padding: THEME.spacing.lg,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  benefitsSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  stepsList: {
    gap: 14,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: THEME.colors.emeraldGlow,
    borderWidth: 1.5,
    borderColor: THEME.colors.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '900',
    color: THEME.colors.emerald,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
});
