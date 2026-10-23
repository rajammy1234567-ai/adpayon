import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import {
  getTaskFeedApi,
  getTaskStatusApi,
  startTaskApi,
  recordStoreVisitApi,
  submitAppFeedbackApi,
  getTaskSummaryApi,
  TaskFeedItem,
  TaskStatusResponse,
} from '../../services/api/task.api';
import {
  isValidAndroidPackageName,
  isValidPlayStoreUrl,
  buildCanonicalPlayStoreUrl,
  buildMarketIntentUri,
} from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

type AppInstallTaskRouteProp = RouteProp<RootStackParamList, 'AppInstallTask'>;

export type AppInstallDisplayStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PENDING_PARTNER_VERIFICATION'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'UNAVAILABLE';

export const AppInstallTaskScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<AppInstallTaskRouteProp>();
  const isFocused = useIsFocused();
  const { taskId, assignmentId: initialAssignmentId } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [task, setTask] = useState<TaskFeedItem | null>(null);
  const [statusResponse, setStatusResponse] = useState<TaskStatusResponse | null>(null);
  const [displayStatus, setDisplayStatus] = useState<AppInstallDisplayStatus>('NOT_STARTED');

  const [hasOpenedStore, setHasOpenedStore] = useState(false);
  const [verifiedPoints, setVerifiedPoints] = useState<number | null>(null);

  // Polling control
  const pollingCyclesRef = useRef(0);
  const maxPollingCycles = 12; // Bounded to 12 cycles (72 seconds max)
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isComponentMountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    pollingCyclesRef.current = 0;
  }, []);

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || feedbackText.trim().length < 3) {
      Alert.alert('Feedback Required', 'Please enter at least a few words describing your testing experience.');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const res = await submitAppFeedbackApi(taskId, {
        feedback: feedbackText.trim(),
        rating: feedbackRating,
      });
      if (res.success) {
        setDisplayStatus('VERIFIED');
        setVerifiedPoints(res.data.rewardPoints || task?.rewardPoints || 0);
        stopPolling();
        Alert.alert(
          '🎉 Feedback Verified!',
          `+${res.data.rewardPoints || task?.rewardPoints || 0} Promotional Points credited to your balance.`,
          [{ text: 'Great!', onPress: () => navigation.goBack() }]
        );
      }
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Unable to submit feedback at this time.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  /**
   * Evaluates authoritative backend response and maps to display status.
   */
  const mapServerStatusToDisplay = useCallback(
    (statusData: TaskStatusResponse, openedStore: boolean): AppInstallDisplayStatus => {
      if (!statusData.hasAssignment || statusData.status === 'NONE') {
        return 'NOT_STARTED';
      }

      if (statusData.status === 'COMPLETED') {
        return 'VERIFIED';
      }

      if (statusData.status === 'EXPIRED' || statusData.assignment?.isExpired) {
        return 'EXPIRED';
      }

      if (statusData.status === 'ASSIGNED' || statusData.status === 'IN_PROGRESS') {
        return openedStore ? 'PENDING_PARTNER_VERIFICATION' : 'IN_PROGRESS';
      }

      return 'UNAVAILABLE';
    },
    []
  );

  /**
   * Refreshes authoritative task status from server.
   */
  const checkStatus = useCallback(
    async (silent = false): Promise<TaskStatusResponse | null> => {
      if (!silent) {
        setIsRefreshingStatus(true);
      }

      try {
        const res = await getTaskStatusApi(taskId);
        if (res.success && res.data && isComponentMountedRef.current) {
          setStatusResponse(res.data);
          const mapped = mapServerStatusToDisplay(res.data, hasOpenedStore);
          setDisplayStatus(mapped);

          // If conversion has been verified, stop polling and update points
          if (mapped === 'VERIFIED') {
            stopPolling();
            if (task?.rewardPoints) {
              setVerifiedPoints(task.rewardPoints);
            }
            getTaskSummaryApi().catch(() => {});
          }

          if (mapped === 'EXPIRED') {
            stopPolling();
          }

          return res.data;
        }
      } catch (err: any) {
        if (!silent && isComponentMountedRef.current) {
          Alert.alert('Status Sync Notice', err.message || 'Unable to check verification status');
        }
      } finally {
        if (!silent && isComponentMountedRef.current) {
          setIsRefreshingStatus(false);
        }
      }
      return null;
    },
    [taskId, hasOpenedStore, mapServerStatusToDisplay, stopPolling, task]
  );

  /**
   * Initializes task data and current assignment status.
   */
  const initScreen = useCallback(async () => {
    setIsLoading(true);
    setInitError(null);

    try {
      // 1. Authoritatively fetch assignment status and task metadata
      const statusData = await checkStatus(true);

      let resolvedTask: TaskFeedItem | null = null;

      // Prefer server-returned task detail from status endpoint (survives global cap exhaustion)
      if (statusData?.task) {
        resolvedTask = {
          id: statusData.task.id,
          campaignName: statusData.task.campaignName || 'Partner Advertiser',
          title: statusData.task.title,
          description: statusData.task.description || '',
          category: statusData.task.category,
          verificationMethod: statusData.task.verificationMethod,
          rewardPoints: statusData.task.rewardPoints,
          dailyCapPerUser: 1,
          completedToday: statusData.status === 'COMPLETED' ? 1 : 0,
          dwellTimeSeconds: 0,
          isEligible: true,
          hasActiveAssignment: Boolean(statusData.hasAssignment),
          appInstallConfig: statusData.task.appInstallConfig,
        };
      } else {
        // Fallback to active feed
        const feedRes = await getTaskFeedApi();
        if (feedRes.success && feedRes.data?.tasks) {
          const found = feedRes.data.tasks.find((t) => t.id === taskId);
          if (found) {
            resolvedTask = found;
          }
        }
      }

      if (!resolvedTask) {
        throw new Error('This app discovery task is no longer available');
      }

      setTask(resolvedTask);

      // Restore server-authoritative store-visit state
      const serverOpenedStore = Boolean(statusData?.assignment?.hasOpenedStore);
      if (serverOpenedStore) {
        setHasOpenedStore(true);
      }

      if (statusData) {
        const mapped = mapServerStatusToDisplay(statusData, serverOpenedStore);
        setDisplayStatus(mapped);
      }
    } catch (err: any) {
      if (isComponentMountedRef.current) {
        setInitError(err.message || 'Failed to load app discovery task');
      }
    } finally {
      if (isComponentMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [taskId, checkStatus, mapServerStatusToDisplay]);

  // Screen load & focus listener
  useEffect(() => {
    isComponentMountedRef.current = true;
    initScreen();

    return () => {
      isComponentMountedRef.current = false;
      stopPolling();
    };
  }, [initScreen, stopPolling]);

  // Polling management: runs only when focused, in pending verification, and bounded
  useEffect(() => {
    if (!isFocused || displayStatus !== 'PENDING_PARTNER_VERIFICATION') {
      stopPolling();
      return;
    }

    // AppState listener: pause polling when app is backgrounded
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        stopPolling();
      }
    });

    // Start bounded polling interval (every 6 seconds)
    pollingCyclesRef.current = 0;
    pollingTimerRef.current = setInterval(async () => {
      if (pollingCyclesRef.current >= maxPollingCycles) {
        stopPolling();
        return;
      }
      pollingCyclesRef.current += 1;
      await checkStatus(true);
    }, 6000);

    return () => {
      subscription.remove();
      stopPolling();
    };
  }, [isFocused, displayStatus, checkStatus, stopPolling]);

  /**
   * Safely launches the official Google Play Store listing.
   * Never sideloads, never opens unverified APKs, never claims client-side install proof.
   */
  const handleOpenStore = async () => {
    const packageName = task?.appInstallConfig?.packageName;
    if (!packageName || !isValidAndroidPackageName(packageName)) {
      Alert.alert('Configuration Notice', 'The Android package identifier for this task is invalid.');
      return;
    }

    // 1. If not started yet, claim assignment first
    if (displayStatus === 'NOT_STARTED') {
      try {
        const startRes = await startTaskApi(taskId);
        if (startRes.success && startRes.data?.assignment) {
          // Status becomes IN_PROGRESS
          setDisplayStatus('IN_PROGRESS');
        }
      } catch (err: any) {
        // If already active or duplicate, proceed to store launch
      }
    }

    const marketUri = buildMarketIntentUri(packageName);
    const canonicalWebUrl = buildCanonicalPlayStoreUrl(packageName);
    const configuredStoreUrl = task?.appInstallConfig?.storeUrl;

    // Validate configured URL or fallback to canonical
    let targetWebUrl = canonicalWebUrl;
    if (configuredStoreUrl && isValidPlayStoreUrl(configuredStoreUrl, packageName)) {
      targetWebUrl = configuredStoreUrl;
    }

    let opened = false;

    // 2. Attempt native Market Intent (Google Play app)
    try {
      const canOpenMarket = await Linking.canOpenURL(marketUri);
      if (canOpenMarket) {
        await Linking.openURL(marketUri);
        opened = true;
      }
    } catch {
      // Intent launch failed, fallback to browser
    }

    // 3. Fallback to official web Play Store URL
    if (!opened) {
      try {
        const canOpenWeb = await Linking.canOpenURL(targetWebUrl);
        if (canOpenWeb) {
          await Linking.openURL(targetWebUrl);
          opened = true;
        } else {
          Alert.alert('Store Unavailable', 'Unable to open Google Play Store on this device.');
          return;
        }
      } catch (err: any) {
        Alert.alert('Store Launch Error', err.message || 'Failed to open Google Play Store');
        return;
      }
    }

    if (opened) {
      setHasOpenedStore(true);
      setDisplayStatus('PENDING_PARTNER_VERIFICATION');

      // Authoritative server-side tracking (not reward evidence)
      recordStoreVisitApi(taskId).catch((err: any) => {
        // Non-blocking telemetry tracking
        console.warn('Store visit record note:', err.message);
      });
    }
  };

  const getStatusBadgeConfig = (): { label: string; variant: 'verified' | 'pending' | 'cyan' | 'rejected' | 'neutral' } => {
    switch (displayStatus) {
      case 'VERIFIED':
        return { label: 'VERIFIED & REWARDED', variant: 'verified' };
      case 'PENDING_PARTNER_VERIFICATION':
        return { label: 'PENDING PARTNER VERIFICATION', variant: 'pending' };
      case 'IN_PROGRESS':
        return { label: 'ASSIGNMENT ACTIVE', variant: 'cyan' };
      case 'EXPIRED':
        return { label: 'WINDOW EXPIRED', variant: 'rejected' };
      case 'NOT_STARTED':
      default:
        return { label: 'DISCOVERY READY', variant: 'neutral' };
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.emerald} />
          <Text style={styles.loadingText}>Loading App Discovery Details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (initError || !task) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>App Discovery Notice</Text>
          <Text style={styles.errorText}>{initError || 'This task is currently unavailable.'}</Text>
          <Button
            title="Return to Earn Hub"
            onPress={() => navigation.goBack()}
            variant="outline"
            style={styles.errorButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  const badgeConfig = getStatusBadgeConfig();
  const conversionRequirement = task.appInstallConfig?.conversionEvent || 'FIRST_OPEN';
  const packageName = task.appInstallConfig?.packageName || 'Unavailable';
  const appName = task.appInstallConfig?.appName || task.title;
  const isSyntheticTest = Boolean(
    task.campaignName?.toUpperCase().includes('SYNTHETIC') ||
    task.campaignName?.toUpperCase().includes('QA') ||
    task.title?.toUpperCase().includes('QA')
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Discovery</Text>
        <TouchableOpacity
          onPress={() => checkStatus(false)}
          disabled={isRefreshingStatus}
          style={styles.refreshButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {isRefreshingStatus ? (
            <ActivityIndicator size="small" color={THEME.colors.emerald} />
          ) : (
            <Text style={styles.refreshButtonText}>Sync 🔄</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Sponsored Disclosure Banner */}
        <View style={styles.disclosureBanner}>
          <View style={styles.disclosureHeader}>
            <Badge label="SPONSORED APP DISCOVERY" variant="gold" />
            <Text style={styles.platformText}>Android • Google Play</Text>
          </View>
          <Text style={styles.disclosureBody}>
            AdPayOn is an independent discovery platform. This task is sponsored by{' '}
            <Text style={styles.boldText}>{task.campaignName || 'our partner advertiser'}</Text>. Google Play and the app developer do not endorse or administer AdPayOn rewards.
          </Text>
        </View>

        {/* Synthetic QA Mode Clarity Notice */}
        {isSyntheticTest ? (
          <View style={styles.syntheticNoticeCard}>
            <View style={styles.syntheticHeaderRow}>
              <Badge label="SYNTHETIC TEST — NOT A VERIFIED INSTALL" variant="rejected" />
              <Text style={styles.platformText}>AdPayOn QA Engine</Text>
            </View>
            <Text style={styles.syntheticBody}>
              This task is an internal QA simulation. Conversions are tested via simulated backend postbacks.
              Google Play and the app developer do not endorse or administer rewards. No commercial attribution occurs.
            </Text>
          </View>
        ) : null}

        {/* Main App Details Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.appIconPlaceholder}>
              <Text style={styles.appIconLetter}>{appName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.appTitleContainer}>
              <Text style={styles.appName} numberOfLines={2}>
                {appName}
              </Text>
              <Text style={styles.packageName} numberOfLines={1}>
                {packageName}
              </Text>
            </View>
          </View>

          {/* Reward Incentive Card */}
          <View style={styles.rewardBanner}>
            <View style={styles.rewardLeft}>
              <Text style={styles.rewardLabel}>Promotional Reward</Text>
              <Text style={styles.rewardSubtext}>Non-withdrawable internal points</Text>
            </View>
            <View style={styles.rewardRight}>
              <Text style={styles.rewardPointsText}>+{task.rewardPoints} PTS</Text>
            </View>
          </View>

          {/* Task Description */}
          {task.description ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>About this App</Text>
              <Text style={styles.sectionValue}>{task.description}</Text>
            </View>
          ) : null}

          {/* Conversion Invariant Details */}
          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specTitle}>Action Required</Text>
              <Text style={styles.specValue}>{conversionRequirement}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specTitle}>Verification</Text>
              <Text style={styles.specValue}>Partner S2S Postback</Text>
            </View>
          </View>
        </View>

        {/* Status & Verification Explanation Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeaderRow}>
            <Text style={styles.statusSectionTitle}>Attribution Status</Text>
            <Badge label={badgeConfig.label} variant={badgeConfig.variant} />
          </View>

          {displayStatus === 'VERIFIED' ? (
            <View style={styles.verifiedBox}>
              <Text style={styles.verifiedTitle}>
                {isSyntheticTest ? '🧪 Synthetic QA Conversion Verified' : '🎉 Conversion Verified!'}
              </Text>
              <Text style={styles.verifiedText}>
                {isSyntheticTest
                  ? `Simulated QA postback has been verified by the test engine. +${
                      verifiedPoints ?? task.rewardPoints
                    } Promotional PTS awarded to your internal test balance.`
                  : `The partner postback has been cryptographically verified. +${
                      verifiedPoints ?? task.rewardPoints
                    } Promotional PTS have been awarded to your account.`}
              </Text>
            </View>
          ) : displayStatus === 'PENDING_PARTNER_VERIFICATION' ? (
            <View style={styles.pendingBox}>
              <ActivityIndicator size="small" color={THEME.colors.gold} style={styles.pendingSpinner} />
              <View style={styles.pendingTextContainer}>
                <Text style={styles.pendingTitle}>Awaiting Partner Attribution</Text>
                <Text style={styles.pendingText}>
                  Store opened. AdPayOn awards points exclusively when the advertiser or Mobile Measurement Partner verifies your{' '}
                  <Text style={styles.boldText}>{conversionRequirement}</Text> via authenticated server-to-server postback.
                </Text>
                <Text style={styles.pendingSubtext}>
                  Status updates automatically. You can also tap Sync at any time.
                </Text>
              </View>
            </View>
          ) : displayStatus === 'EXPIRED' ? (
            <View style={styles.expiredBox}>
              <Text style={styles.expiredTitle}>Conversion Window Closed</Text>
              <Text style={styles.expiredText}>
                The maximum attribution window for this task assignment has expired.
              </Text>
            </View>
          ) : (
            <View style={styles.neutralBox}>
              <Text style={styles.neutralTitle}>Ready for Discovery</Text>
              <Text style={styles.neutralText}>
                Review app information and open the official Google Play Store listing when ready. Installing the app is completely optional.
              </Text>
            </View>
          )}
        </View>

        {/* In-App Feedback & Verification Card */}
        {displayStatus !== 'VERIFIED' && displayStatus !== 'EXPIRED' && (
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackCardHeader}>
              <Text style={styles.feedbackCardTitle}>📝 Testing Feedback</Text>
              <Badge label="Required for Reward" variant="active" />
            </View>
            <Text style={styles.feedbackCardSubtitle}>
              {task?.appInstallConfig?.feedbackQuestion ||
                'What was your experience testing this app? Provide your feedback to verify completion and claim points.'}
            </Text>

            {/* Rating Stars */}
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>Your Rating:</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setFeedbackRating(star)}
                    style={styles.starTouch}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.starIcon, feedbackRating >= star ? styles.starActive : styles.starInactive]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Feedback Input */}
            <TextInput
              style={styles.feedbackInput}
              multiline
              numberOfLines={4}
              placeholder="Enter your testing feedback (e.g. design was clean, found bug in search, easy onboarding...)"
              placeholderTextColor={THEME.colors.textMuted}
              value={feedbackText}
              onChangeText={setFeedbackText}
              textAlignVertical="top"
            />

            <Button
              title={
                isSubmittingFeedback
                  ? 'Submitting Feedback...'
                  : `Submit Feedback & Claim +${task?.rewardPoints || 0} PTS`
              }
              onPress={handleFeedbackSubmit}
              variant="primary"
              disabled={isSubmittingFeedback || feedbackText.trim().length < 3}
              isLoading={isSubmittingFeedback}
              style={styles.feedbackSubmitButton}
            />
          </View>
        )}

        {/* Policy & Safety Disclosure */}
        <View style={styles.safetyCard}>
          <Text style={styles.safetyHeader}>🛡️ Attribution & Privacy Notice</Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>No Automatic Points:</Text> Opening Google Play or installing the app alone does not award points.
          </Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>Official Store Only:</Text> AdPayOn links strictly to official Google Play listings and never distributes APKs or sideloaded files.
          </Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>Privacy Protection:</Text> AdPayOn does not scan, monitor, or query apps installed on your device.
          </Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>Optional Choice:</Text> You are never obligated to install. Reward points are non-withdrawable promotional points.
          </Text>
        </View>

        {/* Action Button Container */}
        <View style={styles.actionContainer}>
          {displayStatus === 'VERIFIED' ? (
            <Button
              title="Return to Earn Hub ✓"
              onPress={() => navigation.goBack()}
              variant="primary"
              style={styles.primaryActionButton}
            />
          ) : displayStatus === 'EXPIRED' ? (
            <Button
              title="Return to Earn Hub"
              onPress={() => navigation.goBack()}
              variant="outline"
              style={styles.primaryActionButton}
            />
          ) : (
            <>
              <Button
                title={
                  displayStatus === 'PENDING_PARTNER_VERIFICATION'
                    ? 'View on Google Play Again ↗'
                    : 'View on Google Play ↗'
                }
                onPress={handleOpenStore}
                variant="primary"
                style={styles.primaryActionButton}
              />
              <Button
                title="Check Verification Status 🔄"
                onPress={() => checkStatus(false)}
                variant="outline"
                isLoading={isRefreshingStatus}
                style={styles.secondaryActionButton}
              />
            </>
          )}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  loadingText: {
    marginTop: THEME.spacing.md,
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: THEME.spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  errorButton: {
    minWidth: 160,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  backButton: {
    paddingVertical: THEME.spacing.xs,
    paddingRight: THEME.spacing.sm,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: THEME.colors.emerald,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  refreshButton: {
    paddingVertical: THEME.spacing.xs,
    paddingLeft: THEME.spacing.sm,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  scrollContent: {
    padding: THEME.spacing.lg,
    paddingBottom: THEME.spacing.xxxl,
  },
  disclosureBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  disclosureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  platformText: {
    fontSize: 12,
    color: THEME.colors.goldLight,
    fontWeight: '600',
  },
  disclosureBody: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  syntheticNoticeCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.lg,
  },
  syntheticHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  syntheticBody: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  appIconPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  appIconLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  appTitleContainer: {
    flex: 1,
  },
  appName: {
    fontSize: 17,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  packageName: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: THEME.colors.textMuted,
  },
  rewardBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    borderColor: THEME.colors.borderSubtle,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginVertical: THEME.spacing.sm,
  },
  rewardLeft: {
    flex: 1,
  },
  rewardLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  rewardSubtext: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  rewardRight: {
    alignItems: 'flex-end',
  },
  rewardPointsText: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  sectionBlock: {
    marginTop: THEME.spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.xs,
  },
  sectionValue: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    lineHeight: 19,
  },
  specGrid: {
    flexDirection: 'row',
    marginTop: THEME.spacing.lg,
    paddingTop: THEME.spacing.md,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  specItem: {
    flex: 1,
  },
  specTitle: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  specValue: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    fontWeight: '700',
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  statusSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  verifiedBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
  },
  verifiedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.emerald,
    marginBottom: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  pendingBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
  },
  pendingSpinner: {
    marginRight: THEME.spacing.md,
    marginTop: 2,
  },
  pendingTextContainer: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.goldLight,
    marginBottom: 4,
  },
  pendingText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
  pendingSubtext: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  expiredBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
  },
  expiredTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.danger,
    marginBottom: 4,
  },
  expiredText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
  neutralBox: {
    backgroundColor: THEME.colors.surfaceElevated,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
  },
  neutralTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  neutralText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
  },
  safetyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: THEME.colors.borderSubtle,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
  },
  safetyHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    marginBottom: THEME.spacing.sm,
  },
  safetyItem: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    lineHeight: 17,
    marginBottom: 4,
  },
  boldText: {
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  feedbackCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  feedbackCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.xs,
  },
  feedbackCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  feedbackCardSubtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: THEME.spacing.md,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  starTouch: {
    padding: 2,
  },
  starIcon: {
    fontSize: 22,
  },
  starActive: {
    color: '#F59E0B',
  },
  starInactive: {
    color: '#4B5563',
  },
  feedbackInput: {
    backgroundColor: THEME.colors.background,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.md,
    color: THEME.colors.textPrimary,
    fontSize: 13,
    minHeight: 85,
    marginBottom: THEME.spacing.md,
  },
  feedbackSubmitButton: {
    width: '100%',
  },
  actionContainer: {
    gap: THEME.spacing.sm,
  },
  primaryActionButton: {
    width: '100%',
  },
  secondaryActionButton: {
    width: '100%',
  },
});
