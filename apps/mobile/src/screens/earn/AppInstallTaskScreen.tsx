import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import {
  getTaskFeedApi,
  getTaskStatusApi,
  startTaskApi,
  recordStoreVisitApi,
  verifyAppInstallApi,
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
import {
  checkPackageInstallation,
  openInstalledPackage,
  InstallationStatus,
} from '../../modules/packageInstallChecker';
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

  const taskRef = useRef<TaskFeedItem | null>(null);
  const hasOpenedStoreRef = useRef(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    hasOpenedStoreRef.current = hasOpenedStore;
  }, [hasOpenedStore]);

  // Local package installation checking state
  const [initialInstallStatus, setInitialInstallStatus] = useState<InstallationStatus | null>(null);
  const [currentInstallStatus, setCurrentInstallStatus] = useState<InstallationStatus | 'CHECKING' | null>(null);
  const [installCheckMessage, setInstallCheckMessage] = useState<string | null>(null);
  const [wasPreinstalled, setWasPreinstalled] = useState(false);
  const [isOpeningApp, setIsOpeningApp] = useState(false);
  const [isLaunchingStore, setIsLaunchingStore] = useState(false);
  const [isVerifyingReward, setIsVerifyingReward] = useState(false);
  const [verifySuccessMessage, setVerifySuccessMessage] = useState<string | null>(null);

  const initialInstallStatusRef = useRef<InstallationStatus | null>(null);
  const currentInstallStatusRef = useRef<InstallationStatus | 'CHECKING' | null>(null);
  const hasBackgroundedRef = useRef(false);
  const isActionInFlightRef = useRef(false);
  const isCheckingInstallRef = useRef(false);
  const isVerifyingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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
  const [completionCodeInput, setCompletionCodeInput] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || feedbackText.trim().length < 3) {
      Alert.alert('Feedback Required', 'Please enter at least a few words describing your testing experience.');
      return;
    }
    if (task?.appInstallConfig?.completionCode && !completionCodeInput.trim()) {
      Alert.alert('Completion Code Required', 'Please enter the partner completion code provided by the app.');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const res = await submitAppFeedbackApi(taskId, {
        feedback: feedbackText.trim(),
        rating: feedbackRating,
        completionCode: completionCodeInput.trim() || undefined,
      });
      if (res.success) {
        if (res.data.status === 'PENDING_REVIEW') {
          setDisplayStatus('PENDING_PARTNER_VERIFICATION');
          stopPolling();
          Alert.alert(
            '⏳ Submitted for Review',
            'Your testing feedback has been received and queued for administrative review. Points will be released once approved.',
            [{ text: 'Understood', onPress: () => navigation.goBack() }]
          );
        } else {
          setDisplayStatus('VERIFIED');
          setVerifiedPoints(res.data.rewardPoints || task?.rewardPoints || 0);
          stopPolling();
          Alert.alert(
            '🎉 Feedback Verified!',
            `+${res.data.rewardPoints || task?.rewardPoints || 0} Promotional Points credited to your balance.`,
            [{ text: 'Great!', onPress: () => navigation.goBack() }]
          );
        }
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
        console.log('[DEBUG-APPTASK] getTaskStatusApi calling for taskId:', taskId);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Status check timed out')), 8000)
        );
        const res = await Promise.race([getTaskStatusApi(taskId), timeoutPromise]);
        console.log('[DEBUG-APPTASK] getTaskStatusApi response:', JSON.stringify(res));
        if (res.success && res.data && isComponentMountedRef.current) {
          setStatusResponse(res.data);
          const mapped = mapServerStatusToDisplay(res.data, hasOpenedStoreRef.current);
          setDisplayStatus(mapped);

          // If conversion has been verified, stop polling and update points
          if (mapped === 'VERIFIED') {
            stopPolling();
            if (taskRef.current?.rewardPoints) {
              setVerifiedPoints(taskRef.current.rewardPoints);
            }
            getTaskSummaryApi().catch(() => {});
          }

          if (mapped === 'EXPIRED') {
            stopPolling();
          }

          return res.data;
        }
      } catch (err: any) {
        console.error('[DEBUG-APPTASK] checkStatus catch error:', err?.message, err?.code, err?.status);
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
    [taskId, mapServerStatusToDisplay, stopPolling]
  );

  /**
   * Initializes task data and current assignment status.
   */
  const initScreen = useCallback(async () => {
    console.log('[DEBUG-APPTASK] initScreen started. taskId:', taskId);
    setIsLoading(true);
    setInitError(null);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('App discovery loading timed out. Please check your connection.')), 10000)
    );

    const initWorker = async () => {
      // 1. Authoritatively fetch assignment status and task metadata
      console.log('[DEBUG-APPTASK] Step 1: calling checkStatus...');
      const statusData = await checkStatus(true);
      console.log('[DEBUG-APPTASK] Step 1 complete. statusData:', JSON.stringify(statusData));

      let resolvedTask: TaskFeedItem | null = null;

      // Prefer server-returned task detail from status endpoint (survives global cap exhaustion)
      if (statusData?.task) {
        console.log('[DEBUG-APPTASK] Using server-returned task from status endpoint');
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
        console.log('[DEBUG-APPTASK] Fallback: fetching getTaskFeedApi...');
        const feedRes = await getTaskFeedApi();
        console.log('[DEBUG-APPTASK] getTaskFeedApi response received, task count:', feedRes.data?.tasks?.length);
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

      console.log('[DEBUG-APPTASK] resolvedTask found:', resolvedTask.title);
      taskRef.current = resolvedTask;
      setTask(resolvedTask);

      // Restore server-authoritative store-visit and baseline state
      const serverOpenedStore = Boolean(statusData?.assignment?.hasOpenedStore);
      if (serverOpenedStore) {
        hasOpenedStoreRef.current = true;
        setHasOpenedStore(true);
      }

      if (statusData?.assignment?.initialInstallStatus) {
        initialInstallStatusRef.current = statusData.assignment.initialInstallStatus;
        setInitialInstallStatus(statusData.assignment.initialInstallStatus);
        if (statusData.assignment.initialInstallStatus === 'INSTALLED') {
          setWasPreinstalled(true);
        }
      }

      if (statusData?.status === 'COMPLETED') {
        setDisplayStatus('VERIFIED');
        if (resolvedTask?.rewardPoints) {
          setVerifiedPoints(resolvedTask.rewardPoints);
        }
      } else if (statusData) {
        const mapped = mapServerStatusToDisplay(statusData, serverOpenedStore);
        setDisplayStatus(mapped);
      }

      // Check initial installation state baseline if not already established
      if (resolvedTask.appInstallConfig?.packageName) {
        const pkg = resolvedTask.appInstallConfig.packageName;
        console.log('[DEBUG-APPTASK] Checking package installation for:', pkg);
        if (isValidAndroidPackageName(pkg)) {
          try {
            const res = await checkPackageInstallation(pkg);
            console.log('[DEBUG-APPTASK] checkPackageInstallation result:', JSON.stringify(res));
            if (isComponentMountedRef.current) {
              if (initialInstallStatusRef.current === null) {
                initialInstallStatusRef.current = res.status;
                setInitialInstallStatus(res.status);
                if (res.status === 'INSTALLED') {
                  setWasPreinstalled(true);
                }
              }
              currentInstallStatusRef.current = res.status;
              setCurrentInstallStatus(res.status);
              setInstallCheckMessage(res.message || null);
            }
          } catch (pkgErr: any) {
            console.warn('[DEBUG-APPTASK] checkPackageInstallation initial check caught:', pkgErr);
            if (isComponentMountedRef.current) {
              initialInstallStatusRef.current = 'UNAVAILABLE';
              setInitialInstallStatus('UNAVAILABLE');
              currentInstallStatusRef.current = 'UNAVAILABLE';
              setCurrentInstallStatus('UNAVAILABLE');
              setInstallCheckMessage(pkgErr?.message || 'Package check unavailable');
            }
          }
        }
      }
    };

    try {
      await Promise.race([initWorker(), timeoutPromise]);
    } catch (err: any) {
      console.error('[DEBUG-APPTASK] initScreen catch error:', err?.message, err?.stack);
      if (isComponentMountedRef.current) {
        setInitError(err.message || 'Failed to load app discovery task');
      }
    } finally {
      console.log('[DEBUG-APPTASK] initScreen finally block reached. isMounted:', isComponentMountedRef.current);
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

  /**
   * Performs scoped package presence check via Android PackageManager.
   * On genuine fresh installation (NOT_INSTALLED -> INSTALLED), automatically verifies reward.
   */
  const runInstallationCheck = useCallback(
    async (targetPackage?: string) => {
      const activeTask = taskRef.current;
      const pkg = targetPackage || activeTask?.appInstallConfig?.packageName;
      if (!pkg || !isValidAndroidPackageName(pkg) || isCheckingInstallRef.current) return;

      // Reject stale checks from other tasks
      if (activeTask?.appInstallConfig?.packageName && pkg !== activeTask.appInstallConfig.packageName) {
        console.warn('[APPTASK] Discarding stale check for mismatched package:', pkg);
        return;
      }

      isCheckingInstallRef.current = true;
      setCurrentInstallStatus('CHECKING');

      try {
        const res = await checkPackageInstallation(pkg);
        if (!isComponentMountedRef.current) return;

        setCurrentInstallStatus(res.status);
        currentInstallStatusRef.current = res.status;
        setInstallCheckMessage(res.message || null);

        // Record initial state if this was the very first check
        if (initialInstallStatusRef.current === null) {
          initialInstallStatusRef.current = res.status;
          setInitialInstallStatus(res.status);
          if (res.status === 'INSTALLED') {
            setWasPreinstalled(true);
          }
        }

        // Automatic completion trigger for INSTALL_ONLY tasks:
        // Initial was NOT_INSTALLED and return result is INSTALLED
        const isInstallOnly =
          activeTask?.appInstallConfig?.conversionEvent === 'INSTALL_ONLY' ||
          activeTask?.appInstallConfig?.conversionEvent === 'INSTALL' ||
          activeTask?.appInstallConfig?.attributionMethod === 'CLIENT_PACKAGE_PRESENCE';

        if (
          isInstallOnly &&
          res.status === 'INSTALLED' &&
          initialInstallStatusRef.current === 'NOT_INSTALLED' &&
          hasOpenedStoreRef.current &&
          !isVerifyingRef.current &&
          displayStatus !== 'VERIFIED'
        ) {
          isVerifyingRef.current = true;
          setIsVerifyingReward(true);
          try {
            console.log('[APPTASK] Auto-verifying fresh app installation for:', pkg);
            const compRes = await verifyAppInstallApi(taskId, { packageName: pkg });
            if (compRes.success && isComponentMountedRef.current) {
              setDisplayStatus('VERIFIED');
              const points = compRes.data.rewardPoints || activeTask?.rewardPoints || 0;
              setVerifiedPoints(points);
              setVerifySuccessMessage(compRes.data.message || `+${points} promotional points credited!`);
              stopPolling();
              getTaskSummaryApi().catch(() => {});
              Alert.alert(
                '🎉 App Installed & Verified!',
                `+${points} Promotional Points have been credited to your balance.`,
                [{ text: 'Awesome!', onPress: () => {} }]
              );
            }
          } catch (compErr: any) {
            console.error('[APPTASK] verifyAppInstallApi error:', compErr);
            if (compErr?.code === 'PREINSTALLED_APP') {
              setWasPreinstalled(true);
            } else if (compErr?.code === 'TASK_ALREADY_COMPLETED') {
              setDisplayStatus('VERIFIED');
            } else {
              Alert.alert('Verification Notice', compErr?.message || 'Could not verify installation with server');
            }
          } finally {
            if (isComponentMountedRef.current) {
              setIsVerifyingReward(false);
            }
            isVerifyingRef.current = false;
          }
        }
      } catch (err: any) {
        if (isComponentMountedRef.current) {
          setCurrentInstallStatus('UNAVAILABLE');
          currentInstallStatusRef.current = 'UNAVAILABLE';
          setInstallCheckMessage(err?.message || 'Installation verification requires the test APK');
        }
      } finally {
        isCheckingInstallRef.current = false;
      }
    },
    [taskId, displayStatus, stopPolling]
  );

  // Foreground listener: automatically check installation on return from store
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        hasBackgroundedRef.current = true;
      } else if (
        (prevState === 'background' || prevState === 'inactive') &&
        nextState === 'active' &&
        hasBackgroundedRef.current
      ) {
        hasBackgroundedRef.current = false;
        const currentTask = taskRef.current;
        if (
          hasOpenedStoreRef.current &&
          currentTask?.appInstallConfig?.packageName &&
          displayStatus !== 'VERIFIED' &&
          !isVerifyingRef.current
        ) {
          runInstallationCheck(currentTask.appInstallConfig.packageName);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [displayStatus, runInstallationCheck]);

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
   * Opens installed app using Android PackageManager launch intent.
   */
  const handleOpenApp = async () => {
    const pkg = task?.appInstallConfig?.packageName;
    if (!pkg || isActionInFlightRef.current) return;
    isActionInFlightRef.current = true;
    setIsOpeningApp(true);
    try {
      const success = await openInstalledPackage(pkg);
      if (!success) {
        Alert.alert('Notice', 'Unable to launch this application automatically. You can launch it from your home screen.');
      }
    } finally {
      setIsOpeningApp(false);
      isActionInFlightRef.current = false;
    }
  };

  /**
   * Safely launches the official Google Play Store listing.
   * Checks baseline installation state first, persists initial baseline on backend,
   * then opens native market intent with HTTPS fallback.
   */
  const handleOpenStore = async () => {
    if (isActionInFlightRef.current || isLaunchingStore) return;

    const packageName = task?.appInstallConfig?.packageName;
    if (!packageName || !isValidAndroidPackageName(packageName)) {
      Alert.alert('Configuration Notice', 'The Android package identifier for this task is invalid.');
      return;
    }

    // If pre-installed, reject launching store for new-install rewards
    if (wasPreinstalled || initialInstallStatusRef.current === 'INSTALLED') {
      Alert.alert(
        'Already Installed',
        'Already installed — new-install reward unavailable. Promotional rewards are exclusively for fresh app discoveries.',
        [
          { text: 'Open App', onPress: handleOpenApp },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    isActionInFlightRef.current = true;
    setIsLaunchingStore(true);

    try {
      // 1. Establish baseline initial installation state before opening Store
      let baselineStatus: InstallationStatus | null = initialInstallStatusRef.current;
      if (baselineStatus === null) {
        const initRes = await checkPackageInstallation(packageName);
        baselineStatus = initRes.status;
        initialInstallStatusRef.current = initRes.status;
        setInitialInstallStatus(initRes.status);
        setCurrentInstallStatus(initRes.status);
        setInstallCheckMessage(initRes.message || null);
      }

      if (baselineStatus === 'INSTALLED') {
        setWasPreinstalled(true);
        Alert.alert(
          'Already Installed',
          'Already installed — new-install reward unavailable. Promotional rewards are exclusively for fresh discoveries.',
          [
            { text: 'Open App', onPress: handleOpenApp },
            { text: 'OK', style: 'cancel' },
          ]
        );
        return;
      }

      if (baselineStatus === 'UNAVAILABLE') {
        Alert.alert(
          'Verification Unavailable',
          installCheckMessage || 'Scoped package verification is unavailable for this package/device. Please retry.',
          [{ text: 'Retry', onPress: () => runInstallationCheck() }, { text: 'Cancel', style: 'cancel' }]
        );
        return;
      }

      if (baselineStatus !== 'NOT_INSTALLED') {
        Alert.alert('Verification Notice', 'Unable to confirm initial installation state. Please retry.');
        return;
      }

      // 2. Persist target package initial check baseline to backend before opening Play Store
      try {
        const visitRes = await recordStoreVisitApi(taskId, {
          initialInstallStatus: 'NOT_INSTALLED',
          packageName,
        });
        if (visitRes.success) {
          hasOpenedStoreRef.current = true;
          setHasOpenedStore(true);
          setDisplayStatus('IN_PROGRESS');
        }
      } catch (visitErr: any) {
        console.warn('[APPTASK] Failed to persist initial baseline to backend:', visitErr.message);
        if (visitErr.code === 'DAILY_CAP_REACHED' || visitErr.code === 'TASK_EXPIRED') {
          Alert.alert('Task Notice', visitErr.message || 'Task is no longer available');
          return;
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
      hasBackgroundedRef.current = false;

      // 3. Attempt native Market Intent (Google Play app)
      try {
        const canOpenMarket = await Linking.canOpenURL(marketUri);
        if (canOpenMarket) {
          await Linking.openURL(marketUri);
          opened = true;
        }
      } catch {
        // Intent launch failed, fallback to browser
      }

      // 4. Fallback to official web Play Store URL
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
        hasOpenedStoreRef.current = true;
        setHasOpenedStore(true);
      }
    } finally {
      setIsLaunchingStore(false);
      isActionInFlightRef.current = false;
    }
  };

  const isInstallOnly = Boolean(
    task?.appInstallConfig?.conversionEvent === 'INSTALL_ONLY' ||
      task?.appInstallConfig?.conversionEvent === 'INSTALL' ||
      task?.appInstallConfig?.attributionMethod === 'CLIENT_PACKAGE_PRESENCE'
  );

  const getStatusBadgeConfig = (): { label: string; variant: 'verified' | 'pending' | 'cyan' | 'rejected' | 'neutral' } => {
    switch (displayStatus) {
      case 'VERIFIED':
        return { label: 'VERIFIED & REWARDED', variant: 'verified' };
      case 'PENDING_PARTNER_VERIFICATION':
        return isInstallOnly
          ? { label: 'STORE OPENED', variant: 'cyan' }
          : { label: 'PENDING PARTNER VERIFICATION', variant: 'pending' };
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
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.emerald} />
          <Text style={styles.loadingText}>Loading App Discovery Details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (initError || !task) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>App Discovery Notice</Text>
          <Text style={styles.errorText}>{initError || 'This task is currently unavailable.'}</Text>
          <View style={{ flexDirection: 'column', gap: 12, width: '100%', maxWidth: 260 }}>
            <Button
              title="Try Again"
              onPress={() => initScreen()}
              variant="primary"
            />
            <Button
              title="Return to Earn Hub"
              onPress={() => navigation.goBack()}
              variant="outline"
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const badgeConfig = getStatusBadgeConfig();
  const conversionRequirement = isInstallOnly
    ? 'App Installation'
    : task.appInstallConfig?.conversionEvent || 'FIRST_OPEN';
  const verificationMethodDisplay = isInstallOnly
    ? 'Automatic installation check'
    : 'Partner store confirmation';
  const packageName = task.appInstallConfig?.packageName || 'Unavailable';
  const appName = task.appInstallConfig?.appName || task.title;
  const isSyntheticTest = Boolean(
    task.campaignName?.toUpperCase().includes('SYNTHETIC') ||
    task.campaignName?.toUpperCase().includes('QA') ||
    task.title?.toUpperCase().includes('QA')
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
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
        keyboardShouldPersistTaps="handled"
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

        {/* Synthetic QA Mode Clarity Notice (Only for synthetic postback tasks, NOT for INSTALL_ONLY) */}
        {!isInstallOnly && isSyntheticTest ? (
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
              <Text style={styles.specValue}>{verificationMethodDisplay}</Text>
            </View>
          </View>
        </View>

        {/* Scoped Android Package Installation Check Card */}
        <View style={styles.installCard}>
          <View style={styles.installHeaderRow}>
            <Text style={styles.installSectionTitle}>Automatic Installation Check</Text>
            {isVerifyingReward || currentInstallStatus === 'CHECKING' ? (
              <Badge label="CHECKING…" variant="cyan" />
            ) : wasPreinstalled || (initialInstallStatus === 'INSTALLED' && displayStatus !== 'VERIFIED') ? (
              <Badge label="ALREADY INSTALLED" variant="rejected" />
            ) : displayStatus === 'VERIFIED' || currentInstallStatus === 'INSTALLED' ? (
              <Badge label="INSTALLED" variant="active" />
            ) : currentInstallStatus === 'NOT_INSTALLED' ? (
              <Badge label="NOT INSTALLED" variant="pending" />
            ) : (
              <Badge label="VERIFICATION UNAVAILABLE" variant="neutral" />
            )}
          </View>
          <View style={styles.installBody}>
            {isVerifyingReward ? (
              <View style={styles.installStatusRow}>
                <ActivityIndicator size="small" color={THEME.colors.emerald} />
                <Text style={styles.installText}>Verifying installation and crediting reward…</Text>
              </View>
            ) : currentInstallStatus === 'CHECKING' ? (
              <View style={styles.installStatusRow}>
                <ActivityIndicator size="small" color={THEME.colors.cyan} />
                <Text style={styles.installText}>Checking app installation for {packageName}…</Text>
              </View>
            ) : wasPreinstalled || (initialInstallStatus === 'INSTALLED' && displayStatus !== 'VERIFIED') ? (
              <View>
                <Text style={styles.installHeading}>⚠️ Already Installed</Text>
                <Text style={styles.installText}>
                  Already installed — new-install reward unavailable. Promotional rewards are exclusively available for fresh app discoveries and first-time installations on this device.
                </Text>
                <TouchableOpacity
                  style={styles.openAppButtonInline}
                  onPress={handleOpenApp}
                  disabled={isOpeningApp}
                >
                  {isOpeningApp ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.openAppButtonInlineText}>Open App ↗</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : displayStatus === 'VERIFIED' ? (
              <View>
                <Text style={styles.installHeading}>✓ App Present & Rewarded</Text>
                <Text style={styles.installText}>
                  Package {packageName} is verified on this device. +{verifiedPoints || task.rewardPoints} Promotional PTS credited!
                </Text>
                <TouchableOpacity
                  style={styles.openAppButtonInline}
                  onPress={handleOpenApp}
                  disabled={isOpeningApp}
                >
                  {isOpeningApp ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.openAppButtonInlineText}>Open App ↗</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : currentInstallStatus === 'INSTALLED' ? (
              <View>
                <Text style={styles.installHeading}>✓ App Present on Device</Text>
                <Text style={styles.installText}>
                  Package {packageName} is detected on this device.
                </Text>
                <TouchableOpacity
                  style={styles.openAppButtonInline}
                  onPress={handleOpenApp}
                  disabled={isOpeningApp}
                >
                  {isOpeningApp ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.openAppButtonInlineText}>Open App ↗</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : currentInstallStatus === 'NOT_INSTALLED' ? (
              <View>
                <Text style={styles.installHeading}>Not Installed</Text>
                <Text style={styles.installText}>
                  Package {packageName} was not detected on this device. Tap "Install App" below to visit the official Google Play listing.
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.installHeading}>Verification Unavailable</Text>
                <Text style={styles.installText}>
                  {installCheckMessage || 'Installation verification requires the test APK with scoped package queries.'}
                </Text>
              </View>
            )}

            <Text style={styles.installDisclaimer}>
              App installation must be completed via official store listing to receive promotional reward points.
            </Text>
          </View>
        </View>

        {/* Status & Verification Explanation Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeaderRow}>
            <Text style={styles.statusSectionTitle}>Task Status</Text>
            <Badge label={badgeConfig.label} variant={badgeConfig.variant} />
          </View>

          {displayStatus === 'VERIFIED' ? (
            <View style={styles.verifiedBox}>
              <Text style={styles.verifiedTitle}>🎉 Installation Verified & Rewarded!</Text>
              <Text style={styles.verifiedText}>
                {verifySuccessMessage ||
                  `App installation has been verified on this device. +${
                    verifiedPoints ?? task.rewardPoints
                  } Promotional PTS have been awarded to your account.`}
              </Text>
            </View>
          ) : isInstallOnly && hasOpenedStore ? (
            <View style={styles.pendingBox}>
              <ActivityIndicator size="small" color={THEME.colors.cyan} style={styles.pendingSpinner} />
              <View style={styles.pendingTextContainer}>
                <Text style={styles.pendingTitle}>Store Listing Opened</Text>
                <Text style={styles.pendingText}>
                  Please complete installation from Google Play. When you return to AdPayOn, installation is automatically verified.
                </Text>
                <Text style={styles.pendingSubtext}>
                  AdPayOn verifies installation of {packageName} safely without accessing personal data.
                </Text>
              </View>
            </View>
          ) : displayStatus === 'PENDING_PARTNER_VERIFICATION' ? (
            <View style={styles.pendingBox}>
              <ActivityIndicator size="small" color={THEME.colors.gold} style={styles.pendingSpinner} />
              <View style={styles.pendingTextContainer}>
                <Text style={styles.pendingTitle}>Awaiting Partner Attribution</Text>
                <Text style={styles.pendingText}>
                  Store opened. AdPayOn awards points when the advertiser verifies your{' '}
                  <Text style={styles.boldText}>{conversionRequirement}</Text> via official partner confirmation.
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

        {/* In-App Feedback & Verification Card (Only for non-install-only feedback tasks) */}
        {!isInstallOnly && displayStatus !== 'VERIFIED' && displayStatus !== 'EXPIRED' && (
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

            {/* Optional Partner Completion Code */}
            {task?.appInstallConfig?.completionCode ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.sectionLabel, { marginBottom: 6 }]}>Partner Completion Code *</Text>
                <TextInput
                  style={[styles.feedbackInput, { height: 44, textAlignVertical: 'center' }]}
                  placeholder="Enter partner completion code"
                  placeholderTextColor={THEME.colors.textMuted}
                  value={completionCodeInput}
                  onChangeText={setCompletionCodeInput}
                  autoCapitalize="characters"
                />
              </View>
            ) : null}

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
            • <Text style={styles.boldText}>No Automatic Points:</Text> Opening Google Play alone does not award points.
          </Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>Official Store Only:</Text> AdPayOn links strictly to official Google Play listings and never distributes APKs or sideloaded files.
          </Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>Scoped Verification Only:</Text> AdPayOn checks only whether the specific sponsored app package was installed using Android PackageManager. We never scan your storage, access Accessibility, or query other installed apps.
          </Text>
          <Text style={styles.safetyItem}>
            • <Text style={styles.boldText}>Optional Choice:</Text> You are never obligated to install. Reward points are non-withdrawable promotional points.
          </Text>
        </View>

        {/* Action Button Container */}
        <View style={styles.actionContainer}>
          {displayStatus === 'VERIFIED' ? (
            <>
              <Button
                title="Open App ↗"
                onPress={handleOpenApp}
                variant="primary"
                isLoading={isOpeningApp}
                style={styles.primaryActionButton}
              />
              <Button
                title="Return to Earn Hub"
                onPress={() => navigation.goBack()}
                variant="outline"
                style={styles.secondaryActionButton}
              />
            </>
          ) : wasPreinstalled || initialInstallStatus === 'INSTALLED' ? (
            <>
              <Button
                title="Open App ↗"
                onPress={handleOpenApp}
                variant="primary"
                isLoading={isOpeningApp}
                style={styles.primaryActionButton}
              />
              <Button
                title="Return to Earn Hub"
                onPress={() => navigation.goBack()}
                variant="outline"
                style={styles.secondaryActionButton}
              />
            </>
          ) : displayStatus === 'EXPIRED' ? (
            <Button
              title="Return to Earn Hub"
              onPress={() => navigation.goBack()}
              variant="outline"
              style={styles.primaryActionButton}
            />
          ) : isVerifyingReward ? (
            <Button
              title="Verifying Installation Reward…"
              onPress={() => {}}
              disabled
              isLoading
              variant="primary"
              style={styles.primaryActionButton}
            />
          ) : currentInstallStatus === 'UNAVAILABLE' ? (
            <>
              <Button
                title="Retry Verification 🔄"
                onPress={() => runInstallationCheck()}
                variant="primary"
                isLoading={isCheckingInstallRef.current}
                style={styles.primaryActionButton}
              />
              <Button
                title="Return to Earn Hub"
                onPress={() => navigation.goBack()}
                variant="outline"
                style={styles.secondaryActionButton}
              />
            </>
          ) : isInstallOnly ? (
            <>
              <Button
                title="Install App (Google Play) ↗"
                onPress={handleOpenStore}
                variant="primary"
                isLoading={isLaunchingStore}
                style={styles.primaryActionButton}
              />
              {hasOpenedStore && (
                <Button
                  title={currentInstallStatus === 'CHECKING' ? 'Checking Installation…' : 'Check Installation & Sync 🔄'}
                  onPress={() => runInstallationCheck()}
                  variant="outline"
                  isLoading={currentInstallStatus === 'CHECKING' || isRefreshingStatus}
                  style={styles.secondaryActionButton}
                />
              )}
            </>
          ) : (
            <>
              {currentInstallStatus === 'INSTALLED' ? (
                <Button
                  title="Open App ↗"
                  onPress={handleOpenApp}
                  variant="primary"
                  isLoading={isOpeningApp}
                  style={styles.primaryActionButton}
                />
              ) : (
                <Button
                  title="Install App (Google Play) ↗"
                  onPress={handleOpenStore}
                  variant="primary"
                  isLoading={isLaunchingStore}
                  style={styles.primaryActionButton}
                />
              )}
              {currentInstallStatus === 'INSTALLED' && (
                <Button
                  title="View on Google Play ↗"
                  onPress={handleOpenStore}
                  variant="outline"
                  isLoading={isLaunchingStore}
                  style={styles.secondaryActionButton}
                />
              )}
              <Button
                title={currentInstallStatus === 'CHECKING' ? 'Checking Installation…' : 'Check Installation & Sync 🔄'}
                onPress={() => {
                  runInstallationCheck();
                  checkStatus(false);
                }}
                variant="outline"
                isLoading={currentInstallStatus === 'CHECKING' || isRefreshingStatus}
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
  installCard: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    borderWidth: 1,
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.lg,
  },
  installHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  installSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  installBody: {
    gap: THEME.spacing.sm,
  },
  installStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  installHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  installText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  openAppButtonInline: {
    marginTop: THEME.spacing.sm,
    backgroundColor: THEME.colors.emerald,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: THEME.borderRadius.md,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openAppButtonInlineText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  installDisclaimer: {
    marginTop: THEME.spacing.xs,
    fontSize: 11,
    color: THEME.colors.textMuted,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
