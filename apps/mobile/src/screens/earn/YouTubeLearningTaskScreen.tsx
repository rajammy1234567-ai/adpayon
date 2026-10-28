import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
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
  startYouTubeSessionApi,
  recordYouTubeProgressApi,
  getYouTubeSessionStatusApi,
  submitYouTubeQuizAnswerApi,
  verifyYouTubeLearningApi,
  startTaskApi,
  startExternalLinkSessionApi,
  reportExternalLinkLaunchApi,
  reportExternalLinkReturnApi,
  getExternalLinkSessionStatusApi,
  verifyExternalLinkElapsedApi,
} from '../../services/api/task.api';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { extractYouTubeVideoId } from '@adpayon/shared';
import { useWalletStore } from '../../store/walletStore';

export type ExternalInteractionState =
  | 'NOT_STARTED'
  | 'LAUNCHING'
  | 'AWAY'
  | 'CHECKING_RETURN'
  | 'RETURNED_EARLY'
  | 'READY_TO_CLAIM'
  | 'CLAIMING'
  | 'COMPLETED';

type YouTubeLearningTaskRouteProp = RouteProp<RootStackParamList, 'YouTubeLearningTask'>;

interface YouTubeSessionState {
  sessionId: string;
  taskId: string;
  youtubeUrl: string;
  videoId: string;
  videoTitle: string;
  sessionDurationSeconds: number;
  requiredDurationSeconds: number;
  instructions?: string;
  educationalNotice?: string;
  comprehensionQuiz?: {
    question: string;
    options: string[];
  };
}

