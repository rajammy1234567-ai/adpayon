import React, { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { formatPaiseToRupees } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { HomeDailyAttendanceCard } from '../../components/home/HomeDailyAttendanceCard';
import { SponsoredBannersSection } from '../../components/home/SponsoredBannersSection';
import { HomeOffersSection } from '../../components/home/HomeOffersSection';
import { HomeNewsSection } from '../../components/home/HomeNewsSection';
import { THEME } from '../../constants/theme';
import { useBottomTabSpacing } from '../../hooks/useBottomTabSpacing';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';

export const DashboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthStore();
  const { summary, fetchSummary } = useWalletStore();
  const bottomSpacing = useBottomTabSpacing();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchSummary();
    } catch {}
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  const breakdown = summary.earningsBreakdownPaise;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomSpacing }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {/* ================================================================= */}
        {/* 1. COMPACT GREETING / HEADER & WALLET SUMMARY                     */}
        {/* ================================================================= */}
        <View style={styles.compactHeaderRow}>
          <View style={styles.greetingCol}>
            <Text style={styles.greetingSub}>{t('dashboard.greeting') || 'Welcome back'},</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.name || 'Partner'}
            </Text>
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

        {/* Compact Wallet Summary Card */}
        <Card variant="emerald" style={styles.compactWalletCard}>
          <View style={styles.walletMainRow}>
            <View style={styles.balanceInfoCol}>
              <Text style={styles.walletLabel}>{t('dashboard.spendableBalance') || 'Spendable Balance'}</Text>
              <Text style={styles.walletAmount}>
                {formatPaiseToRupees(summary.mainBalancePaise)}
              </Text>
            </View>

            <View style={styles.walletActionCol}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation.navigate('MainTabs', { screen: 'Wallet' })}
                style={styles.withdrawQuickBtn}
              >
                <Text style={styles.withdrawQuickBtnText}>⚡ Withdraw</Text>
              </TouchableOpacity>
              <Badge
                label={user?.currentRank || 'ACTIVE'}
                variant="gold"
                style={styles.rankBadgeCompact}
              />
            </View>
          </View>

          {/* Compact Sub-Stats Row */}
          <View style={styles.walletStatsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Today:</Text>
              <Text style={styles.statValuePositive}>
                +{formatPaiseToRupees(summary.todayEarningsPaise)}
              </Text>
            </View>
            <Text style={styles.statDot}>•</Text>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Bonus:</Text>
              <Text style={styles.statValueGold}>
                {formatPaiseToRupees(summary.bonusBalancePaise)}
              </Text>
            </View>
            <Text style={styles.statDot}>•</Text>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Lifetime:</Text>
              <Text style={styles.statValue}>
                {formatPaiseToRupees(summary.lifetimeEarningsPaise)}
              </Text>
            </View>
          </View>
        </Card>

        {/* ================================================================= */}
        {/* 2. DAILY ATTENDANCE CARD WITH 7-DAY STRIP & CHECK-IN ACTION       */}
        {/* ================================================================= */}
        <HomeDailyAttendanceCard />

        {/* ================================================================= */}
        {/* 3. WIDE SPONSORED BANNER WITH TITLE, CTA & CAROUSEL INDICATORS     */}
        {/* ================================================================= */}
        <SponsoredBannersSection />

        {/* ================================================================= */}
        {/* 4. TWO-COLUMN ACTIVITY CARDS                                       */}
        {/* ================================================================= */}
        <View style={styles.activitySectionHeader}>
          <Text style={styles.activitySectionTitle}>Quick Activities</Text>
          <Text style={styles.activitySectionSubtitle}>Earn promotional points & rewards</Text>
        </View>

        <View style={styles.activityGrid}>
          {/* --- ROW 1: Play & Earn | Tasks --- */}
          <View style={styles.activityRow}>
            {/* Play & Earn */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('PlayAndEarn')}
              style={styles.activityCard}
            >
              <View style={[styles.activityIconBox, { backgroundColor: 'rgba(217, 119, 6, 0.12)' }]}>
                <Text style={styles.activityIcon}>🎡</Text>
              </View>
              <View style={styles.activityTextBox}>
                <Text style={styles.activityTitle}>Play & Earn</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  Spin, Scratch & Quiz
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tasks (Task Hub) */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Categories' })}
              style={styles.activityCard}
            >
              <View style={[styles.activityIconBox, { backgroundColor: THEME.colors.emeraldGlow }]}>
                <Text style={styles.activityIcon}>🎯</Text>
              </View>
              <View style={styles.activityTextBox}>
                <Text style={styles.activityTitle}>Tasks</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  Task Hub & Offers
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* --- ROW 2: Video Wall | News --- */}
          <View style={styles.activityRow}>
            {/* Video Wall */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('VideoWall')}
              style={styles.activityCard}
            >
              <View style={[styles.activityIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Text style={styles.activityIcon}>🎬</Text>
              </View>
              <View style={styles.activityTextBox}>
                <Text style={styles.activityTitle}>Video Wall</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  Watch & Earn Points
                </Text>
              </View>
            </TouchableOpacity>

            {/* News */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('NewsTasks')}
              style={styles.activityCard}
            >
              <View style={[styles.activityIconBox, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                <Text style={styles.activityIcon}>📰</Text>
              </View>
              <View style={styles.activityTextBox}>
                <Text style={styles.activityTitle}>News</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  Read & Earn Points
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* --- ROW 3: Cashback | Refer & Earn --- */}
          <View style={styles.activityRow}>
            {/* Cashback */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ShoppingCashback')}
              style={styles.activityCard}
            >
              <View style={[styles.activityIconBox, { backgroundColor: 'rgba(220, 38, 38, 0.08)' }]}>
                <Text style={styles.activityIcon}>🛍️</Text>
              </View>
              <View style={styles.activityTextBox}>
                <Text style={styles.activityTitle}>Cashback</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  Shopping Rewards
                </Text>
              </View>
            </TouchableOpacity>

            {/* Refer & Earn */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ReferralInvite')}
              style={styles.activityCard}
            >
              <View style={[styles.activityIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <Text style={styles.activityIcon}>👥</Text>
              </View>
              <View style={styles.activityTextBox}>
                <Text style={styles.activityTitle}>Refer & Earn</Text>
                <Text style={styles.activitySubtitle} numberOfLines={1}>
                  Invite & Earn 55%
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ================================================================= */}
        {/* SECONDARY SECTIONS (BELOW ACTIVITY CARDS)                         */}
        {/* ================================================================= */}

        {/* Rank Club Milestone Access */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('RankRewards')}
          style={styles.rankClubCard}
        >
          <View style={styles.rankClubLeft}>
            <View style={styles.rankClubIconBox}>
              <Text style={styles.rankClubEmoji}>🏆</Text>
            </View>
            <View>
              <View style={styles.rankClubTitleRow}>
                <Text style={styles.rankClubTitle}>Rank Club Privileges</Text>
                <Badge label="EXCLUSIVE" variant="gold" />
              </View>
              <Text style={styles.rankClubSubtitle}>
                Unlock higher matching slabs, binary bonuses & leadership pools
              </Text>
            </View>
          </View>
          <Text style={styles.rankClubArrow}>→</Text>
        </TouchableOpacity>

        {/* Referral Network Snapshot */}
        <Card variant="default" style={styles.networkCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Referral Team Network</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Team' })}
            >
              <Text style={styles.viewMoreText}>View Tree →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.networkGridRow}>
            <View style={styles.networkMetricBox}>
              <Text style={styles.networkMetricValue}>
                {user?.directReferralsCount ?? 0}
              </Text>
              <Text style={styles.networkMetricLabel}>Direct Team (L1)</Text>
            </View>

            <View style={styles.networkMetricDivider} />

            <View style={styles.networkMetricBox}>
              <Text style={[styles.networkMetricValue, { color: THEME.colors.primary }]}>
                {user?.referralCode || 'ADP1000'}
              </Text>
              <Text style={styles.networkMetricLabel}>My Referral Code</Text>
            </View>
          </View>
        </Card>

        {/* Partner Offers Section */}
        <HomeOffersSection />

        {/* Official Announcements & News */}
        <HomeNewsSection />

        {/* Earnings Breakdown by Source */}
        <Card variant="default" style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>{t('dashboard.earningsBreakdown') || 'Earnings Breakdown'}</Text>

          <View style={styles.sourceGrid}>
            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>📺</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>{t('dashboard.adsEarnings') || 'Ads'}</Text>
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
                <Text style={styles.sourceName}>{t('dashboard.referralsEarnings') || 'Referrals'}</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.referralsPaise)}
                </Text>
              </View>
            </View>

            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>🎯</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>{t('dashboard.challengesEarnings') || 'Tasks'}</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.challengesPaise)}
                </Text>
              </View>
            </View>

            <View style={styles.sourceItem}>
              <View style={styles.sourceIconBox}>
                <Text style={styles.sourceEmoji}>🤝</Text>
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceName}>Matching</Text>
                <Text style={styles.sourceAmount}>
                  {formatPaiseToRupees(breakdown.binaryPaise)}
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
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  compactHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
  },
  greetingCol: {
    flex: 1,
  },
  greetingSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  userName: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.gold,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  streakEmoji: {
    fontSize: 13,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
  },
  inviteIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteIcon: {
    fontSize: 16,
  },
  compactWalletCard: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  walletMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceInfoCol: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#064E3B',
    marginTop: 1,
  },
  walletActionCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  withdrawQuickBtn: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  withdrawQuickBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  rankBadgeCompact: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  walletStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statLabel: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  statValuePositive: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  statValueGold: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  statValue: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  statDot: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  activitySectionHeader: {
    marginTop: 4,
    marginBottom: 8,
  },
  activitySectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  activitySectionSubtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  activityGrid: {
    gap: 10,
    marginBottom: 14,
  },
  activityRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  activityCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1.5,
  },
  activityIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityIcon: {
    fontSize: 20,
  },
  activityTextBox: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  activitySubtitle: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  rankClubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  rankClubLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankClubIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankClubEmoji: {
    fontSize: 20,
  },
  rankClubTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankClubTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  rankClubSubtitle: {
    fontSize: 10,
    color: '#B45309',
    marginTop: 1,
  },
  rankClubArrow: {
    fontSize: 16,
    fontWeight: '800',
    color: '#D97706',
    marginLeft: 6,
  },
  networkCard: {
    padding: 14,
    marginBottom: 14,
    borderRadius: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  viewMoreText: {
    fontSize: 11,
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  networkGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: 10,
    paddingVertical: 10,
  },
  networkMetricBox: {
    alignItems: 'center',
    flex: 1,
  },
  networkMetricValue: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  networkMetricLabel: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  networkMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: THEME.colors.border,
  },
  breakdownCard: {
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  sourceGrid: {
    marginTop: 8,
    gap: 8,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sourceIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: THEME.colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sourceEmoji: {
    fontSize: 14,
  },
  sourceInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceName: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  sourceAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
});
