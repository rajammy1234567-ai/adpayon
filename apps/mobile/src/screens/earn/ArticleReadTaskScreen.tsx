import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import {
  startArticleSessionApi,
  recordArticleProgressApi,
  submitArticleQuizAnswerApi,
  verifyArticleReadApi,
  startTaskApi,
  startExternalLinkSessionApi,
  reportExternalLinkLaunchApi,
  reportExternalLinkReturnApi,
  getExternalLinkSessionStatusApi,
  verifyExternalLinkElapsedApi,
} from '../../services/api/task.api';
import { ArticleSessionData } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useWalletStore } from '../../store/walletStore';

type ArticleReadTaskRouteProp = RouteProp<RootStackParamList, 'ArticleReadTask'>;

export type ExternalInteractionState =
  | 'NOT_STARTED'
  | 'LAUNCHING'
  | 'AWAY'
  | 'CHECKING_RETURN'
  | 'RETURNED_EARLY'
  | 'READY_TO_CLAIM'
  | 'CLAIMING'
  | 'COMPLETED';

export const ArticleReadTaskScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ArticleReadTaskRouteProp>();
  const { taskId, assignmentId: initialAssignmentId } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [session, setSession] = useState<ArticleSessionData | null>(null);

  // In-app engagement tracking (used exclusively when !session?.sourceUrl)
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [maxScrollPercentage, setMaxScrollPercentage] = useState(0);
  const [currentScrollPercentage, setCurrentScrollPercentage] = useState(0);
  const [isQualified, setIsQualified] = useState(false);

  // Quiz state (for in-app comprehension only)
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizMessage, setQuizMessage] = useState<string | null>(null);
  const [quizSuccess, setQuizSuccess] = useState(false);
  const [quizAttempts, setQuizAttempts] = useState(0);

  // External link explicit state machine
  const [extState, setExtState] = useState<ExternalInteractionState>('NOT_STARTED');
  const extStateRef = useRef<ExternalInteractionState>('NOT_STARTED');
  extStateRef.current = extState;
  const externalSessionIdRef = useRef<string | null>(null);
  const currentAttemptIdRef = useRef<string | null>(null);
  const hasBackgroundedRef = useRef<boolean>(false);
  const isActionInFlightRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Completion state
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [completionResult, setCompletionResult] = useState<{
    points: number;
    completionId: string;
  } | null>(null);

  // AppState & Timing refs
  const sessionRef = useRef<ArticleSessionData | null>(null);
  sessionRef.current = session;
  const isCompletedRef = useRef(false);
  isCompletedRef.current = isCompleted;

  const lastBeaconTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);
  const isReportingRef = useRef<boolean>(false);

  const isExternalArticle = Boolean(session?.sourceUrl);

  // 1. Initialize Task Assignment & Session
  const initSession = useCallback(async () => {
    setIsLoading(true);
    setInitError(null);
    setShowSuccessModal(false); // Clear any stale award modal state on init

    try {
      let activeAssignmentId = initialAssignmentId;

      if (!activeAssignmentId) {
        try {
          const assignRes = await startTaskApi(taskId);
          if (assignRes.success && assignRes.data?.assignment) {
            activeAssignmentId = assignRes.data.assignment.id;
          }
        } catch {
          // If assignment already exists or duplicate active, proceed
        }
      }

      const res = await startArticleSessionApi(taskId, activeAssignmentId);
      if (res.success && res.data) {
        const data = res.data;
        setSession(data);

        // Check if server already has this task as COMPLETED
        if ((data as any).isCompleted || data.status === 'COMPLETED' || (data as any).rewardGranted) {
          setIsCompleted(true);
          isCompletedRef.current = true;
          setExtState('COMPLETED');
          extStateRef.current = 'COMPLETED';
          setShowSuccessModal(false); // Award modal NEVER shown on restoration
          setRemainingSeconds(0);
          setAccumulatedSeconds(data.minReadDurationSeconds || 30);
          return;
        }

        // If this is an external-link article task, restore external session from backend
        if (data.sourceUrl) {
          try {
            const extStatusRes = await getExternalLinkSessionStatusApi(taskId);
            if (extStatusRes.success && extStatusRes.data) {
              const extData = extStatusRes.data;
              externalSessionIdRef.current = extData.sessionId;
              currentAttemptIdRef.current = extData.attemptId || null;

              if (extData.isCompleted || extData.status === 'COMPLETED' || extData.rewardGranted) {
                // COMPLETED: completed UI; no Try Again or new attempt, no award modal
                setIsCompleted(true);
                isCompletedRef.current = true;
                setExtState('COMPLETED');
                extStateRef.current = 'COMPLETED';
                setShowSuccessModal(false);
              } else if (extData.isDurationMet) {
                // Eligible but unclaimed: READY TO CLAIM; no award modal
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('READY_TO_CLAIM');
                extStateRef.current = 'READY_TO_CLAIM';
                setShowSuccessModal(false);
              } else if (extData.status === 'RETURNED_EARLY' || extData.attemptStatus === 'RETURNED_EARLY') {
                // Incomplete/interrupted: Try Again; no award modal
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('RETURNED_EARLY');
                extStateRef.current = 'RETURNED_EARLY';
                setShowSuccessModal(false);
              } else if (extData.linkLaunched) {
                // Was previously launched but left dangling / re-entered: Try Again; no award modal
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('RETURNED_EARLY');
                extStateRef.current = 'RETURNED_EARLY';
                setShowSuccessModal(false);
              } else {
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('NOT_STARTED');
                extStateRef.current = 'NOT_STARTED';
                setShowSuccessModal(false);
              }
            } else {
              setExtState('NOT_STARTED');
            }
          } catch {
            setExtState('NOT_STARTED');
            externalSessionIdRef.current = null;
            currentAttemptIdRef.current = null;
          }
        } else {
          // Standard in-app reading state initialization
          setAccumulatedSeconds(data.accumulatedReadSeconds || 0);
          setRemainingSeconds(data.remainingReadSeconds || 0);
          setMaxScrollPercentage(data.maxScrollPercentage || 0);
          maxScrollRef.current = data.maxScrollPercentage || 0;
          setIsQualified(Boolean(data.isQualified));
          setQuizSuccess(Boolean(data.quizAnswerCorrect));
          setQuizAttempts(data.quizAttempts || 0);
          lastBeaconTimeRef.current = Date.now();
        }
      } else {
        setInitError('Failed to establish article reading session');
      }
    } catch (err: any) {
      setInitError(err.message || 'Unable to connect to reading server');
    } finally {
      setIsLoading(false);
    }
  }, [taskId, initialAssignmentId]);

  useEffect(() => {
    initSession();
    return () => {
      setShowSuccessModal(false); // Clear stale modal on task change / unmount
    };
  }, [initSession]);

  // Telemetry helper to report progress beacon (IN-APP MODE ONLY)
  const sendBeacon = useCallback(
    async (extraParams?: { forceAppState?: 'active' | 'background'; forceScroll?: number }) => {
      const curSession = sessionRef.current;
      // Do not run in-app beacon for external articles
      if (!curSession || curSession.sourceUrl || isCompletedRef.current || isReportingRef.current) return;

      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((now - lastBeaconTimeRef.current) / 1000));
      lastBeaconTimeRef.current = now;

      const effectiveAppState = extraParams?.forceAppState || (AppState.currentState === 'active' ? 'active' : 'background');
      const effectiveScroll = extraParams?.forceScroll !== undefined ? extraParams.forceScroll : maxScrollRef.current;

      try {
        isReportingRef.current = true;
        const res = await recordArticleProgressApi(taskId, {
          sessionId: curSession.sessionId,
          scrollPercentage: effectiveScroll,
          appState: effectiveAppState,
          readingDeltaSeconds: elapsedSeconds,
        });

        if (res.success && res.data) {
          setAccumulatedSeconds(res.data.accumulatedReadSeconds);
          setMaxScrollPercentage(res.data.maxScrollPercentage);
          maxScrollRef.current = res.data.maxScrollPercentage;
          setRemainingSeconds(res.data.remainingReadSeconds);
          setIsQualified(res.data.isQualified);
          if (res.data.quizAnswerCorrect) {
            setQuizSuccess(true);
          }
        }
      } catch {
        // Transient error resilience
      } finally {
        isReportingRef.current = false;
      }
    },
    [taskId]
  );

  // 2. Periodic Telemetry Beacon (ONLY for in-app reading tasks)
  useEffect(() => {
    if (!session || isCompleted || session.sourceUrl) return;

    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      sendBeacon();
    }, 2500);

    return () => clearInterval(interval);
  }, [session, isCompleted, sendBeacon]);

  // 2. Return handling from external browser
  const handleExternalReturn = useCallback(async () => {
    if (isCompletedRef.current || isActionInFlightRef.current) return;
    if (extStateRef.current !== 'AWAY') return;

    const targetSid = externalSessionIdRef.current;
    const attemptId = currentAttemptIdRef.current;
    if (!targetSid || !attemptId) {
      setExtState('RETURNED_EARLY');
      extStateRef.current = 'RETURNED_EARLY';
      return;
    }

    // Immediately show "Checking task…" with Claim disabled
    isActionInFlightRef.current = true;
    setExtState('CHECKING_RETURN');
    extStateRef.current = 'CHECKING_RETURN';

    try {
      const res = await reportExternalLinkReturnApi(taskId, targetSid, attemptId);

      // Protect against stale response from older attempt
      if (currentAttemptIdRef.current !== attemptId) {
        return;
      }

      if (res.success && res.data) {
        if (res.data.isDurationMet) {
          setExtState('READY_TO_CLAIM');
          extStateRef.current = 'READY_TO_CLAIM';
        } else {
          setExtState('RETURNED_EARLY');
          extStateRef.current = 'RETURNED_EARLY';
        }
      } else {
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
      }
    } catch {
      if (currentAttemptIdRef.current === attemptId) {
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
      }
    } finally {
      isActionInFlightRef.current = false;
    }
  }, [taskId]);

  const handleExternalReturnRef = useRef(handleExternalReturn);
  handleExternalReturnRef.current = handleExternalReturn;
  const sendBeaconRef = useRef(sendBeacon);
  sendBeaconRef.current = sendBeacon;

  // 3. Foreground / Background AppState Listener (Single listener registered once on mount)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (sessionRef.current?.sourceUrl) {
        // Only track background transition if we are actually in AWAY state
        if (extStateRef.current === 'AWAY') {
          if (prevState === 'active' && (nextState === 'background' || nextState === 'inactive')) {
            hasBackgroundedRef.current = true;
          } else if (
            (prevState === 'background' || prevState === 'inactive') &&
            nextState === 'active' &&
            hasBackgroundedRef.current
          ) {
            hasBackgroundedRef.current = false;
            handleExternalReturnRef.current();
          }
        }
      } else {
        // In-app mode beacon handling
        if (prevState === 'active' && nextState !== 'active') {
          sendBeaconRef.current({ forceAppState: 'background' });
        } else if (prevState !== 'active' && nextState === 'active') {
          lastBeaconTimeRef.current = Date.now();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 4. Scroll Tracking (in-app only)
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (session?.sourceUrl) return; // Scroll not tracked for external articles

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const totalScrollable = contentSize.height - layoutMeasurement.height;

    let percentage = 0;
    if (totalScrollable <= 0) {
      percentage = 100;
    } else {
      const currentScroll = contentOffset.y + layoutMeasurement.height;
      if (currentScroll >= contentSize.height - paddingToBottom) {
        percentage = 100;
      } else {
        percentage = Math.min(100, Math.max(0, Math.round((contentOffset.y / totalScrollable) * 100)));
      }
    }

    setCurrentScrollPercentage(percentage);
    if (percentage > maxScrollRef.current) {
      maxScrollRef.current = percentage;
      setMaxScrollPercentage(percentage);
    }
  };

  // 5. Open External Article & Start Session
  const handleOpenExternalArticle = async () => {
    if (!session?.sourceUrl) return;

    // Guard against repeated taps or launching while in transition
    if (isActionInFlightRef.current) return;
    if (extStateRef.current !== 'NOT_STARTED' && extStateRef.current !== 'RETURNED_EARLY') {
      return;
    }

    isActionInFlightRef.current = true;
    // Immediately show "Opening article…" and disable button
    setExtState('LAUNCHING');
    extStateRef.current = 'LAUNCHING';
    hasBackgroundedRef.current = false;

    try {
      let activeSessionId = externalSessionIdRef.current;
      if (!activeSessionId) {
        const extRes = await startExternalLinkSessionApi(taskId).catch(() => null);
        activeSessionId = extRes?.data?.sessionId || session.sessionId;
        externalSessionIdRef.current = activeSessionId;
      }

      // 1. Verify URL can be opened by device
      const supported = await Linking.canOpenURL(session.sourceUrl);
      if (!supported) {
        await reportExternalLinkLaunchApi(
          taskId,
          activeSessionId,
          false,
          'URL scheme not supported by device'
        ).catch(() => {});
        isActionInFlightRef.current = false;
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
        Alert.alert('Notice', 'Unable to open article link in external browser.');
        return;
      }

      // 2. Report launch FIRST so backend creates attemptId and starts timing
      const reportRes = await reportExternalLinkLaunchApi(taskId, activeSessionId, true).catch(() => null);
      if (!reportRes?.success || !reportRes?.data?.attemptId) {
        throw new Error((reportRes as any)?.error?.message || 'Failed to start external link session on server');
      }

      const attemptId = reportRes.data.attemptId;
      currentAttemptIdRef.current = attemptId;

      // 3. Transition to AWAY state before opening browser
      setExtState('AWAY');
      extStateRef.current = 'AWAY';
      hasBackgroundedRef.current = false;
      isActionInFlightRef.current = false;

      // 4. Open external browser
      await Linking.openURL(session.sourceUrl);
    } catch (err: any) {
      isActionInFlightRef.current = false;
      currentAttemptIdRef.current = null;
      setExtState('RETURNED_EARLY');
      extStateRef.current = 'RETURNED_EARLY';
      Alert.alert('Notice', err?.message || 'Opening external article was interrupted.');
    }
  };

  // 6. Submit Quiz Answer (in-app only)
  const handleSubmitQuiz = async () => {
    if (selectedOption === null || !session || isSubmittingQuiz) return;

    setIsSubmittingQuiz(true);
    setQuizMessage(null);

    try {
      const res = await submitArticleQuizAnswerApi(taskId, {
        sessionId: session.sessionId,
        selectedOptionIndex: selectedOption,
      });

      if (res.success && res.data) {
        if (res.data.correct) {
          setQuizSuccess(true);
          setQuizMessage('Correct! Comprehension verified.');
          setIsQualified(res.data.isQualified);
        } else {
          setQuizSuccess(false);
          setQuizMessage(res.data.message || 'Incorrect answer. Please re-read and try again.');
          if (res.data.remainingAttempts !== undefined) {
            setQuizAttempts(session.quizMaxAttempts - res.data.remainingAttempts);
          }
        }
      } else {
        setQuizMessage('Failed to submit answer. Please try again.');
      }
    } catch (err: any) {
      setQuizMessage(err.message || 'Error submitting answer');
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // 7. Authoritative Reward Claim Trigger
  const handleVerify = async () => {
    if (!session || isVerifying || isCompletedRef.current || isActionInFlightRef.current) return;

    try {
      // Flow A: External Article Task
      if (session.sourceUrl) {
        if (extStateRef.current !== 'READY_TO_CLAIM') return;

        const targetSid = externalSessionIdRef.current;
        if (!targetSid) {
          Alert.alert('Launch Required', 'Please tap "Open Article & Start" before claiming.');
          return;
        }

        isActionInFlightRef.current = true;
        setIsVerifying(true);
        setExtState('CLAIMING');
        extStateRef.current = 'CLAIMING';

        try {
          const extRes = await verifyExternalLinkElapsedApi(taskId, targetSid).catch((err: any) => {
            return err?.response?.data || null;
          });

          if (
            extRes &&
            (extRes.status === 'COMPLETED' || extRes.success || extRes.error?.code === 'TASK_ALREADY_COMPLETED')
          ) {
            setExtState('COMPLETED');
            extStateRef.current = 'COMPLETED';
            setIsCompleted(true);
            isCompletedRef.current = true;
            const pointsEarned = extRes.data?.rewardPoints || session.minReadDurationSeconds || 10;
            setCompletionResult({
              points: pointsEarned,
              completionId: extRes.data?.completionId || `ext-${targetSid}`,
            });
            setShowSuccessModal(true); // Only show congratulations modal after current explicit claim succeeds

            // Claim once, then refresh history/balance without blocking the success screen
            Promise.allSettled([
              useWalletStore.getState().fetchSummary(),
              useWalletStore.getState().fetchTransactions(),
            ]).catch(() => {});
            return;
          }

          if (extRes && (extRes.status === 'RETURNED_EARLY' || extRes.status === 'INCOMPLETE')) {
            setExtState('RETURNED_EARLY');
            extStateRef.current = 'RETURNED_EARLY';
            Alert.alert(
              'Duration Incomplete',
              `You returned early. Open the link again and complete the full ${session.minReadDurationSeconds || 30} seconds.`
            );
            return;
          }

          setExtState('RETURNED_EARLY');
          extStateRef.current = 'RETURNED_EARLY';
          Alert.alert(
            'Verification Notice',
            extRes?.message || extRes?.error?.message || 'Unable to verify external article reading.'
          );
        } catch (err: any) {
          setExtState('RETURNED_EARLY');
          extStateRef.current = 'RETURNED_EARLY';
          Alert.alert(
            'Verification Error',
            err.message || 'Unable to complete reward verification.'
          );
        } finally {
          setIsVerifying(false);
          isActionInFlightRef.current = false;
        }
        return;
      }

      // Flow B: In-app article reader flow
      await sendBeacon();

      const res = await verifyArticleReadApi(taskId, session.sessionId);
      if (res.success && res.data) {
        setIsCompleted(true);
        isCompletedRef.current = true;
        setCompletionResult({
          points: res.data.completion.rewardPoints,
          completionId: res.data.completion.id,
        });
        setShowSuccessModal(true); // Only show congratulations modal after current explicit claim succeeds
        useWalletStore.getState().fetchSummary().catch(() => {});
        useWalletStore.getState().fetchTransactions().catch(() => {});
      } else {
        Alert.alert(
          'Verification Incomplete',
          'Could not verify complete reading session. Please ensure all reading duration and scroll requirements are met.'
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Verification Error',
        err.message || 'Unable to complete reward verification. Please complete the reading requirements.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const paragraphs = session?.articleContent
    ? session.articleContent.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    : [];

  const requiredDuration = session?.minReadDurationSeconds || 30;
  const requiredScroll = session?.minScrollPercentage || 80;

  // Clamped displayed seconds
  const displayedElapsedSeconds = isExternalArticle
    ? extState === 'READY_TO_CLAIM' || extState === 'COMPLETED'
      ? requiredDuration
      : 0
    : Math.min(requiredDuration, accumulatedSeconds);

  const timeProgressPercent = isExternalArticle
    ? extState === 'READY_TO_CLAIM' || extState === 'COMPLETED'
      ? 100
      : extState === 'LAUNCHING' || extState === 'AWAY' || extState === 'CHECKING_RETURN'
      ? 50
      : 0
    : Math.min(100, Math.round((displayedElapsedSeconds / requiredDuration) * 100));

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Back"
        >
          <Text style={styles.backButtonText}>← Exit</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session?.articleTitle || 'Promotional Article'}
        </Text>
        <View style={styles.headerRight}>
          {isExternalArticle ? (
            extState === 'NOT_STARTED' ? (
              <Badge label="NOT STARTED" variant="neutral" />
            ) : extState === 'LAUNCHING' ? (
              <Badge label="OPENING…" variant="gold" />
            ) : extState === 'AWAY' ? (
              <Badge label="IN PROGRESS" variant="gold" />
            ) : extState === 'CHECKING_RETURN' ? (
              <Badge label="CHECKING…" variant="gold" />
            ) : extState === 'READY_TO_CLAIM' ? (
              <Badge label="READY TO CLAIM" variant="verified" />
            ) : extState === 'CLAIMING' ? (
              <Badge label="CLAIMING…" variant="gold" />
            ) : extState === 'COMPLETED' ? (
              <Badge label="COMPLETED" variant="verified" />
            ) : (
              <Badge label="TRY AGAIN" variant="gold" />
            )
          ) : (
            <Badge
              label={isQualified ? 'QUALIFIED' : `${remainingSeconds}s LEFT`}
              variant={isQualified ? 'verified' : 'gold'}
            />
          )}
        </View>
      </View>

      {/* Progress Bar Container */}
      {!isLoading && !initError && (
        <View style={styles.statusBarContainer}>
          <View style={styles.metricRow}>
            {isExternalArticle ? (
              <Text style={styles.metricLabel}>
                {extState === 'NOT_STARTED'
                  ? 'Time: Not started (0%)'
                  : extState === 'READY_TO_CLAIM' || extState === 'COMPLETED'
                  ? `Time: ${requiredDuration}s / ${requiredDuration}s (100%)`
                  : extState === 'LAUNCHING' || extState === 'AWAY'
                  ? `Time: In progress (${requiredDuration}s target)`
                  : extState === 'CHECKING_RETURN'
                  ? 'Time: Checking server…'
                  : `Time: 0s / ${requiredDuration}s (0%)`}
              </Text>
            ) : (
              <>
                <Text style={styles.metricLabel}>
                  Time: {accumulatedSeconds}s / {requiredDuration}s ({timeProgressPercent}%)
                </Text>
                <Text style={styles.metricLabel}>
                  Scroll: {maxScrollPercentage}% / {requiredScroll}%
                </Text>
              </>
            )}
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${timeProgressPercent}%`,
                  backgroundColor:
                    (isExternalArticle ? extState === 'READY_TO_CLAIM' || extState === 'COMPLETED' : isQualified)
                      ? THEME.colors.emerald
                      : THEME.colors.gold,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.emerald} />
          <Text style={styles.loadingText}>Loading article content...</Text>
        </View>
      ) : initError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Article Unavailable</Text>
          <Text style={styles.errorSubtitle}>{initError}</Text>
          <Button
            title="Retry Connection"
            onPress={initSession}
            variant="outline"
            style={styles.retryButton}
          />
        </View>
      ) : isExternalArticle ? (
        /* EXTERNAL LINK MODE UI */
        <ScrollView style={styles.articleScroll} contentContainerStyle={styles.articleScrollContent}>
          <Text style={styles.articleTitle}>{session?.articleTitle}</Text>
          <View style={styles.metaRow}>
            <Badge label="External Article" variant="cyan" />
            <Text style={styles.metaText}>
              Min. {requiredDuration}s • External Browser
            </Text>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={[
              styles.externalActionButton,
              (extState === 'READY_TO_CLAIM' || extState === 'COMPLETED') && styles.externalActionButtonDone,
              (extState === 'LAUNCHING' || extState === 'CHECKING_RETURN' || extState === 'CLAIMING') && { opacity: 0.8 },
            ]}
            onPress={handleOpenExternalArticle}
            disabled={
              extState === 'LAUNCHING' ||
              extState === 'CHECKING_RETURN' ||
              extState === 'CLAIMING' ||
              extState === 'COMPLETED'
            }
            accessibilityRole="button"
            accessibilityLabel={
              extState === 'NOT_STARTED'
                ? 'Open Article & Start'
                : extState === 'LAUNCHING'
                ? 'Opening article…'
                : extState === 'CHECKING_RETURN'
                ? 'Checking task…'
                : extState === 'READY_TO_CLAIM'
                ? 'View Article (Duration Met)'
                : extState === 'COMPLETED'
                ? 'Task Completed'
                : 'Try Again'
            }
          >
            <View style={styles.externalButtonContent}>
              <Text style={styles.externalButtonIcon}>
                {extState === 'COMPLETED' || extState === 'READY_TO_CLAIM' ? '✅' : '🔗'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.externalActionTitle}>
                  {extState === 'NOT_STARTED'
                    ? 'Open Article & Start'
                    : extState === 'LAUNCHING'
                    ? 'Opening article…'
                    : extState === 'CHECKING_RETURN'
                    ? 'Checking task…'
                    : extState === 'READY_TO_CLAIM'
                    ? 'View Article (Duration Met)'
                    : extState === 'AWAY'
                    ? 'Reading in Browser…'
                    : extState === 'COMPLETED'
                    ? 'Task Completed'
                    : 'Try Again'}
                </Text>
                <Text style={styles.externalActionSubtext}>
                  {extState === 'NOT_STARTED'
                    ? `Tap to launch article in your browser. Stay on the content for at least ${requiredDuration}s to qualify.`
                    : extState === 'LAUNCHING'
                    ? 'Opening external content in your browser…'
                    : extState === 'CHECKING_RETURN'
                    ? 'Verifying reading time with server…'
                    : extState === 'READY_TO_CLAIM'
                    ? `Required external engagement reached (${requiredDuration}/${requiredDuration}s). Ready to claim reward below.`
                    : extState === 'AWAY'
                    ? `Engaging with external content. Return here after ${requiredDuration} seconds.`
                    : extState === 'COMPLETED'
                    ? 'You have successfully completed this task and earned promotional points.'
                    : `You returned early. Open the link again and complete the full ${requiredDuration} seconds.`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Task Guidance Card */}
          <View style={styles.guidanceCard}>
            <Text style={styles.guidanceTitle}>Task Instructions</Text>
            <Text style={styles.guidanceItem}>
              1. Tap <Text style={{ fontWeight: '700' }}>"Open Article & Start"</Text> to open the web article in your browser.
            </Text>
            <Text style={styles.guidanceItem}>
              2. Read and engage with the article content for at least {requiredDuration} seconds.
            </Text>
            <Text style={styles.guidanceItem}>
              3. Return to this screen once the timer completes to claim your promotional reward.
            </Text>
          </View>

          {/* Article Overview / Preview if available */}
          {paragraphs.length > 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewHeading}>Article Preview</Text>
              <Text style={styles.previewText} numberOfLines={6}>
                {paragraphs[0]}
              </Text>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      ) : (
        /* IN-APP READING MODE UI (PRESERVED) */
        <ScrollView
          style={styles.articleScroll}
          contentContainerStyle={styles.articleScrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <Text style={styles.articleTitle}>{session?.articleTitle}</Text>
          <View style={styles.metaRow}>
            <Badge label="Promotional Read" variant="neutral" />
            <Text style={styles.metaText}>
              Min. {requiredDuration}s • Scroll {requiredScroll}%
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.articleBody}>
            {paragraphs.map((para, index) => (
              <Text key={`para-${index}`} style={styles.paragraph}>
                {para.trim()}
              </Text>
            ))}
          </View>

          {session?.hasQuiz && (
            <View style={styles.quizCard}>
              <View style={styles.quizHeader}>
                <Text style={styles.quizBadge}>COMPREHENSION CHECK</Text>
                <Text style={styles.quizAttemptsText}>
                  Attempts: {quizAttempts} / {session.quizMaxAttempts}
                </Text>
              </View>

              <Text style={styles.quizQuestion}>{session.quizQuestion}</Text>

              {session.quizOptions?.map((option, optIdx) => {
                const isSelected = selectedOption === optIdx;
                return (
                  <TouchableOpacity
                    key={`opt-${optIdx}`}
                    style={[
                      styles.quizOptionButton,
                      isSelected && styles.quizOptionButtonSelected,
                      quizSuccess && isSelected && styles.quizOptionButtonCorrect,
                    ]}
                    onPress={() => {
                      if (!quizSuccess) {
                        setSelectedOption(optIdx);
                      }
                    }}
                    disabled={quizSuccess || isSubmittingQuiz}
                  >
                    <View
                      style={[
                        styles.quizRadioCircle,
                        isSelected && styles.quizRadioCircleSelected,
                        quizSuccess && isSelected && styles.quizRadioCircleCorrect,
                      ]}
                    />
                    <Text
                      style={[
                        styles.quizOptionText,
                        isSelected && styles.quizOptionTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {quizMessage && (
                <View
                  style={[
                    styles.quizMessageContainer,
                    quizSuccess ? styles.quizMessageSuccess : styles.quizMessageError,
                  ]}
                >
                  <Text
                    style={[
                      styles.quizMessageText,
                      quizSuccess ? styles.quizMessageTextSuccess : styles.quizMessageTextError,
                    ]}
                  >
                    {quizMessage}
                  </Text>
                </View>
              )}

              {!quizSuccess && (
                <Button
                  title={isSubmittingQuiz ? 'Checking...' : 'Submit Answer'}
                  onPress={handleSubmitQuiz}
                  disabled={selectedOption === null || isSubmittingQuiz}
                  variant="primary"
                  style={styles.submitQuizButton}
                />
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Floating Bottom Action Bar */}
      {!isLoading && !initError && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarInfo}>
            <Text style={styles.bottomBarStatus}>
              {isExternalArticle
                ? extState === 'NOT_STARTED'
                  ? "Tap 'Open Article & Start' to begin reading in your browser."
                  : extState === 'LAUNCHING'
                  ? 'Opening article in your browser…'
                  : extState === 'AWAY'
                  ? `Reading in browser. Stay for at least ${requiredDuration}s before returning.`
                  : extState === 'CHECKING_RETURN'
                  ? 'Checking task…'
                  : extState === 'READY_TO_CLAIM'
                  ? 'Ready to claim! Required reading duration reached.'
                  : extState === 'CLAIMING'
                  ? 'Verifying and crediting reward…'
                  : extState === 'COMPLETED'
                  ? 'Task completed successfully!'
                  : `You returned early. Open the link again and complete the full ${requiredDuration} seconds.`
                : isQualified
                ? 'Requirements complete! You are qualified for promotional reward.'
                : session?.hasQuiz && !quizSuccess
                ? 'Complete reading and answer the quiz to qualify.'
                : remainingSeconds > 0
                ? `Read for ${remainingSeconds} more seconds in the foreground.`
                : maxScrollPercentage < requiredScroll
                ? `Scroll down to reach at least ${requiredScroll}% coverage.`
                : 'Verifying reading telemetry...'}
            </Text>
          </View>
          <Button
            title={
              isVerifying || extState === 'CLAIMING'
                ? 'Verifying...'
                : extState === 'CHECKING_RETURN'
                ? 'Checking task…'
                : extState === 'COMPLETED'
                ? 'Completed'
                : 'Claim Promotional Reward'
            }
            onPress={handleVerify}
            disabled={
              isExternalArticle
                ? extState !== 'READY_TO_CLAIM' || isVerifying || isCompleted
                : !isQualified || isVerifying || isCompleted
            }
            variant={(isExternalArticle ? extState === 'READY_TO_CLAIM' : (isQualified && !isCompleted)) ? 'primary' : 'outline'}
            style={styles.claimButton}
          />
        </View>
      )}

      {/* Success Modal - ONLY visible when explicit claim in current session succeeds */}
      <Modal
        visible={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          navigation.goBack();
        }}
        title="Promotional Points Awarded!"
      >
        <View style={styles.successModalContent}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Task Completed!</Text>
          <Text style={styles.successMessage}>
            Task completed — {completionResult?.points || 10} promotional points added.
          </Text>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsValue}>+{completionResult?.points || 10} PTS</Text>
          </View>
          <Button
            title="Back to Earn Hub"
            onPress={() => {
              setShowSuccessModal(false);
              navigation.goBack();
            }}
            variant="primary"
            style={styles.doneButton}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  backButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginHorizontal: 12,
    textAlign: 'center',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  statusBarContainer: {
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: THEME.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: THEME.colors.textSecondary,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: THEME.colors.danger,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    minWidth: 160,
  },
  articleScroll: {
    flex: 1,
  },
  articleScrollContent: {
    padding: 20,
  },
  articleTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    lineHeight: 28,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  metaText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  externalActionButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1.5,
    borderColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  externalActionButtonDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: THEME.colors.emerald,
  },
  externalButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  externalButtonIcon: {
    fontSize: 26,
  },
  externalActionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  externalActionSubtext: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  guidanceCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 16,
    marginVertical: 12,
  },
  guidanceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  guidanceItem: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  previewBox: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 14,
    marginTop: 8,
  },
  previewHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  previewText: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginBottom: 20,
  },
  articleBody: {
    marginBottom: 24,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
    color: THEME.colors.textPrimary,
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  quizCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 24,
  },
  quizHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quizBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.emerald,
    letterSpacing: 0.5,
  },
  quizAttemptsText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  quizQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginBottom: 14,
    lineHeight: 22,
  },
  quizOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  quizOptionButtonSelected: {
    borderColor: THEME.colors.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  quizOptionButtonCorrect: {
    borderColor: THEME.colors.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  quizRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    marginRight: 10,
  },
  quizRadioCircleSelected: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emerald,
  },
  quizRadioCircleCorrect: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emerald,
  },
  quizOptionText: {
    fontSize: 14,
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  quizOptionTextSelected: {
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  quizMessageContainer: {
    padding: 10,
    borderRadius: 6,
    marginVertical: 10,
  },
  quizMessageSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  quizMessageError: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  quizMessageText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  quizMessageTextSuccess: {
    color: THEME.colors.emerald,
  },
  quizMessageTextError: {
    color: THEME.colors.danger,
  },
  submitQuizButton: {
    marginTop: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: THEME.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    flexDirection: 'column',
    gap: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bottomBarInfo: {
    alignItems: 'center',
  },
  bottomBarStatus: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
  },
  claimButton: {
    width: '100%',
  },
  successModalContent: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  pointsBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.colors.emerald,
    marginBottom: 20,
  },
  pointsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  doneButton: {
    width: '100%',
  },
});
