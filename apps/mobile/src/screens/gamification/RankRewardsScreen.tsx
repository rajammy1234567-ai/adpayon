import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { DEFAULT_RANKS, formatPaiseToRupees } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';

export const RankRewardsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const userRank = user?.currentRank || 'SILVER';
  const directs = user?.directReferralsCount || 8;
  const leftCount = user?.binaryStats?.leftCount || 42;
  const rightCount = user?.binaryStats?.rightCount || 38;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('gamification.rankTitle')}
        subtitle="8 Prestigious Leadership Tiers Powered by the 25% Pool"
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Current Rank Status Card */}
        <Card variant="gold" style={styles.currentRankCard}>
          <View style={styles.rankBadgeCircle}>
            <Text style={styles.rankIcon}>👑</Text>
          </View>
          <Text style={styles.currentRankLabel}>{t('gamification.currentRank')}</Text>
          <Text style={styles.currentRankName}>{userRank} ACHIEVER</Text>

          <View style={styles.currentStatsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Active Directs</Text>
              <Text style={styles.statVal}>{directs}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Left Team</Text>
              <Text style={styles.statVal}>{leftCount}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Right Team</Text>
              <Text style={styles.statVal}>{rightCount}</Text>
            </View>
          </View>
        </Card>

        {/* Next Rank Progress Card (Gold Target) */}
        <Card variant="default" style={styles.targetCard}>
          <Text style={styles.targetTitle}>Next Milestone: Gold Leader 🥇</Text>
          <Text style={styles.targetSub}>
            Requirements: 10 Directs • 100 Left • 100 Right (Reward: ₹2,000.00)
          </Text>

          <View style={styles.progressRow}>
            <Text style={styles.progLabel}>Direct Referrals: {directs}/10</Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, (directs / 10) * 100)}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progLabel}>Left Team: {leftCount}/100</Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, (leftCount / 100) * 100)}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progLabel}>Right Team: {rightCount}/100</Text>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, (rightCount / 100) * 100)}%` },
                ]}
              />
            </View>
          </View>
        </Card>

        {/* 8 Ranks Breakdown List */}
        <Text style={styles.listHeader}>All 8 Recognition Tiers</Text>

        {DEFAULT_RANKS.map((item, index) => {
          const isAchieved =
            index === 0 && userRank !== 'NONE'; // user is Silver

          return (
            <Card
              key={item.rank}
              variant={isAchieved ? 'emerald' : 'default'}
              style={styles.rankItemCard}
            >
              <View style={styles.rankItemHeader}>
                <View style={styles.rankTitleCol}>
                  <Text style={styles.rankItemName}>
                    {index + 1}. {item.title}
                  </Text>
                  <Text style={styles.rankCriteria}>
                    {item.directReferralsRequired} Directs • {item.leftCountRequired}:{item.rightCountRequired} Pairs
                  </Text>
                </View>

                <Badge
                  label={isAchieved ? 'Achieved ✓' : 'Locked 🔒'}
                  variant={isAchieved ? 'active' : 'neutral'}
                />
              </View>

              <View style={styles.rankRewardRow}>
                <Text style={styles.rewardTitle}>Milestone Bonus:</Text>
                <Text style={styles.rewardValue}>
                  {formatPaiseToRupees(item.rewardAmountPaise)}
                </Text>
              </View>
            </Card>
          );
        })}
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
  currentRankCard: {
    alignItems: 'center',
    padding: THEME.spacing.xl,
    marginBottom: 20,
  },
  rankBadgeCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: THEME.colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  rankIcon: {
    fontSize: 34,
  },
  currentRankLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
  },
  currentRankName: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.goldLight,
    marginTop: 2,
    letterSpacing: 1,
  },
  currentStatsRow: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.md,
    padding: 12,
    marginTop: 18,
    width: '100%',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: THEME.colors.border,
  },
  statLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontWeight: '700',
  },
  statVal: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  targetCard: {
    padding: THEME.spacing.lg,
    marginBottom: 24,
  },
  targetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  targetSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    marginBottom: 14,
  },
  progressRow: {
    marginBottom: 10,
  },
  progLabel: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginBottom: 4,
  },
  bar: {
    height: 6,
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: THEME.colors.emerald,
  },
  listHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  rankItemCard: {
    marginBottom: 12,
    padding: THEME.spacing.md,
  },
  rankItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rankTitleCol: {
    flex: 1,
  },
  rankItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  rankCriteria: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  rankRewardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  rewardTitle: {
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  rewardValue: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
});
