import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
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
import { Badge, BadgeVariant } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Modal } from '../../components/ui/Modal';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import {
  getTaskFeedApi,
  getTaskHistoryApi,
  getTaskStatusApi,
  startTaskApi,
  verifyTaskActionApi,
  heartbeatTaskApi,
  EngagementInterval,
  TaskAssignmentResponse,
  TaskCompletionItem,
  TaskFeedItem,
} from '../../services/api/task.api';

export const EarnHubScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [activeTab, setActiveTab] = useState<'feed' | 'history'>('feed');
  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [history, setHistory] = useState<TaskCompletionItem[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [activeTask, setActiveTask] = useState<TaskFeedItem | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<TaskAssignmentResponse | null>(null);
  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [remainingDwellSeconds, setRemainingDwellSeconds] = useState(0);

  // Foreground engagement tracking (Phase 7H)
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState);
  const activeIntervalsRef = useRef<EngagementInterval[]>([]);
  const currentIntervalStartRef = useRef<number | null>(null);
  const activeTaskRef = useRef<TaskFeedItem | null>(null);
  activeTaskRef.current = activeTask;

  // Listen to React Native AppState (active, inactive, background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const wasActive = appStateStatus === 'active';
      const isNowActive = nextAppState === 'active';
      setAppStateStatus(nextAppState);

      if (!isTaskModalVisible) return;

      if (wasActive && !isNowActive) {
        // App went to background, lockscreen or switched away -> PAUSE countdown immediately
        setIsTimerPaused(true);
        if (currentIntervalStartRef.current !== null) {
          const end = Date.now();
          if (end > currentIntervalStartRef.current) {
            activeIntervalsRef.current.push({
              start: currentIntervalStartRef.current,
              end,
            });
          }
          currentIntervalStartRef.current = null;
        }

        // Opportunistic background heartbeat sync to persist verified progress
        if (activeTaskRef.current) {
          heartbeatTaskApi(activeTaskRef.current.id, {
            intervals: activeIntervalsRef.current,
          }).catch(() => {});
        }
      } else if (!wasActive && isNowActive) {
        // App returned to foreground -> RESUME countdown only if time remains
        setIsTimerPaused(false);
        if (remainingDwellSeconds > 0) {
          currentIntervalStartRef.current = Date.now();
        }
      }
    });

    return () => subscription.remove();
  }, [appStateStatus, isTaskModalVisible, remainingDwellSeconds]);

  // Compute remaining dwell-time based on authoritative server assignedAt timestamp or accumulated seconds
  const computeRemainingDwellSeconds = (assignedAtStr?: string, requiredDwellSeconds = 0, accumulatedSeconds = 0): number => {
    if (!requiredDwellSeconds || requiredDwellSeconds <= 0) return 0;
    if (accumulatedSeconds > 0) {
      return Math.max(0, requiredDwellSeconds - accumulatedSeconds);
    }
    if (!assignedAtStr) return requiredDwellSeconds;
    return requiredDwellSeconds;
  };

  // Summary counts
  const totalPromotionalPointsEarned = history.reduce((sum, item) => sum + (item.rewardPoints || 0), 0);

  const fetchFeed = useCallback(async () => {
    setFeedError(null);
    try {
      const res = await getTaskFeedApi();
      if (res.success && res.data) {
        setTasks(res.data.tasks || []);
      }
    } catch (err: any) {
      setFeedError(err.message || 'Unable to load task feed');
    } finally {
      setIsLoadingFeed(false);
      setIsRefreshing(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryError(null);
    setIsLoadingHistory(true);
    try {
      const res = await getTaskHistoryApi(1, 30);
      if (res.success && res.data) {
        setHistory(res.data.completions || []);
      }
    } catch (err: any) {
      setHistoryError(err.message || 'Unable to load task history');
    } finally {
      setIsLoadingHistory(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    fetchHistory();
  }, [fetchFeed, fetchHistory]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (activeTab === 'feed') {
      fetchFeed();
    } else {
      fetchHistory();
    }
  };

  // Foreground Dwell-time countdown timer for active first-party tasks
  // Only counts down when the app is strictly in the active foreground state!
  useEffect(() => {
    if (!isTaskModalVisible || remainingDwellSeconds <= 0 || isTimerPaused || appStateStatus !== 'active') {
      return;
    }

    const timer = setInterval(() => {
      setRemainingDwellSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Close interval once countdown completes
          if (currentIntervalStartRef.current !== null) {
            const end = Date.now();
            if (end > currentIntervalStartRef.current) {
              activeIntervalsRef.current.push({
                start: currentIntervalStartRef.current,
                end,
              });
            }
            currentIntervalStartRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTaskModalVisible, remainingDwellSeconds, isTimerPaused, appStateStatus]);

  const handleStartOrResumeTask = async (task: TaskFeedItem) => {
    if (startingTaskId !== null) return; // Prevent concurrent start requests or double-tap
    setStartingTaskId(task.id);

    try {
      // 1. If task feed already reports an active assignment, resume directly without calling POST /start
      if (task.hasActiveAssignment && task.activeAssignment) {
        // Expiry guard
        if (new Date(task.activeAssignment.expiresAt).getTime() <= Date.now()) {
          Alert.alert('Assignment Expired', 'Your previous task assignment has expired. Refreshing feed...');
          await fetchFeed();
          return;
        }

        const accumulated = task.activeAssignment.dwellTimeAccumulatedSeconds || 0;
        const remaining = task.activeAssignment.remainingDwellSeconds !== undefined
          ? task.activeAssignment.remainingDwellSeconds
          : Math.max(0, task.dwellTimeSeconds - accumulated);

        activeIntervalsRef.current = [];
        if (AppState.currentState === 'active') {
          currentIntervalStartRef.current = remaining > 0 ? Date.now() : null;
          setIsTimerPaused(false);
        } else {
          currentIntervalStartRef.current = null;
          setIsTimerPaused(true);
        }

        setActiveTask(task);
        setActiveAssignment({
          id: task.activeAssignment.id,
          taskId: task.id,
          title: task.title,
          clickId: task.activeAssignment.clickId,
          status: task.activeAssignment.status,
          assignedAt: task.activeAssignment.assignedAt,
          expiresAt: task.activeAssignment.expiresAt,
          dwellTimeRequiredSeconds: task.dwellTimeSeconds,
          dwellTimeAccumulatedSeconds: accumulated,
          remainingDwellSeconds: remaining,
        });
        setRemainingDwellSeconds(remaining);
        setIsTaskModalVisible(true);
        return;
      }

      // 2. Otherwise initiate new task assignment
      const res = await startTaskApi(task.id);
      if (res.success && res.data?.assignment) {
        const assignment = res.data.assignment;
        const remaining = assignment.remainingDwellSeconds !== undefined
          ? assignment.remainingDwellSeconds
          : (assignment.dwellTimeRequiredSeconds || task.dwellTimeSeconds);

        activeIntervalsRef.current = [];
        if (AppState.currentState === 'active') {
          currentIntervalStartRef.current = remaining > 0 ? Date.now() : null;
          setIsTimerPaused(false);
        } else {
          currentIntervalStartRef.current = null;
          setIsTimerPaused(true);
        }

        setActiveTask(task);
        setActiveAssignment(assignment);
        setRemainingDwellSeconds(remaining);
        setIsTaskModalVisible(true);

        // Update local task feed item so it immediately reflects active assignment
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  hasActiveAssignment: true,
                  activeAssignment: {
                    id: assignment.id,
                    clickId: assignment.clickId,
                    status: assignment.status,
                    assignedAt: assignment.assignedAt,
                    expiresAt: assignment.expiresAt,
                    dwellTimeAccumulatedSeconds: 0,
                    remainingDwellSeconds: remaining,
                  },
                }
              : t
          )
        );
      }
    } catch (err: any) {
      // 3. Graceful recovery on DUPLICATE_ACTIVE_ASSIGNMENT (HTTP 409)
      if (err.code === 'DUPLICATE_ACTIVE_ASSIGNMENT') {
        const details = err.details || {};
        let assignmentId = details.assignmentId;
        let clickId = details.clickId;
        let assignedAt = details.assignedAt;
        let expiresAt = details.expiresAt;
        let status = details.status || 'ASSIGNED';
        let dwellTimeAccumulatedSeconds = details.dwellTimeAccumulatedSeconds || 0;
        let remainingDwellSeconds = details.remainingDwellSeconds;

        // If backend details were somehow missing, fetch fresh status from server
        if (!assignmentId || !clickId) {
          try {
            const statusRes = await getTaskStatusApi(task.id);
            if (statusRes.success && statusRes.data?.assignment) {
              assignmentId = statusRes.data.assignment.id;
              clickId = statusRes.data.assignment.clickId;
              assignedAt = statusRes.data.assignment.assignedAt;
              expiresAt = statusRes.data.assignment.expiresAt;
              status = statusRes.data.assignment.status;
              dwellTimeAccumulatedSeconds = statusRes.data.assignment.dwellTimeAccumulatedSeconds || 0;
              remainingDwellSeconds = statusRes.data.assignment.remainingDwellSeconds;
            }
          } catch {
            // ignore fallback error
          }
        }

        // Check expiry
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
          Alert.alert('Assignment Expired', 'Your previous task assignment has expired. Refreshing feed...');
          await fetchFeed();
          return;
        }

        const remaining = remainingDwellSeconds !== undefined
          ? remainingDwellSeconds
          : Math.max(0, task.dwellTimeSeconds - dwellTimeAccumulatedSeconds);

        activeIntervalsRef.current = [];
        if (AppState.currentState === 'active') {
          currentIntervalStartRef.current = remaining > 0 ? Date.now() : null;
          setIsTimerPaused(false);
        } else {
          currentIntervalStartRef.current = null;
          setIsTimerPaused(true);
        }

        setActiveTask(task);
        setActiveAssignment({
          id: assignmentId || '',
          taskId: task.id,
          title: task.title,
          clickId: clickId || '',
          status: status || 'ASSIGNED',
          assignedAt,
          expiresAt: expiresAt || '',
          dwellTimeRequiredSeconds: task.dwellTimeSeconds,
          dwellTimeAccumulatedSeconds,
          remainingDwellSeconds: remaining,
        });
        setRemainingDwellSeconds(remaining);
        setIsTaskModalVisible(true);

        // Synchronize local task card to active
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  hasActiveAssignment: true,
                  activeAssignment: {
                    id: assignmentId || '',
                    clickId: clickId || '',
                    status: status || 'ASSIGNED',
                    assignedAt,
                    expiresAt: expiresAt || '',
                    dwellTimeAccumulatedSeconds,
                    remainingDwellSeconds: remaining,
                  },
                }
              : t
          )
        );
      } else {
        Alert.alert('Cannot Start Task', err.message || 'This task is not available for assignment.');
      }
    } finally {
      setStartingTaskId(null);
    }
  };

  const handleVerifyFirstPartyAction = async () => {
    if (!activeTask) return;
    setIsVerifying(true);

    try {
      // Finalize current interval if open
      if (currentIntervalStartRef.current !== null) {
        const end = Date.now();
        if (end > currentIntervalStartRef.current) {
          activeIntervalsRef.current.push({
            start: currentIntervalStartRef.current,
            end,
          });
        }
        currentIntervalStartRef.current = null;
      }

      const res = await verifyTaskActionApi(activeTask.id, {
        intervals: activeIntervalsRef.current,
      });
      if (res.success) {
        setIsTaskModalVisible(false);
        setActiveTask(null);
        setActiveAssignment(null);
        activeIntervalsRef.current = [];
        Alert.alert(
          '🎉 Task Verified!',
          `+${activeTask.rewardPoints} Promotional Points credited successfully to your promotional balance.`,
          [{ text: 'Great!', onPress: () => {} }]
        );
        // Refresh live feed and history
        fetchFeed();
        fetchHistory();
      }
    } catch (err: any) {
      Alert.alert(
        'Verification Failed',
        err.message || 'Task requirements not verified by server. Please ensure the full dwell time is satisfied.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOpenPartnerUrl = async () => {
    if (activeAssignment?.actionUrl) {
      try {
        const supported = await Linking.canOpenURL(activeAssignment.actionUrl);
        if (supported) {
          await Linking.openURL(activeAssignment.actionUrl);
        } else {
          Alert.alert('Error', 'Unable to open partner URL.');
        }
      } catch {
        Alert.alert('Error', 'Failed to launch partner application.');
      }
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'IN_APP_ACTION':
        return { label: 'In-App Action', variant: 'cyan' as BadgeVariant, emoji: '📱' };
      case 'PARTNER_WEBHOOK':
        return { label: 'Partner Offer', variant: 'gold' as BadgeVariant, emoji: '🔗' };
      case 'SURVEY':
        return { label: 'Market Survey', variant: 'neutral' as BadgeVariant, emoji: '📝' };
      case 'MANUAL_VERIFY':
      default:
        return { label: 'Auditor Review', variant: 'pending' as BadgeVariant, emoji: '🔍' };
    }
  };

  const getVerificationBadge = (method: string) => {
    switch (method) {
      case 'FIRST_PARTY_ACTION':
        return { label: 'Dwell Time', variant: 'active' as BadgeVariant };
      case 'AUTHENTICATED_WEBHOOK':
        return { label: 'HMAC Webhook', variant: 'cyan' as BadgeVariant };
      case 'MANUAL_REVIEW':
      default:
        return { label: 'Manual Review', variant: 'pending' as BadgeVariant };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return { label: 'Verified', variant: 'verified' as BadgeVariant };
      case 'FLAGGED':
        return { label: 'Under Review', variant: 'pending' as BadgeVariant };
      case 'REJECTED':
      default:
        return { label: 'Rejected', variant: 'rejected' as BadgeVariant };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('earnHub.title') || 'Earn Hub'}
        subtitle="Complete advertiser tasks & earn promotional points"
      />

      {/* Overview Metric Banner */}
      <View style={styles.metricsContainer}>
        <Card variant="gold" style={styles.metricsCard}>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Available Tasks</Text>
              <Text style={styles.metricValue}>{tasks.length}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Completed</Text>
              <Text style={styles.metricValue}>{history.length}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Promotional Points</Text>
              <Text style={[styles.metricValue, { color: THEME.colors.goldLight }]}>
                {totalPromotionalPointsEarned} <Text style={styles.ptsUnit}>PTS</Text>
              </Text>
            </View>
          </View>
          <Text style={styles.disclaimerText}>
            Promotional points are non-withdrawable reward credits for in-app benefits.
          </Text>
        </Card>
      </View>

      {/* Segmented Tab Switcher */}
      <View style={styles.tabsWrapper}>
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('feed')}
            style={[styles.tabButton, activeTab === 'feed' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'feed' && styles.tabTextActive]}>
              Live Tasks ({tasks.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('history')}
            style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
              My History ({history.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={THEME.colors.emerald}
            colors={[THEME.colors.emerald]}
          />
        }
      >
        {activeTab === 'feed' ? (
          // --- LIVE TASKS FEED TAB ---
          isLoadingFeed ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME.colors.emerald} />
              <Text style={styles.loadingText}>Fetching available earner tasks...</Text>
            </View>
          ) : feedError ? (
            <Card variant="default" style={styles.errorCard}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorTitle}>Could Not Load Tasks</Text>
              <Text style={styles.errorSub}>{feedError}</Text>
              <Button
                title="Retry Connection"
                onPress={fetchFeed}
                variant="outline"
                size="sm"
                style={styles.retryBtn}
              />
            </Card>
          ) : tasks.length === 0 ? (
            <Card variant="glass" style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No Live Tasks Available</Text>
              <Text style={styles.emptySub}>
                Advertiser campaigns are released dynamically. Check back soon for new task opportunities!
              </Text>
              <Button
                title="Refresh Feed"
                onPress={fetchFeed}
                variant="outline"
                size="sm"
                style={styles.retryBtn}
              />
            </Card>
          ) : (
            tasks.map((task) => {
              const cat = getCategoryBadge(task.category);
              const ver = getVerificationBadge(task.verificationMethod);

              return (
                <Card
                  key={task.id}
                  variant={task.hasActiveAssignment ? 'emerald' : task.isEligible ? 'default' : 'glass'}
                  style={styles.taskCard}
                >
                  <View style={styles.taskHeader}>
                    <View style={styles.badgesRow}>
                      <Badge label={cat.label} variant={cat.variant} />
                      <Badge label={ver.label} variant={ver.variant} />
                      {task.hasActiveAssignment ? (
                        <Badge label="In Progress" variant="gold" />
                      ) : null}
                    </View>
                    <View style={styles.rewardChip}>
                      <Text style={styles.rewardChipText}>+{task.rewardPoints} PTS</Text>
                    </View>
                  </View>

                  <Text style={styles.campaignSubtitle}>{task.campaignName}</Text>
                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskDesc} numberOfLines={2}>
                    {task.description || task.instructions}
                  </Text>

                  {/* Task Meta Details */}
                  <View style={styles.taskMetaRow}>
                    <Text style={styles.metaInfoText}>
                      ⏱️ {task.dwellTimeSeconds}s dwell time
                    </Text>
                    <Text style={styles.metaInfoText}>
                      🎯 {task.completedToday}/{task.dailyCapPerUser} daily cap
                    </Text>
                  </View>

                  {/* Action Button */}
                  <View style={styles.cardActionWrapper}>
                    {!task.isEligible ? (
                      <Button
                        title={task.ineligibilityReason || 'Ineligible'}
                        disabled
                        onPress={() => {}}
                        variant="secondary"
                        size="md"
                        style={styles.taskBtn}
                      />
                    ) : task.hasActiveAssignment ? (
                      <Button
                        title="Resume Task ⏱️"
                        onPress={() => handleStartOrResumeTask(task)}
                        variant="primary"
                        size="md"
                        isLoading={startingTaskId === task.id}
                        disabled={startingTaskId !== null && startingTaskId !== task.id}
                        style={styles.taskBtn}
                      />
                    ) : (
                      <Button
                        title={`Start Task (+${task.rewardPoints} PTS)`}
                        onPress={() => handleStartOrResumeTask(task)}
                        variant="primary"
                        size="md"
                        isLoading={startingTaskId === task.id}
                        disabled={startingTaskId !== null && startingTaskId !== task.id}
                        style={styles.taskBtn}
                      />
                    )}
                  </View>
                </Card>
              );
            })
          )
        ) : (
          // --- TASK HISTORY TAB ---
          isLoadingHistory ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME.colors.emerald} />
              <Text style={styles.loadingText}>Loading completion history...</Text>
            </View>
          ) : historyError ? (
            <Card variant="default" style={styles.errorCard}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorTitle}>Could Not Load History</Text>
              <Text style={styles.errorSub}>{historyError}</Text>
              <Button
                title="Retry"
                onPress={fetchHistory}
                variant="outline"
                size="sm"
                style={styles.retryBtn}
              />
            </Card>
          ) : history.length === 0 ? (
            <Card variant="glass" style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🏆</Text>
              <Text style={styles.emptyTitle}>No Task Completions Yet</Text>
              <Text style={styles.emptySub}>
                Start and verify a task from the live feed to earn promotional points and track your history here!
              </Text>
              <Button
                title="Browse Live Tasks"
                onPress={() => setActiveTab('feed')}
                variant="primary"
                size="sm"
                style={styles.retryBtn}
              />
            </Card>
          ) : (
            history.map((item) => {
              const statusBadge = getStatusBadge(item.status);

              return (
                <Card key={item.id} variant="default" style={styles.historyCard}>
                  <View style={styles.historyRow}>
                    <View style={styles.historyInfo}>
                      <View style={styles.historyHeaderRow}>
                        <Text style={styles.historyTitle} numberOfLines={1}>
                          {item.task?.title || 'Advertiser Task Completion'}
                        </Text>
                        <Badge label={statusBadge.label} variant={statusBadge.variant} />
                      </View>
                      <Text style={styles.historyDate}>
                        {new Date(item.completedAt).toLocaleString()}
                      </Text>
                      <Text style={styles.historyMetaMethod}>
                        Method: {item.verificationMethod}
                      </Text>
                    </View>
                    <View style={styles.historyPointsCol}>
                      <Text style={styles.historyPointsValue}>
                        +{item.rewardPoints}
                      </Text>
                      <Text style={styles.historyPointsLabel}>PTS</Text>
                    </View>
                  </View>
                </Card>
              );
            })
          )
        )}
      </ScrollView>

      {/* --- IN-PROGRESS TASK EXECUTION MODAL --- */}
      <Modal
        visible={isTaskModalVisible}
        onClose={() => {
          if (!isVerifying) {
            setIsTaskModalVisible(false);
            setActiveTask(null);
            setActiveAssignment(null);
          }
        }}
        title={activeTask?.title || 'Active Task In Progress'}
      >
        {activeTask ? (
          <View style={styles.modalContent}>
            <View style={styles.modalBadgeRow}>
              <Badge
                label={getCategoryBadge(activeTask.category).label}
                variant={getCategoryBadge(activeTask.category).variant}
              />
              <Badge
                label={getVerificationBadge(activeTask.verificationMethod).label}
                variant={getVerificationBadge(activeTask.verificationMethod).variant}
              />
            </View>

            <Card variant="glass" style={styles.instructionsCard}>
              <Text style={styles.instructionLabel}>Task Instructions:</Text>
              <Text style={styles.instructionText}>
                {activeTask.instructions ||
                  activeTask.description ||
                  'Follow the step-by-step requirements to earn non-withdrawable promotional points.'}
              </Text>
            </Card>

            {/* FIRST-PARTY ACTION (DWELL TIME) UI */}
            {activeTask.verificationMethod === 'FIRST_PARTY_ACTION' ? (
              <View style={styles.dwellContainer}>
                <View style={[styles.timerCircle, isTimerPaused && styles.timerCirclePaused]}>
                  <Text style={[styles.timerNumber, isTimerPaused && styles.timerNumberPaused]}>
                    {remainingDwellSeconds}s
                  </Text>
                  <Text style={styles.timerLabel}>Required Engagement</Text>
                </View>

                {/* Clear Paused / Resumed AppState Notice */}
                {remainingDwellSeconds > 0 && isTimerPaused ? (
                  <View style={styles.timerPausedCard}>
                    <Text style={styles.timerPausedTitle}>⏸️ Timer Paused</Text>
                    <Text style={styles.timerPausedNotice}>
                      App is inactive or backgrounded. Return to this screen to continue the engagement countdown.
                    </Text>
                  </View>
                ) : remainingDwellSeconds > 0 ? (
                  <View style={styles.timerActiveCard}>
                    <Text style={styles.timerActiveTitle}>▶️ Foreground Active</Text>
                    <Text style={styles.timerNotice}>
                      ⏱️ Keep this screen open for at least {remainingDwellSeconds} more second(s) to verify
                      authentic engagement.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.timerDoneNotice}>
                    ✅ Engagement requirement satisfied! Tap below to verify with server.
                  </Text>
                )}

                <Button
                  title={
                    remainingDwellSeconds > 0
                      ? isTimerPaused
                        ? `Timer Paused (${remainingDwellSeconds}s remaining)`
                        : `Complete Dwell Time (${remainingDwellSeconds}s)...`
                      : `Verify & Claim +${activeTask.rewardPoints} PTS`
                  }
                  disabled={remainingDwellSeconds > 0 || isVerifying || isTimerPaused}
                  isLoading={isVerifying}
                  onPress={handleVerifyFirstPartyAction}
                  variant="primary"
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            ) : null}

            {/* PARTNER WEBHOOK ACTION UI */}
            {activeTask.verificationMethod === 'AUTHENTICATED_WEBHOOK' ? (
              <View style={styles.partnerContainer}>
                <Text style={styles.partnerNotice}>
                  This partner conversion task uses secure server-to-server webhook verification. Your reward points
                  will be credited automatically after the advertiser verifies your action.
                </Text>

                {activeAssignment?.actionUrl ? (
                  <Button
                    title="Open Partner App / Website ↗️"
                    onPress={handleOpenPartnerUrl}
                    variant="primary"
                    size="lg"
                    style={styles.modalActionBtn}
                  />
                ) : null}

                <Button
                  title="Close & Await Webhook"
                  onPress={() => {
                    setIsTaskModalVisible(false);
                    fetchFeed();
                  }}
                  variant="outline"
                  size="md"
                  style={styles.modalSecondaryBtn}
                />
              </View>
            ) : null}

            {/* MANUAL REVIEW ACTION UI */}
            {activeTask.verificationMethod === 'MANUAL_REVIEW' ? (
              <View style={styles.partnerContainer}>
                <Text style={styles.partnerNotice}>
                  Task slot assigned. Complete the required steps. An administrator will inspect and confirm your
                  submission in the fraud review queue.
                </Text>
                <Button
                  title="Close & Submit for Review"
                  onPress={() => {
                    setIsTaskModalVisible(false);
                    fetchFeed();
                  }}
                  variant="primary"
                  size="lg"
                  style={styles.modalActionBtn}
                />
              </View>
            ) : null}
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
  metricsContainer: {
    paddingHorizontal: THEME.spacing.lg,
    paddingTop: THEME.spacing.sm,
  },
  metricsCard: {
    padding: THEME.spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: THEME.colors.borderSubtle,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  ptsUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.gold,
  },
  disclaimerText: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  tabsWrapper: {
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: THEME.borderRadius.md,
  },
  tabButtonActive: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.emeraldDark,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textMuted,
  },
  tabTextActive: {
    color: THEME.colors.emerald,
  },
  scroll: {
    paddingHorizontal: THEME.spacing.lg,
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginTop: 12,
  },
  errorCard: {
    alignItems: 'center',
    padding: THEME.spacing.xl,
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.danger,
    marginBottom: 4,
  },
  errorSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyCard: {
    alignItems: 'center',
    padding: THEME.spacing.xl,
    marginTop: 12,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  retryBtn: {
    minWidth: 160,
  },
  taskCard: {
    marginBottom: 14,
    padding: THEME.spacing.lg,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  rewardChip: {
    backgroundColor: THEME.colors.goldGlow,
    borderColor: THEME.colors.goldDark,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: THEME.borderRadius.full,
  },
  rewardChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  campaignSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.emerald,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
    lineHeight: 20,
  },
  taskDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  taskMetaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  metaInfoText: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textMuted,
  },
  cardActionWrapper: {
    width: '100%',
  },
  taskBtn: {
    width: '100%',
  },
  historyCard: {
    marginBottom: 10,
    padding: THEME.spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyInfo: {
    flex: 1,
    marginRight: 12,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  historyDate: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    marginBottom: 2,
  },
  historyMetaMethod: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
  },
  historyPointsCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 60,
  },
  historyPointsValue: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.colors.goldLight,
  },
  historyPointsLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.gold,
  },
  modalContent: {
    alignItems: 'stretch',
  },
  modalBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  instructionsCard: {
    padding: THEME.spacing.md,
    marginBottom: 16,
  },
  instructionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.emerald,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  dwellContainer: {
    alignItems: 'center',
  },
  timerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 3,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  timerNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.emerald,
  },
  timerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
  },
  timerNotice: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  timerDoneNotice: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.emerald,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  timerCirclePaused: {
    borderColor: THEME.colors.warning,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
  },
  timerNumberPaused: {
    color: THEME.colors.warning,
  },
  timerPausedCard: {
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    borderWidth: 1,
    borderColor: THEME.colors.warning,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: 16,
    alignItems: 'center',
  },
  timerPausedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.warning,
    marginBottom: 4,
  },
  timerPausedNotice: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  timerActiveCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: THEME.colors.emeraldDark,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: 16,
    alignItems: 'center',
  },
  timerActiveTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.emeraldLight,
    marginBottom: 4,
  },
  modalActionBtn: {
    width: '100%',
    marginBottom: 8,
  },
  modalSecondaryBtn: {
    width: '100%',
  },
  partnerContainer: {
    alignItems: 'stretch',
  },
  partnerNotice: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
});
