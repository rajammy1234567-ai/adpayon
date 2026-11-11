import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AttendanceStatusResponse, DailyAttendanceDay, formatUsd } from '@adpayon/shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { THEME } from '../../constants/theme';
import { getAttendanceStatusApi, claimAttendanceApi } from '../../services/api/features.api';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { RootStackParamList } from '../../navigation/types';

export const HomeDailyAttendanceCard: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { updateUser } = useAuthStore();
  const { fetchSummary } = useWalletStore();

  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [status, setStatus] = useState<AttendanceStatusResponse | null>(null);

  const loadStatus = async () => {
    try {
      const data = await getAttendanceStatusApi();
      if (data) {
        setStatus(data);
        if (data.currentStreak !== undefined) {
          updateUser({ streakCount: data.currentStreak });
        }
      }
    } catch {
      // Fallback offline mock for display if unauthenticated
      setStatus({
        currentStreak: 1,
        claimedToday: false,
        canClaim: true,
        dayOfCycle: 2,
        todayPoints: 10,
        todayUsd: 0.01,
        cycleDays: [
          { day: 1, points: 10, usdValue: 0.01, isClaimed: true, isToday: false, isLocked: false },
          { day: 2, points: 15, usdValue: 0.015, isClaimed: false, isToday: true, isLocked: false },
          { day: 3, points: 20, usdValue: 0.02, isClaimed: false, isToday: false, isLocked: true },
          { day: 4, points: 25, usdValue: 0.025, isClaimed: false, isToday: false, isLocked: true },
          { day: 5, points: 30, usdValue: 0.03, isClaimed: false, isToday: false, isLocked: true },
          { day: 6, points: 40, usdValue: 0.04, isClaimed: false, isToday: false, isLocked: true },
          { day: 7, points: 250, usdValue: 0.25, isClaimed: false, isToday: false, isLocked: true },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleClaim = async () => {
    if (!status?.canClaim || claiming) return;

    try {
      setClaiming(true);
      const res = await claimAttendanceApi();
      Alert.alert(
        'Attendance Checked In! 🔥',
        `${res.message || 'Streak updated'}\n+${res.pointsAwarded || 10} points (${formatUsd(res.usdValue || 0.01)} USD) added to your wallet.`
      );
      await Promise.all([loadStatus(), fetchSummary()]);
    } catch (err: any) {
      Alert.alert('Attendance Error', err.message || 'Unable to record check-in. Please try again.');
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
    <Card variant="default" style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerEmoji}>🔥</Text>
          <View>
            <Text style={styles.title}>Daily Attendance</Text>
            <Text style={styles.subtitle}>Check in 7 consecutive days for 250 pts bonus</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('DailyStreak')}
          style={styles.streakPill}
        >
          <Text style={styles.streakPillEmoji}>🔥</Text>
          <Text style={styles.streakPillText}>{currentStreak}d Streak</Text>
        </TouchableOpacity>
      </View>

      {/* 7-Day Calendar Strip */}
      <View style={styles.stripRow}>
        {cycleDays.map((item) => {
          const isToday = item.isToday;
          const isClaimed = item.isClaimed;
          const isMilestone = item.day === 7;

          return (
            <View
              key={item.day}
              style={[
                styles.dayBox,
                isClaimed && styles.dayBoxClaimed,
                isToday && styles.dayBoxToday,
                isMilestone && styles.dayBoxMilestone,
              ]}
            >
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                D{item.day}
              </Text>
              <Text style={styles.dayIcon}>
                {isClaimed ? '✓' : isMilestone ? '👑' : '🪙'}
              </Text>
              <Text style={[styles.dayPoints, isToday && styles.dayPointsToday]}>
                +{item.points}
              </Text>
              {isToday ? <View style={styles.todayIndicator} /> : null}
            </View>
          );
        })}
      </View>

      {/* Check-In Action Button */}
      <View style={styles.actionRow}>
        <Button
          title={
            claiming
              ? 'Checking In...'
              : isClaimedToday
              ? '✓ Checked In for Today'
              : `🎁 Check-In Today (+${todayPoints} pts / ${formatUsd(todayUsd)})`
          }
          onPress={handleClaim}
          variant={isClaimedToday ? 'secondary' : 'primary'}
          size="sm"
          disabled={isClaimedToday || claiming}
          isLoading={claiming}
          style={styles.checkInBtn}
        />
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.15)',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerEmoji: {
    fontSize: 22,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  streakPillEmoji: {
    fontSize: 12,
  },
  streakPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  stripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 5,
    marginVertical: 6,
  },
  dayBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 52,
    position: 'relative',
  },
  dayBoxClaimed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  dayBoxToday: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(229, 9, 20, 0.05)',
    borderWidth: 1.5,
  },
  dayBoxMilestone: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  dayLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: 2,
  },
  dayLabelToday: {
    color: THEME.colors.primary,
    fontWeight: '800',
  },
  dayIcon: {
    fontSize: 13,
    marginBottom: 2,
  },
  dayPoints: {
    fontSize: 9,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  dayPointsToday: {
    color: THEME.colors.primary,
  },
  todayIndicator: {
    position: 'absolute',
    bottom: -1,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: THEME.colors.primary,
  },
  actionRow: {
    marginTop: 8,
  },
  checkInBtn: {
    width: '100%',
  },
});
