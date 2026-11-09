import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AttendanceStatusResponse, DailyAttendanceDay, formatUsd } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { getAttendanceStatusApi, claimAttendanceApi } from '../../services/api/features.api';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';

export const DailyStreakScreen: React.FC = () => {
  const { t } = useTranslation();
  const { updateUser } = useAuthStore();
  const { fetchSummary } = useWalletStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [status, setStatus] = useState<AttendanceStatusResponse | null>(null);

  const loadStatus = async () => {
    try {
      const data = await getAttendanceStatusApi();
      setStatus(data);
      if (data?.currentStreak !== undefined) {
        updateUser({ streakCount: data.currentStreak });
      }
    } catch (err: any) {
      console.error('Failed to load attendance status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadStatus();
  };

  const handleClaim = async () => {
    if (!status?.canClaim || claiming) return;

    try {
      setClaiming(true);
      const res = await claimAttendanceApi();
      Alert.alert(
        'Attendance Claimed! 🔥',
        `${res.message}\n+${res.pointsAwarded} points (${formatUsd(res.usdValue)} USD) added to your ledger.`
      );
      // Reload server status and refresh wallet balance
      await Promise.all([loadStatus(), fetchSummary()]);
    } catch (err: any) {
      Alert.alert('Claim Failed', err.message || 'Unable to record attendance. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const currentStreak = status?.currentStreak || 0;
  const isClaimedToday = status?.claimedToday || false;
  const todayPoints = status?.todayPoints || 10;
  const todayUsd = status?.todayUsd || 0.01;
  const cycleDays: DailyAttendanceDay[] = status?.cycleDays || [];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title={t('gamification.streakTitle') || 'Daily Attendance Streak'}
        subtitle="Check in every calendar day to multiply attendance rewards"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.loaderText}>Syncing server attendance cycle...</Text>
          </View>
        ) : (
          <>
            {/* Streak Counter Hero */}
            <Card variant="gold" style={styles.heroCard}>
              <View style={styles.fireBadge}>
                <Text style={styles.fireEmoji}>🔥</Text>
              </View>
              <Text style={styles.streakNumber}>{currentStreak} Days</Text>
              <Text style={styles.streakSub}>Active Attendance Streak</Text>
              <Text style={styles.streakDesc}>
                Check in consecutively for 7 days to unlock a special 250 points ($0.25 USD) milestone reward!
              </Text>

              <Button
                title={
                  claiming
                    ? 'Claiming...'
                    : isClaimedToday
                    ? '✓ Claimed for Today'
                    : `🎁 Claim Today (+${todayPoints} pts / ${formatUsd(todayUsd)})`
                }
                onPress={handleClaim}
                variant={isClaimedToday ? 'secondary' : 'primary'}
                size="lg"
                disabled={isClaimedToday || claiming}
                style={styles.claimBtn}
              />
            </Card>

            {/* 7-Day Calendar Grid */}
            <Text style={styles.calendarHeader}>7-Day Reward Cycle (1,000 pts = $1.00 USD)</Text>

            <View style={styles.calendarRow}>
              {cycleDays.map((item) => (
                <View
                  key={item.day}
                  style={[
                    styles.dayBox,
                    item.isToday
                      ? styles.dayBoxToday
                      : item.isClaimed
                      ? styles.dayBoxClaimed
                      : styles.dayBoxLocked,
                  ]}
                >
                  <Text style={styles.dayLabel}>Day {item.day}</Text>
                  <Text style={styles.dayEmoji}>
                    {item.day === 7 ? '👑' : item.isClaimed ? '✓' : '🪙'}
                  </Text>
                  <Text style={styles.rewardPointsText}>{item.points} pts</Text>
                  <Text style={styles.rewardUsdText}>{formatUsd(item.usdValue)}</Text>
                  {item.isToday ? <Text style={styles.todayPill}>Today</Text> : null}
                </View>
              ))}
            </View>

            {/* Rules & Safeguards */}
            <Card variant="default" style={styles.rulesCard}>
              <Text style={styles.rulesTitle}>Streak Continuity Rules</Text>
              <Text style={styles.ruleItem}>
                • Attendance is determined strictly by the server clock in UTC daily.
              </Text>
              <Text style={styles.ruleItem}>
                • Missing a calendar day resets your active streak back to Day 1.
              </Text>
              <Text style={styles.ruleItem}>
                • Each attendance check-in is credited transactionally into your immutable wallet ledger.
              </Text>
              <Text style={styles.ruleItem}>
                • Attempting to alter phone time or reload will not bypass server checks.
              </Text>
            </Card>
          </>
        )}
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
  loaderBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  heroCard: {
    padding: THEME.spacing.xl,
    alignItems: 'center',
    marginBottom: 24,
  },
  fireBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  fireEmoji: {
    fontSize: 32,
  },
  streakNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.gold,
    letterSpacing: 0.5,
  },
  streakSub: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  streakDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  claimBtn: {
    width: '100%',
  },
  calendarHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  calendarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  dayBox: {
    width: '23%',
    aspectRatio: 0.85,
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    position: 'relative',
  },
  dayBoxToday: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
  },
  dayBoxClaimed: {
    borderColor: THEME.colors.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  dayBoxLocked: {
    opacity: 0.65,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  dayEmoji: {
    fontSize: 18,
    marginVertical: 2,
  },
  rewardPointsText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  rewardUsdText: {
    fontSize: 9,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  todayPill: {
    position: 'absolute',
    top: -6,
    backgroundColor: THEME.colors.primary,
    color: '#FFF',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  rulesCard: {
    padding: THEME.spacing.lg,
  },
  rulesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  ruleItem: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
});
