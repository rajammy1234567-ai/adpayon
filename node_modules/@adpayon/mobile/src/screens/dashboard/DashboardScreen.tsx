import React, { useState } from 'react';
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { formatPaiseToRupees } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';

export const DashboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthStore();
  const { summary } = useWalletStore();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  };

  const breakdown = summary.earningsBreakdownPaise;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.emerald}
          />
        }
      >
        {/* User Greeting & Top Bar */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.greeting}>{t('dashboard.greeting')},</Text>
            <Text style={styles.userName}>{user?.name || 'Partner'}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('DailyStreak')}
              style={styles.streakBadge}
            >
              <Text style={styles.streakEmoji}>🔥</Text>
              <Text style={styles.streakText}>{user?.streakCount || 0}d</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('ReferralInvite')}
              style={styles.inviteIconBtn}
            >
              <Text style={styles.inviteIcon}>🎁</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Primary Wallet Balance Card (Emerald Luxury Glow) */}
        <Card variant="emerald" style={styles.balanceCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.balanceLabel}>{t('dashboard.spendableBalance')}</Text>
              <Text style={styles.balanceAmount}>
                {formatPaiseToRupees(summary.mainBalancePaise)}
              </Text>
            </View>
            <Badge
              label={user?.currentRank || 'ACTIVE'}
              variant="gold"
              style={styles.rankBadge}
            />
          </View>

          <View style={styles.balanceMetaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>{t('dashboard.todayEarnings')}</Text>
              <Text style={styles.metaValuePositive}>
                +{formatPaiseToRupees(summary.todayEarningsPaise)}
              </Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>{t('dashboard.lifetimeEarnings')}</Text>
              <Text style={styles.metaValue}>
                {formatPaiseToRupees(summary.lifetimeEarningsPaise)}
              </Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>{t('dashboard.bonusWallet')}</Text>
              <Text style={styles.metaValueGold}>
                {formatPaiseToRupees(summary.bonusBalancePaise)}
              </Text>
            </View>
          </View>

          <View style={styles.actionBtnRow}>
            <Button
              title="⚡ Withdraw Funds"
              onPress={() =>
                navigation.navigate('MainTabs', { screen: 'Wallet' })
              }
              variant="primary"
              size="sm"
              style={styles.withdrawBtn}
            />
            <Button
              title="👥 Invite Friends"
              onPress={() => navigation.navigate('ReferralInvite')}
              variant="secondary"
              size="sm"
              style={styles.inviteBtn}
            />
          </View>
        </Card>

        {/* Binary Network Volume Snapshot */}
        <Card variant="default" style={styles.binaryCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Binary Team Matching Volume</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Team' })}
            >
              <Text style={styles.viewMoreText}>View Tree →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.binaryLegsRow}>
            {/* Left Leg */}
            <View style={[styles.legBox, styles.leftLegBox]}>
              <View style={styles.legHeader}>
                <Text style={styles.legName}>⬅️ {t('dashboard.leftLeg')}</Text>
                <Badge label="42 Members" variant="cyan" />
              </View>
              <Text style={styles.legVolume}>
                {user?.binaryStats.leftVolumeUnits || 1420}{' '}
                <Text style={styles.unitSub}>PV</Text>
              </Text>
              <Text style={styles.carryText}>
                Carry: {user?.binaryStats.leftCarryForwardUnits || 320} PV
              </Text>
            </View>

            {/* Right Leg */}
            <View style={[styles.legBox, styles.rightLegBox]}>
              <View style={styles.legHeader}>
                <Text style={styles.legName}>➡️ {t('dashboard.rightLeg')}</Text>
                <Badge label="38 Members" variant="gold" />
              </View>
              <Text style={styles.legVolume}>
                {user?.binaryStats.rightVolumeUnits || 1100}{' '}
                <Text style={styles.unitSub}>PV</Text>
              </Text>
              <Text style={styles.carryText}>
                Matched: {user?.binaryStats.lifetimeMatchedVolumeUnits || 1100} PV
              </Text>
            </View>
          </View>
        </Card>

        {/* Earnings Breakdown by Source */}
        <Card variant="default" style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>{t('dashboard.earningsBreakdown')}</Text>

          <View style={styles.sourceGrid}>
            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>📺</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>{t('dashboard.adsEarnings')}</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.adsPaise)}
                </Text>
              </View>
            </View>

            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>🌳</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>{t('dashboard.referralsEarnings')}</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.referralsPaise)}
                </Text>
              </View>
            </View>

            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>⚖️</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>{t('dashboard.binaryEarnings')}</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.binaryPaise)}
                </Text>
              </View>
            </View>

            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>🎯</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>{t('dashboard.challengesEarnings')}</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.challengesPaise)}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Quick Action Hub */}
        <Text style={styles.sectionHeader}>{t('dashboard.quickActions')}</Text>
        <View style={styles.actionGrid}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DailyStreak')}
            style={styles.gridAction}
          >
            <View style={[styles.gridIcon, { backgroundColor: THEME.colors.goldGlow }]}>
              <Text style={styles.gridEmoji}>🔥</Text>
            </View>
            <Text style={styles.gridLabel}>{t('dashboard.dailyCheckin')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ScratchEarn')}
            style={styles.gridAction}
          >
            <View style={[styles.gridIcon, { backgroundColor: THEME.colors.emeraldGlow }]}>
              <Text style={styles.gridEmoji}>✨</Text>
            </View>
            <Text style={styles.gridLabel}>{t('dashboard.scratchCard')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('QuizLeaderboard')}
            style={styles.gridAction}
          >
            <View style={[styles.gridIcon, { backgroundColor: THEME.colors.cyanGlow }]}>
              <Text style={styles.gridEmoji}>🧠</Text>
            </View>
            <Text style={styles.gridLabel}>{t('dashboard.dailyQuiz')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('MobileRecharge')}
            style={styles.gridAction}
          >
            <View style={[styles.gridIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Text style={styles.gridEmoji}>📲</Text>
            </View>
            <Text style={styles.gridLabel}>{t('dashboard.recharge')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('ShoppingCashback')}
            style={styles.gridAction}
          >
            <View style={[styles.gridIcon, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
              <Text style={styles.gridEmoji}>🛍️</Text>
            </View>
            <Text style={styles.gridLabel}>{t('dashboard.shopping')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('RankRewards')}
            style={styles.gridAction}
          >
            <View style={[styles.gridIcon, { backgroundColor: THEME.colors.goldGlow }]}>
              <Text style={styles.gridEmoji}>🏆</Text>
            </View>
            <Text style={styles.gridLabel}>{t('dashboard.rankRewards')}</Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 50,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  userName: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: THEME.borderRadius.full,
  },
  streakEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  streakText: {
    color: THEME.colors.goldLight,
    fontWeight: '800',
    fontSize: 12,
  },
  inviteIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteIcon: {
    fontSize: 18,
  },
  balanceCard: {
    padding: THEME.spacing.lg,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  balanceLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.emerald,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  rankBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  balanceMetaRow: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  metaCol: {
    flex: 1,
    alignItems: 'center',
  },
  metaDivider: {
    width: 1,
    height: '100%',
    backgroundColor: THEME.colors.border,
  },
  metaLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaValuePositive: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.emerald,
    marginTop: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  metaValueGold: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.gold,
    marginTop: 2,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  withdrawBtn: {
    flex: 1,
  },
  inviteBtn: {
    flex: 1,
  },
  binaryCard: {
    marginBottom: 20,
    padding: THEME.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  viewMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.emerald,
  },
  binaryLegsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  legBox: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    borderWidth: 1,
  },
  leftLegBox: {
    borderColor: THEME.colors.cyanGlow,
  },
  rightLegBox: {
    borderColor: THEME.colors.goldGlow,
  },
  legHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  legName: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  legVolume: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  unitSub: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontWeight: '600',
  },
  carryText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 4,
  },
  breakdownCard: {
    marginBottom: 24,
    padding: THEME.spacing.md,
  },
  sourceGrid: {
    marginTop: 12,
    gap: 10,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceSubtle,
    padding: 10,
    borderRadius: THEME.borderRadius.md,
  },
  sourceIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sourceEmoji: {
    fontSize: 18,
  },
  sourceInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceName: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  sourceAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridAction: {
    width: '30.5%',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    borderRadius: THEME.borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridEmoji: {
    fontSize: 22,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
});
