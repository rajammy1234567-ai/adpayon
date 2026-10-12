import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { DailyStreakItem, formatPaiseToRupees } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { MOCK_STREAK } from '../../services/mockData';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';

export const DailyStreakScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();
  const { claimReward } = useWalletStore();
  const [streakDays, setStreakDays] = useState<DailyStreakItem[]>(MOCK_STREAK);
  const [isClaimedToday, setIsClaimedToday] = useState(true);

  const currentStreak = user?.streakCount || 5;

  const handleClaim = () => {
    if (isClaimedToday) {
      Alert.alert('Already Claimed', "You've already claimed today's attendance bonus! Return tomorrow.");
      return;
    }
    const todayReward = 700; // ₹7.00
    claimReward(todayReward, 'ENGAGEMENT', 'Day 5 Attendance Streak Bonus');
    setIsClaimedToday(true);
    updateUser({ streakCount: currentStreak + 1 });
    Alert.alert('Bonus Credited! 🔥', '₹7.00 added to your spendable ledger balance!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('gamification.streakTitle')}
        subtitle="Check in every 24 hours to multiply attendance cash gifts"
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Streak Counter Hero */}
        <Card variant="gold" style={styles.heroCard}>
          <View style={styles.fireBadge}>
            <Text style={styles.fireEmoji}>🔥</Text>
          </View>
          <Text style={styles.streakNumber}>{currentStreak} Days</Text>
          <Text style={styles.streakSub}>Active Attendance Streak</Text>
          <Text style={styles.streakDesc}>
            Check in consecutively for 7 days to unlock a special ₹25.00 cash booster!
          </Text>

          <Button
            title={isClaimedToday ? '✓ Claimed for Today' : '🎁 Claim Today (+₹7.00)'}
            onPress={handleClaim}
            variant={isClaimedToday ? 'secondary' : 'primary'}
            size="lg"
            disabled={isClaimedToday}
            style={styles.claimBtn}
          />
        </Card>

        {/* 7-Day Calendar Grid */}
        <Text style={styles.calendarHeader}>7-Day Reward Cycle</Text>

        <View style={styles.calendarRow}>
          {streakDays.map((item) => (
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
              <Text style={styles.rewardText}>
                {formatPaiseToRupees(item.rewardAmountPaise, false)}
              </Text>
              {item.isToday ? <Text style={styles.todayPill}>Today</Text> : null}
            </View>
          ))}
        </View>

        {/* Rules & Safeguards */}
        <Card variant="default" style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Streak Continuity Rules</Text>
          <Text style={styles.ruleItem}>
            • Attendance window opens at 00:00 IST and resets at 23:59 IST daily.
          </Text>
          <Text style={styles.ruleItem}>
            • Missing a day resets your cycle back to Day 1.
          </Text>
          <Text style={styles.ruleItem}>
            • Completing Day 7 automatically unlocks an exclusive Golden Scratch Card.
          </Text>
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
    fontSize: 34,
  },
  streakNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.goldLight,
  },
  streakSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  streakDesc: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
    maxWidth: 280,
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
    height: 100,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayBoxToday: {
    borderColor: THEME.colors.gold,
    backgroundColor: THEME.colors.goldGlow,
  },
  dayBoxClaimed: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  dayBoxLocked: {
    opacity: 0.5,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  dayEmoji: {
    fontSize: 20,
    color: THEME.colors.emerald,
    fontWeight: '900',
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  todayPill: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.goldLight,
    textTransform: 'uppercase',
  },
  rulesCard: {
    padding: THEME.spacing.md,
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
    marginVertical: 2,
  },
});
