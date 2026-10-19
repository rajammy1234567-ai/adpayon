import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import {
  getTaskFeedApi,
  startTaskApi,
  verifyTaskActionApi,
  TaskAssignmentResponse,
  TaskFeedItem,
} from '../../services/api/task.api';
import { useAuthStore } from '../../store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingChallenges'>;

export const ChallengeListScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { unlockDashboard } = useAuthStore();

  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskFeedItem | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<TaskAssignmentResponse | null>(null);
  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getTaskFeedApi();
      if (res.success && res.data) {
        setTasks(res.data.tasks || []);
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Countdown timer for active dwell-time task
  useEffect(() => {
    if (!isTaskModalVisible || timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTaskModalVisible, timerSeconds]);

  const handleStartTask = async (task: TaskFeedItem) => {
    setSelectedTask(task);
    setTimerSeconds(task.dwellTimeSeconds || 0);

    try {
      const res = await startTaskApi(task.id);
      if (res.success && res.data?.assignment) {
        setActiveAssignment(res.data.assignment);
        setTimerSeconds(res.data.assignment.dwellTimeRequiredSeconds || task.dwellTimeSeconds || 0);
        setIsTaskModalVisible(true);
      }
    } catch (err: any) {
      if (err.code === 'DUPLICATE_ACTIVE_ASSIGNMENT' && err.details) {
        setActiveAssignment({
          id: err.details.assignmentId,
          taskId: task.id,
          title: task.title,
          clickId: err.details.clickId,
          status: 'IN_PROGRESS',
          expiresAt: err.details.expiresAt,
          dwellTimeRequiredSeconds: task.dwellTimeSeconds,
        });
        setIsTaskModalVisible(true);
      } else {
        Alert.alert('Cannot Start Task', err.message || 'Unable to start task at this time.');
      }
    }
  };

  const handleVerifyTask = async () => {
    if (!selectedTask) return;
    setIsVerifying(true);

    try {
      const res = await verifyTaskActionApi(selectedTask.id);
      if (res.success) {
        setCompletedTaskIds((prev) => new Set(prev).add(selectedTask.id));
        setIsTaskModalVisible(false);
        setSelectedTask(null);
        Alert.alert(
          'Task Verified!',
          `+${selectedTask.rewardPoints} Promotional Points credited. Verification confirmed by server.`
        );
        fetchTasks();
      }
    } catch (err: any) {
      Alert.alert(
        'Verification Incomplete',
        err.message || 'Server could not verify action requirements. Please satisfy the full dwell time.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDashboardUnlock = () => {
    unlockDashboard();
    navigation.replace('MainTabs', { screen: 'Dashboard' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.bonusChip}>
            <Text style={styles.bonusChipText}>🔒 DASHBOARD ACTIVATION</Text>
          </View>
          <Text style={styles.title}>{t('challenges.onboardingTitle') || 'Onboarding Tasks'}</Text>
          <Text style={styles.subtitle}>
            {t('challenges.onboardingSubtitle') ||
              'Complete live advertiser tasks to earn promotional points and explore the platform.'}
          </Text>
        </View>

        {/* Activation Card */}
        <Card variant="gold" style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressLabel}>Account Onboarding</Text>
              <Text style={styles.progressSub}>
                {completedTaskIds.size} Task(s) Completed This Session
              </Text>
            </View>
            <View style={styles.progressBadge}>
              <Text style={styles.progressBadgeText}>
                {completedTaskIds.size > 0 ? 'ACTIVE' : 'READY'}
              </Text>
            </View>
          </View>

          <Button
            title="🚀 Enter Dashboard"
            onPress={handleDashboardUnlock}
            variant="primary"
            size="md"
            style={styles.unlockBtn}
          />
        </Card>

        {/* Task List */}
        <Text style={styles.sectionTitle}>Available Earner Tasks</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={THEME.colors.emerald} />
            <Text style={styles.loadingText}>Fetching tasks from server...</Text>
          </View>
        ) : tasks.length === 0 ? (
          <Card variant="glass" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Tasks In Feed</Text>
            <Text style={styles.emptySub}>
              Tasks will appear once published by administrators. You can proceed directly to your dashboard.
            </Text>
            <Button
              title="Continue to Dashboard →"
              onPress={handleDashboardUnlock}
              variant="outline"
              size="sm"
              style={styles.emptyBtn}
            />
          </Card>
        ) : (
          tasks.map((item) => {
            const isDone = completedTaskIds.has(item.id) || item.completedToday > 0;

            return (
              <Card
                key={item.id}
                variant={isDone ? 'emerald' : 'default'}
                style={styles.challengeCard}
              >
                <View style={styles.challengeRow}>
                  <View style={styles.challengeIcon}>
                    <Text style={styles.iconSymbol}>
                      {item.category === 'IN_APP_ACTION'
                        ? '📲'
                        : item.category === 'PARTNER_WEBHOOK'
                        ? '🔗'
                        : item.category === 'SURVEY'
                        ? '📝'
                        : '🔍'}
                    </Text>
                  </View>

                  <View style={styles.challengeInfo}>
                    <Text style={styles.campaignSubtitle}>{item.campaignName}</Text>
                    <Text style={styles.challengeTitle}>{item.title}</Text>
                    <Text style={styles.challengeDesc}>
                      {item.description || item.instructions}
                    </Text>

                    <View style={styles.metaRow}>
                      <Text style={styles.rewardText}>+{item.rewardPoints} PTS</Text>
                      {item.dwellTimeSeconds > 0 ? (
                        <Badge
                          label={`${item.dwellTimeSeconds}s dwell`}
                          variant="neutral"
                          style={styles.metaBadge}
                        />
                      ) : null}
                      {isDone ? (
                        <Badge label="Completed" variant="active" style={styles.metaBadge} />
                      ) : (
                        <Badge label="Available" variant="gold" style={styles.metaBadge} />
                      )}
                    </View>
                  </View>
                </View>

                {!isDone ? (
                  <Button
                    title={t('challenges.startTask') || 'Start Task'}
                    onPress={() => handleStartTask(item)}
                    variant="outline"
                    size="sm"
                    style={styles.taskActionBtn}
                  />
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Task Verification Modal */}
      <Modal
        visible={isTaskModalVisible}
        onClose={() => {
          if (!isVerifying) {
            setIsTaskModalVisible(false);
            setSelectedTask(null);
            setActiveAssignment(null);
          }
        }}
        title="Verify Task Action"
      >
        {selectedTask ? (
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedTask.title}</Text>
            <Text style={styles.modalSub}>
              {selectedTask.instructions || selectedTask.description}
            </Text>

            {selectedTask.verificationMethod === 'FIRST_PARTY_ACTION' ? (
              <View style={styles.dwellBox}>
                <View style={styles.timerCircle}>
                  <Text style={styles.timerNumber}>{timerSeconds}s</Text>
                </View>
                <Text style={styles.timerInstruction}>
                  {timerSeconds > 0
                    ? `Keep open for ${timerSeconds}s to verify human engagement.`
                    : 'Requirement met! Tap verify to confirm with server.'}
                </Text>

                <Button
                  title={
                    timerSeconds > 0
                      ? `Waiting (${timerSeconds}s)...`
                      : `Verify & Claim +${selectedTask.rewardPoints} PTS`
                  }
                  disabled={timerSeconds > 0 || isVerifying}
                  isLoading={isVerifying}
                  onPress={handleVerifyTask}
                  variant="primary"
                  size="lg"
                  style={styles.modalBtn}
                />
              </View>
            ) : (
              <View style={styles.dwellBox}>
                <Text style={styles.timerInstruction}>
                  This task requires external conversion or audit review. Complete the partner instructions to
                  receive promotional points.
                </Text>
                <Button
                  title="Close Task"
                  onPress={() => setIsTaskModalVisible(false)}
                  variant="primary"
                  size="md"
                  style={styles.modalBtn}
                />
              </View>
            )}
          </View>
        ) : null}
      </Modal>
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
  header: {
    marginBottom: 20,
  },
  bonusChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: THEME.colors.danger,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.full,
    marginBottom: 10,
  },
  bonusChipText: {
    color: THEME.colors.danger,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  progressCard: {
    marginBottom: 24,
    padding: THEME.spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  progressSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  progressBadge: {
    backgroundColor: THEME.colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.gold,
  },
  progressBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  unlockBtn: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
  emptyCard: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 12,
  },
  emptyBtn: {
    minWidth: 180,
  },
  challengeCard: {
    marginBottom: 12,
    padding: THEME.spacing.md,
  },
  challengeRow: {
    flexDirection: 'row',
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconSymbol: {
    fontSize: 20,
  },
  challengeInfo: {
    flex: 1,
  },
  campaignSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.emerald,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  challengeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  challengeDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  rewardText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  metaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  taskActionBtn: {
    marginTop: 12,
  },
  modalContent: {
    alignItems: 'stretch',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
    marginBottom: 16,
  },
  dwellBox: {
    alignItems: 'center',
  },
  timerCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 2,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  timerNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: THEME.colors.emerald,
  },
  timerInstruction: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  modalBtn: {
    width: '100%',
  },
});
