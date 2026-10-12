import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';

export const ReferralInviteScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [preferredLeg, setPreferredLeg] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [copied, setCopied] = useState(false);

  const code = user?.referralCode || 'ADP8829';
  const referralLink = `https://adpayon.com/join?ref=${code}&leg=${preferredLeg}`;

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    Alert.alert('Copied!', `Referral Link copied: ${referralLink}`);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'Join AdPayOn Network',
        message: `Join India's premier earning & binary network AdPayOn! Earn ₹50 signup bonus, 55% level income, and daily binary matching payouts. Register now with my code ${code}: ${referralLink}`,
      });
    } catch (err) {
      // User dismissed
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('referral.title')}
        subtitle="Multiply earnings with 55% level & 40% binary matching"
      />

      <ScrollView contentContainerStyle={styles.scroll}>
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

          {/* Preferred Placement Leg */}
          <View style={styles.legSelector}>
            <Text style={styles.legLabel}>Default Placement Leg for Invitees:</Text>
            <View style={styles.legToggleRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPreferredLeg('LEFT')}
                style={[
                  styles.legToggleBtn,
                  preferredLeg === 'LEFT' ? styles.legToggleActive : undefined,
                ]}
              >
                <Text
                  style={[
                    styles.legToggleText,
                    preferredLeg === 'LEFT' ? styles.legToggleTextActive : undefined,
                  ]}
                >
                  ⬅️ Left Leg
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPreferredLeg('RIGHT')}
                style={[
                  styles.legToggleBtn,
                  preferredLeg === 'RIGHT' ? styles.legToggleActive : undefined,
                ]}
              >
                <Text
                  style={[
                    styles.legToggleText,
                    preferredLeg === 'RIGHT' ? styles.legToggleTextActive : undefined,
                  ]}
                >
                  ➡️ Right Leg
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Share Buttons */}
          <Button
            title="💬 Share via WhatsApp"
            onPress={handleShare}
            variant="primary"
            size="lg"
            style={styles.shareBtn}
          />
          <Button
            title="🔗 Copy Custom Deep Link"
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
            Show this QR code at local seminars or team meetups for instant scan registration.
          </Text>
        </Card>

        {/* 8-Level Commission Breakdown Table */}
        <Card variant="default" style={styles.benefitsCard}>
          <Text style={styles.benefitsTitle}>8-Generation Level Commission Payout</Text>
          <Text style={styles.benefitsSubtitle}>
            Every time a direct or indirect downline member completes activities, you earn!
          </Text>

          <View style={styles.table}>
            <View style={styles.tableRowHeader}>
              <Text style={styles.th}>Generation</Text>
              <Text style={styles.th}>Commission %</Text>
              <Text style={styles.th}>Status</Text>
            </View>

            {[
              { lvl: 'Level 1 (Direct)', pct: '25%', unlocked: true },
              { lvl: 'Level 2', pct: '10%', unlocked: true },
              { lvl: 'Level 3', pct: '5%', unlocked: true },
              { lvl: 'Level 4', pct: '4%', unlocked: true },
              { lvl: 'Level 5', pct: '3%', unlocked: true },
              { lvl: 'Level 6', pct: '3%', unlocked: true },
              { lvl: 'Level 7', pct: '3%', unlocked: true },
              { lvl: 'Level 8', pct: '2%', unlocked: true },
            ].map((row, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  i % 2 === 0 ? styles.tableRowAlt : undefined,
                ]}
              >
                <Text style={styles.tdLvl}>{row.lvl}</Text>
                <Text style={styles.tdPct}>{row.pct}</Text>
                <Text style={styles.tdStatus}>✓ Active</Text>
              </View>
            ))}
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
  legSelector: {
    marginVertical: 14,
  },
  legLabel: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    marginBottom: 8,
  },
  legToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legToggleBtn: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
  },
  legToggleActive: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  legToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  legToggleTextActive: {
    color: THEME.colors.emerald,
    fontWeight: '800',
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
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  benefitsSubtitle: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 14,
  },
  table: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.md,
    overflow: 'hidden',
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  th: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableRowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tdLvl: {
    flex: 1,
    fontSize: 12,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
  },
  tdPct: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  tdStatus: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.emerald,
  },
});