export const YouTubeLearningTaskScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<YouTubeLearningTaskRouteProp>();
  const { taskId, assignmentId: initialAssignmentId } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [session, setSession] = useState<YouTubeSessionState | null>(null);

  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [requiredSeconds, setRequiredSeconds] = useState(60);
  const [isDurationMet, setIsDurationMet] = useState(false);

  // Quiz state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState(false);
  const [quizMessage, setQuizMessage] = useState<string | null>(null);

  // Verification & Completion state
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [completionResult, setCompletionResult] = useState<{
    points: number;
    completionId: string;
  } | null>(null);

  // AppState & Progress Tracking
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState);
  const [extState, setExtState] = useState<ExternalInteractionState>('NOT_STARTED');
  const extStateRef = useRef<ExternalInteractionState>('NOT_STARTED');
  extStateRef.current = extState;
  const isActionInFlightRef = useRef<boolean>(false);
  const isCompletedRef = useRef<boolean>(false);
  isCompletedRef.current = isCompleted;
  const hasBackgroundedRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const accumulatedRef = useRef(0);
  accumulatedRef.current = accumulatedSeconds;
  const sessionIdRef = useRef<string | null>(null);
  const externalSessionIdRef = useRef<string | null>(null);
  const currentAttemptIdRef = useRef<string | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Initialize Task Assignment & YouTube Session
  const initSession = useCallback(async () => {
    setIsLoading(true);
    setInitError(null);
    setShowSuccessModal(false); // Clear stale award modal state on init

    try {
      let activeAssignmentId = initialAssignmentId;

      if (!activeAssignmentId) {
        try {
          const assignRes = await startTaskApi(taskId);
          if (assignRes.success && assignRes.data?.assignment) {
            activeAssignmentId = assignRes.data.assignment.id;
          }
        } catch {
          // Proceed to session initialization
        }
      }

      const res = await startYouTubeSessionApi(taskId);
      if (res.success && res.data) {
        const rawData = res.data as any;
        const cfg = rawData.youtubeConfig || rawData;
        sessionIdRef.current = res.data.sessionId;

        const sessionData: YouTubeSessionState = {
          sessionId: res.data.sessionId,
          taskId: res.data.taskId,
          youtubeUrl: cfg.youtubeUrl || '',
          videoId: cfg.videoId || extractYouTubeVideoId(cfg.youtubeUrl || '').videoId || '',
          videoTitle: cfg.videoTitle || 'Educational Video Lesson',
          sessionDurationSeconds: cfg.sessionDurationSeconds || cfg.requiredDurationSeconds || 60,
          requiredDurationSeconds: cfg.requiredDurationSeconds || 60,
          instructions: cfg.instructions,
          educationalNotice: cfg.educationalNotice,
          comprehensionQuiz: cfg.comprehensionQuiz,
        };

        setSession(sessionData);

        // Check if server already has this task as COMPLETED
        if (rawData.isCompleted || rawData.status === 'COMPLETED' || rawData.rewardGranted) {
          setIsCompleted(true);
          isCompletedRef.current = true;
          setExtState('COMPLETED');
          extStateRef.current = 'COMPLETED';
          setIsDurationMet(true);
          setShowSuccessModal(false); // Award modal NEVER shown on restoration
          setAccumulatedSeconds(cfg.requiredDurationSeconds || 60);
          setRequiredSeconds(cfg.requiredDurationSeconds || 60);
          return;
        }

        setAccumulatedSeconds(res.data.accumulatedSeconds || 0);
        setRequiredSeconds(cfg.requiredDurationSeconds || 60);

        if ((res.data.accumulatedSeconds || 0) >= (cfg.requiredDurationSeconds || 60)) {
          setIsDurationMet(true);
        }

        // Restore external link session status if external YouTube URL is present
        if (cfg.youtubeUrl) {
          try {
            const extStatusRes = await getExternalLinkSessionStatusApi(taskId);
            if (extStatusRes.success && extStatusRes.data) {
              const extData = extStatusRes.data;
              externalSessionIdRef.current = extData.sessionId;
              currentAttemptIdRef.current = extData.attemptId || null;

              if (extData.isCompleted || extData.status === 'COMPLETED' || extData.rewardGranted) {
                // COMPLETED: completed UI; no Try Again, no award modal
                setIsCompleted(true);
                isCompletedRef.current = true;
                setExtState('COMPLETED');
                extStateRef.current = 'COMPLETED';
                setIsDurationMet(true);
                setShowSuccessModal(false);
                setAccumulatedSeconds(cfg.requiredDurationSeconds || 60);
              } else if (extData.isDurationMet) {
                // Eligible but unclaimed: READY TO CLAIM; no award modal
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('READY_TO_CLAIM');
                extStateRef.current = 'READY_TO_CLAIM';
                setIsDurationMet(true);
                setShowSuccessModal(false);
                setAccumulatedSeconds(cfg.requiredDurationSeconds || 60);
              } else if (extData.status === 'RETURNED_EARLY' || extData.attemptStatus === 'RETURNED_EARLY') {
                // Incomplete/interrupted: Try Again; no award modal
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('RETURNED_EARLY');
                extStateRef.current = 'RETURNED_EARLY';
                setIsDurationMet(false);
                setShowSuccessModal(false);
                setAccumulatedSeconds(0);
              } else if (extData.linkLaunched) {
                // Was previously launched but left dangling / re-entered: Try Again; no award modal
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('RETURNED_EARLY');
                extStateRef.current = 'RETURNED_EARLY';
                setIsDurationMet(false);
                setShowSuccessModal(false);
                setAccumulatedSeconds(0);
              } else {
                setIsCompleted(false);
                isCompletedRef.current = false;
                setExtState('NOT_STARTED');
                extStateRef.current = 'NOT_STARTED';
                setIsDurationMet(false);
                setShowSuccessModal(false);
                setAccumulatedSeconds(0);
              }
            } else {
              setExtState('NOT_STARTED');
            }
          } catch {
            setExtState('NOT_STARTED');
            externalSessionIdRef.current = null;
            currentAttemptIdRef.current = null;
          }
        }

        // If no quiz configured, automatically mark quiz answered
        if (!cfg.comprehensionQuiz || !cfg.comprehensionQuiz.question) {
          setQuizSuccess(true);
        }
      } else {
        setInitError('Failed to initialize educational YouTube session');
      }
    } catch (err: any) {
      setInitError(err.message || 'Error establishing YouTube learning session');
    } finally {
      setIsLoading(false);
    }
  }, [taskId, initialAssignmentId]);

  useEffect(() => {
    initSession();
    return () => {
      setShowSuccessModal(false); // Clear stale modal on unmount / task change
    };
  }, [initSession]);

  // 2. Active Session Timer & Heartbeat (Only runs when app is active AND not an external link task)
  useEffect(() => {
    if (isLoading || isCompleted || !session || externalSessionIdRef.current) return;

    if (appStateStatus === 'active') {
      progressTimerRef.current = setInterval(async () => {
        setAccumulatedSeconds((prev) => {
          const next = prev + 1;
          if (next >= requiredSeconds && !isDurationMet) {
            setIsDurationMet(true);
          }
          // Send server heartbeat every 5 seconds
          if (next % 5 === 0 && sessionIdRef.current) {
            recordYouTubeProgressApi(taskId, sessionIdRef.current, next).catch(() => {
              // Ignore transient heartbeat network error
            });
          }
          return next;
        });
      }, 1000);
    } else {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    }

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [isLoading, isCompleted, session, appStateStatus, requiredSeconds, isDurationMet, taskId]);

  // 3. Return handling from external player / browser
  const handleExternalReturn = useCallback(async () => {
    if (isCompletedRef.current || isActionInFlightRef.current) return;
    if (extStateRef.current !== 'AWAY') return;

    const targetSid = externalSessionIdRef.current || session?.sessionId;
    const attemptId = currentAttemptIdRef.current;
    if (!targetSid || !attemptId) {
      setExtState('RETURNED_EARLY');
      extStateRef.current = 'RETURNED_EARLY';
      return;
    }

    isActionInFlightRef.current = true;
    setExtState('CHECKING_RETURN');
    extStateRef.current = 'CHECKING_RETURN';

    try {
      const res = await reportExternalLinkReturnApi(taskId, targetSid, attemptId);

      if (currentAttemptIdRef.current !== attemptId) {
        return;
      }

      if (res.success && res.data) {
        const awaySec = res.data.accumulatedAwaySeconds ?? res.data.elapsedSeconds ?? 0;
        setAccumulatedSeconds(awaySec);
        if (res.data.isDurationMet || awaySec >= requiredSeconds) {
          setIsDurationMet(true);
          setExtState('READY_TO_CLAIM');
          extStateRef.current = 'READY_TO_CLAIM';
        } else {
          setIsDurationMet(false);
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
  }, [taskId, session?.sessionId, requiredSeconds]);

  const handleExternalReturnRef = useRef(handleExternalReturn);
  handleExternalReturnRef.current = handleExternalReturn;

  // Single AppState listener registered once on mount
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (externalSessionIdRef.current) {
        // External link mode: only track background transition if we are currently in AWAY state
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
        // In-app mode
        if (prevState === 'active' && (nextState === 'background' || nextState === 'inactive')) {
          hasBackgroundedRef.current = true;
          if (sessionIdRef.current) {
            recordYouTubeProgressApi(taskId, sessionIdRef.current, accumulatedRef.current).catch(() => {});
          }
        } else if (
          (prevState === 'background' || prevState === 'inactive') &&
          nextState === 'active' &&
          hasBackgroundedRef.current
        ) {
          hasBackgroundedRef.current = false;
          handleExternalReturnRef.current();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // 4. Open YouTube video in official player or browser
  const handleOpenYouTube = async () => {
    if (!session?.youtubeUrl) return;

    if (isActionInFlightRef.current) return;
    if (extStateRef.current !== 'NOT_STARTED' && extStateRef.current !== 'RETURNED_EARLY') {
      return;
    }

    isActionInFlightRef.current = true;
    setExtState('LAUNCHING');
    extStateRef.current = 'LAUNCHING';
    hasBackgroundedRef.current = false;

    try {
      // Ensure backend external link session is active
      let activeSessionId = externalSessionIdRef.current;
      if (!activeSessionId) {
        const extSession = await startExternalLinkSessionApi(taskId).catch(() => null);
        activeSessionId = extSession?.data?.sessionId || session.sessionId;
        externalSessionIdRef.current = activeSessionId;
      }

      const supported = await Linking.canOpenURL(session.youtubeUrl);
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
        Alert.alert('Notice', 'Unable to open YouTube player automatically. You can view the lesson details below.');
        return;
      }

      // Report launch FIRST so backend creates attemptId and starts timing
      const reportRes = await reportExternalLinkLaunchApi(taskId, activeSessionId, true).catch(() => null);
      if (!reportRes?.success || !reportRes?.data?.attemptId) {
        throw new Error((reportRes as any)?.error?.message || 'Failed to start video session on server');
      }

      const attemptId = reportRes.data.attemptId;
      currentAttemptIdRef.current = attemptId;

      setExtState('AWAY');
      extStateRef.current = 'AWAY';
      hasBackgroundedRef.current = false;
      isActionInFlightRef.current = false;

      await Linking.openURL(session.youtubeUrl);
    } catch (err: any) {
      isActionInFlightRef.current = false;
      currentAttemptIdRef.current = null;
      setExtState('RETURNED_EARLY');
      extStateRef.current = 'RETURNED_EARLY';
      Alert.alert('Notice', 'Opening YouTube player was interrupted.');
    }
  };

  // 5. Submit Quiz Answer
  const handleSubmitQuiz = async () => {
    if (selectedOption === null || !session) {
      Alert.alert('Selection Required', 'Please choose an answer before submitting.');
      return;
    }

    setIsSubmittingQuiz(true);
    setQuizMessage(null);

    try {
      const res = await submitYouTubeQuizAnswerApi(taskId, session.sessionId, selectedOption);
      if (res.success && res.data.isCorrect) {
        setQuizSuccess(true);
        setQuizMessage(res.data.message || 'Correct answer verified!');
      } else {
        setQuizSuccess(false);
        setQuizMessage(res.data?.message || 'Incorrect answer. Please review the lesson and try again.');
      }
    } catch (err: any) {
      setQuizMessage(err.message || 'Error verifying quiz answer. Please try again.');
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  // 6. Claim Reward Verification
  const handleClaimReward = async () => {
    if (session?.comprehensionQuiz?.question && !quizSuccess) {
      Alert.alert(
        'Quiz Required',
        'Please answer the educational comprehension question correctly before claiming rewards.'
      );
      return;
    }

    if (extStateRef.current !== 'READY_TO_CLAIM' || isActionInFlightRef.current || isCompletedRef.current) return;

    isActionInFlightRef.current = true;
    setIsVerifying(true);
    setExtState('CLAIMING');
    extStateRef.current = 'CLAIMING';

    try {
      // 1. Try external link elapsed-time verification
      const targetSid = externalSessionIdRef.current || session!.sessionId;
      const extRes = await verifyExternalLinkElapsedApi(taskId, targetSid).catch((err: any) => {
        return err?.response?.data || null;
      });

      if (extRes && (extRes.status === 'COMPLETED' || extRes.success || extRes.error?.code === 'TASK_ALREADY_COMPLETED')) {
        setCompletionResult({
          points: extRes.data?.rewardPoints || 100,
          completionId: extRes.data?.completionId || `ext-${session!.sessionId}`,
        });
        setIsCompleted(true);
        isCompletedRef.current = true;
        setExtState('COMPLETED');
        extStateRef.current = 'COMPLETED';
        setShowSuccessModal(true); // Only show congratulations modal after current explicit claim succeeds
        Promise.allSettled([
          useWalletStore.getState().fetchSummary(),
          useWalletStore.getState().fetchTransactions(),
        ]).catch(() => {});
        return;
      }

      if (extRes && extRes.status === 'INCOMPLETE') {
        const remaining = extRes.data?.remainingSeconds ?? Math.max(0, requiredSeconds - accumulatedSeconds);
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
        Alert.alert(
          'Duration Incomplete',
          `Required external engagement duration not yet reached. ${remaining} second(s) remaining.`
        );
        return;
      }

      if (extRes && extRes.status === 'NOT_ELIGIBLE') {
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
        Alert.alert(
          'Launch Required',
          'Please tap "Open in YouTube" to launch the external video before claiming rewards.'
        );
        return;
      }

      // 2. Fallback to standard YouTube learning verification
      if (!isDurationMet) {
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
        Alert.alert(
          'Session Incomplete',
          `Please participate in the educational session for at least ${requiredSeconds} seconds.`
        );
        return;
      }

      const res = await verifyYouTubeLearningApi(taskId, session!.sessionId);
      if (res.success && res.data) {
        setCompletionResult({
          points: res.data.rewardPoints,
          completionId: res.data.completionId,
        });
        setIsCompleted(true);
        isCompletedRef.current = true;
        setExtState('COMPLETED');
        extStateRef.current = 'COMPLETED';
        setShowSuccessModal(true); // Only show congratulations modal after current explicit claim succeeds
        Promise.allSettled([
          useWalletStore.getState().fetchSummary(),
          useWalletStore.getState().fetchTransactions(),
        ]).catch(() => {});
      } else {
        setExtState('RETURNED_EARLY');
        extStateRef.current = 'RETURNED_EARLY';
        Alert.alert('Verification Failed', 'Unable to confirm educational task completion.');
      }
    } catch (err: any) {
      setExtState('RETURNED_EARLY');
      extStateRef.current = 'RETURNED_EARLY';
      Alert.alert('Verification Error', err.message || 'Reward claim encountered an issue.');
    } finally {
      setIsVerifying(false);
      isActionInFlightRef.current = false;
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={THEME.colors.emerald} />
          <Text style={styles.loadingText}>Initializing YouTube Video Learning Session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (initError || !session) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Task Unavailable</Text>
          <Text style={styles.errorSubtext}>{initError || 'This learning task could not be loaded.'}</Text>
          <Button title="Return to Feed" onPress={() => navigation.goBack()} style={styles.returnBtn} />
        </View>
      </SafeAreaView>
    );
  }

  const thumbnailUrl = session.videoId
    ? `https://img.youtube.com/vi/${session.videoId}/hqdefault.jpg`
    : null;

  const progressPercent = Math.min(100, Math.round((accumulatedSeconds / requiredSeconds) * 100));

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.exitButton}>
            <Text style={styles.exitText}>← Exit Task</Text>
          </TouchableOpacity>
          <Badge
            label={isDurationMet ? 'SESSION MET' : `${Math.max(0, requiredSeconds - accumulatedSeconds)}s LEFT`}
            variant={isDurationMet ? 'active' : 'gold'}
          />
        </View>

        {/* Video Player Card */}
        <View style={styles.playerCard}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailImage} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderThumbnail} />
          )}

          <View style={styles.playerOverlay}>
            <TouchableOpacity
              onPress={handleOpenYouTube}
              style={[
                styles.playButton,
                (extState === 'LAUNCHING' || extState === 'CHECKING_RETURN' || extState === 'CLAIMING') && { opacity: 0.7 },
              ]}
              disabled={
                extState === 'LAUNCHING' ||
                extState === 'CHECKING_RETURN' ||
                extState === 'CLAIMING' ||
                extState === 'COMPLETED'
              }
              activeOpacity={0.8}
            >
              <Text style={styles.playIconText}>
                {extState === 'LAUNCHING' ? '⏳' : isDurationMet ? '✅' : '▶'}
              </Text>
              <Text style={styles.playButtonLabel}>
                {extState === 'LAUNCHING'
                  ? 'Opening video…'
                  : extState === 'CHECKING_RETURN'
                  ? 'Checking task…'
                  : extState === 'COMPLETED'
                  ? 'Lesson Completed'
                  : isDurationMet
                  ? 'Watch Again'
                  : 'Watch on YouTube'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Lesson Information */}
        <View style={styles.infoCard}>
          <Text style={styles.videoTitle}>{session.videoTitle || 'Educational Video Lesson'}</Text>

          {session.instructions ? (
            <Text style={styles.instructionsText}>{session.instructions}</Text>
          ) : null}

          {/* Compliance Banner */}
          <View style={styles.complianceBox}>
            <Text style={styles.complianceTitle}>🛡️ Educational Integrity Policy</Text>
            <Text style={styles.complianceText}>
              Rewards are awarded strictly for educational engagement and verified quiz answers. ADPAYON does not award points for inflating YouTube view counts, watch time, likes, or subscriptions.
            </Text>
          </View>
        </View>

        {/* Session Progress Tracker */}
        <View style={styles.trackerCard}>
          <View style={styles.trackerHeader}>
            <Text style={styles.trackerTitle}>Learning Session Progress</Text>
            <Text style={styles.trackerTime}>
              {accumulatedSeconds}s / {requiredSeconds}s ({progressPercent}%)
            </Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.trackerHint}>
            {isDurationMet
              ? '✓ Educational session requirement fulfilled.'
              : 'Keep ADPAYON active while watching the lesson to record learning progress.'}
          </Text>
        </View>

        {/* Comprehension Quiz */}
        {session.comprehensionQuiz && session.comprehensionQuiz.question ? (
          <View style={styles.quizCard}>
            <View style={styles.quizHeaderRow}>
              <Text style={styles.quizTitle}>Comprehension Verification</Text>
              {quizSuccess ? (
                <Badge label="VERIFIED" variant="active" />
              ) : (
                <Badge label="REQUIRED" variant="gold" />
              )}
            </View>

            <Text style={styles.quizQuestion}>{session.comprehensionQuiz.question}</Text>

            <View style={styles.optionsList}>
              {session.comprehensionQuiz.options.map((option, idx) => {
                const isSelected = selectedOption === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      if (!quizSuccess) {
                        setSelectedOption(idx);
                        setQuizMessage(null);
                      }
                    }}
                    disabled={quizSuccess}
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemSelected,
                      quizSuccess && isSelected && styles.optionItemCorrect,
                    ]}
                  >
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                        quizSuccess && isSelected && styles.optionTextCorrect,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {quizMessage ? (
              <View style={[styles.quizMessageBox, quizSuccess ? styles.msgSuccess : styles.msgError]}>
                <Text style={styles.quizMessageText}>{quizMessage}</Text>
              </View>
            ) : null}

            {!quizSuccess ? (
              <Button
                title={isSubmittingQuiz ? 'Verifying Answer...' : 'Submit Quiz Answer'}
                onPress={handleSubmitQuiz}
                disabled={selectedOption === null || isSubmittingQuiz}
                style={styles.submitQuizBtn}
              />
            ) : null}
          </View>
        ) : null}

        {/* Claim Reward Button */}
        <View style={styles.actionSection}>
          <Button
            title={
              isVerifying || extState === 'CLAIMING'
                ? 'Confirming Rewards...'
                : extState === 'CHECKING_RETURN'
                ? 'Checking task…'
                : extState === 'COMPLETED'
                ? 'Completed'
                : 'Claim Promotional Reward'
            }
            onPress={handleClaimReward}
            disabled={
              extState === 'COMPLETED' ||
              !isDurationMet ||
              extState === 'CHECKING_RETURN' ||
              extState === 'CLAIMING' ||
              (session.comprehensionQuiz?.question ? !quizSuccess : false) ||
              isVerifying
            }
            style={styles.claimButton}
          />
        </View>
      </ScrollView>

      {/* Completion Modal - ONLY visible when explicit claim in current session succeeds */}
      <Modal visible={showSuccessModal} onClose={() => { setShowSuccessModal(false); navigation.goBack(); }}>
        <View style={styles.modalContent}>
          <Text style={styles.modalIcon}>🎉</Text>
          <Text style={styles.modalTitle}>Task Completed!</Text>
          <Text style={styles.modalSubtext}>
            Task completed — {completionResult?.points || 10} promotional points added.
          </Text>
          <View style={styles.rewardPill}>
            <Text style={styles.rewardPillText}>+{completionResult?.points || 10} Promotional PTS</Text>
          </View>
          <Text style={styles.modalNote}>
            Your promotional reward has been securely credited to your wallet ledger.
          </Text>
          <Button
            title="Done & Return to Feed"
            onPress={() => {
              setShowSuccessModal(false);
              navigation.goBack();
            }}
            style={styles.modalDoneBtn}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  errorTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorSubtext: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  returnBtn: {
    minWidth: 160,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  exitButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  exitText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  playerCard: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
  },
  playerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: '#ef4444',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  playIconText: {
    color: '#ffffff',
    fontSize: 16,
    marginRight: 8,
  },
  playButtonLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 16,
  },
  videoTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  instructionsText: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  complianceBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  complianceTitle: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  complianceText: {
    color: '#fca5a5',
    fontSize: 11,
    lineHeight: 16,
  },
  trackerCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 16,
  },
  trackerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  trackerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  trackerTime: {
    color: THEME.colors.emerald,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.emerald,
  },
  trackerHint: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
  },
  quizCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 20,
  },
  quizHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  quizTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  quizQuestion: {
    color: THEME.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 14,
  },
  optionsList: {
    gap: 8,
    marginBottom: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  optionItemSelected: {
    borderColor: THEME.colors.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  optionItemCorrect: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: THEME.colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  radioCircleSelected: {
    borderColor: THEME.colors.emerald,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: THEME.colors.emerald,
  },
  optionText: {
    color: THEME.colors.textPrimary,
    fontSize: 12,
    flex: 1,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: '#ffffff',
  },
  optionTextCorrect: {
    color: '#34d399',
  },
  quizMessageBox: {
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  msgSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  msgError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  quizMessageText: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
  },
  submitQuizBtn: {
    marginTop: 4,
  },
  actionSection: {
    marginTop: 8,
  },
  claimButton: {
    backgroundColor: THEME.colors.emerald,
  },
  modalContent: {
    alignItems: 'center',
    padding: 16,
  },
  modalIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  modalTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtext: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  rewardPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    marginBottom: 12,
  },
  rewardPillText: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalNote: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalDoneBtn: {
    width: '100%',
  },
});
