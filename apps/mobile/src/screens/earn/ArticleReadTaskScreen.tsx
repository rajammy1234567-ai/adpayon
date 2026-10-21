import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
  startArticleSessionApi,
  recordArticleProgressApi,
  submitArticleQuizAnswerApi,
  verifyArticleReadApi,
  startTaskApi,
} from '../../services/api/task.api';
import { ArticleSessionData } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';

type ArticleReadTaskRouteProp = RouteProp<RootStackParamList, 'ArticleReadTask'>;

export const ArticleReadTaskScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ArticleReadTaskRouteProp>();
  const { taskId, assignmentId: initialAssignmentId } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [session, setSession] = useState<ArticleSessionData | null>(null);

  // Engagement tracking
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [maxScrollPercentage, setMaxScrollPercentage] = useState(0);
  const [currentScrollPercentage, setCurrentScrollPercentage] = useState(0);
  const [isQualified, setIsQualified] = useState(false);

  // Quiz state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [quizMessage, setQuizMessage] = useState<string | null>(null);
  const [quizSuccess, setQuizSuccess] = useState(false);
  const [quizAttempts, setQuizAttempts] = useState(0);

  // Completion state
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completionResult, setCompletionResult] = useState<{
    points: number;
    completionId: string;
  } | null>(null);

  // AppState & Timing refs
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState);
  const sessionRef = useRef<ArticleSessionData | null>(null);
  sessionRef.current = session;
  const isCompletedRef = useRef(false);
  isCompletedRef.current = isCompleted;

  const lastBeaconTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);
  const isReportingRef = useRef<boolean>(false);

  // 1. Initialize Task Assignment & Article Reading Session
  const initSession = useCallback(async () => {
    setIsLoading(true);
    setInitError(null);

    try {
      let activeAssignmentId = initialAssignmentId;

      // If no assignment passed, claim or check assignment first
      if (!activeAssignmentId) {
        try {
          const assignRes = await startTaskApi(taskId);
          if (assignRes.success && assignRes.data?.assignment) {
            activeAssignmentId = assignRes.data.assignment.id;
          }
        } catch {
          // If assignment already exists or duplicate active, proceed to session start
        }
      }

      const res = await startArticleSessionApi(taskId, activeAssignmentId);
      if (res.success && res.data) {
        const data = res.data;
        setSession(data);
        setAccumulatedSeconds(data.accumulatedReadSeconds || 0);
        setRemainingSeconds(data.remainingReadSeconds || 0);
        setMaxScrollPercentage(data.maxScrollPercentage || 0);
        maxScrollRef.current = data.maxScrollPercentage || 0;
        setIsQualified(Boolean(data.isQualified));
        setQuizSuccess(Boolean(data.quizAnswerCorrect));
        setQuizAttempts(data.quizAttempts || 0);
        lastBeaconTimeRef.current = Date.now();
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
  }, [initSession]);

  // Telemetry helper to report progress beacon
  const sendBeacon = useCallback(
    async (extraParams?: { forceAppState?: 'active' | 'background'; forceScroll?: number }) => {
      const curSession = sessionRef.current;
      if (!curSession || isCompletedRef.current || isReportingRef.current) return;

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
        // Beacon failure resilience: will retry on next tick
      } finally {
        isReportingRef.current = false;
      }
    },
    [taskId]
  );

  // 2. Periodic Telemetry Beacon (every 2.5 seconds when active)
  useEffect(() => {
    if (!session || isCompleted) return;

    const interval = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      sendBeacon();
    }, 2500);

    return () => clearInterval(interval);
  }, [session, isCompleted, sendBeacon]);

  // 3. Foreground / Background AppState Listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasActive = appStateStatus === 'active';
      const isNowActive = nextState === 'active';
      setAppStateStatus(nextState);

      if (wasActive && !isNowActive) {
        // App went to background -> immediately flush reading time and flag as background
        sendBeacon({ forceAppState: 'background' });
      } else if (!wasActive && isNowActive) {
        // Returned to foreground -> reset interval baseline
        lastBeaconTimeRef.current = Date.now();
      }
    });

    return () => subscription.remove();
  }, [appStateStatus, sendBeacon]);

  // 4. Scroll Tracking
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
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

  // 5. Submit Quiz Answer
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

  // 6. Authoritative Reward Claim Trigger
  const handleVerify = async () => {
    if (!session || isVerifying || isCompleted) return;
    setIsVerifying(true);

    try {
      // Send final telemetry update prior to verify
      await sendBeacon();

      const res = await verifyArticleReadApi(taskId, session.sessionId);
      if (res.success && res.data) {
        setIsCompleted(true);
        setCompletionResult({
          points: res.data.completion.rewardPoints,
          completionId: res.data.completion.id,
        });
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

  // Split article content into paragraphs safely
  const paragraphs = session?.articleContent
    ? session.articleContent.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    : [];

  const requiredDuration = session?.minReadDurationSeconds || 30;
  const requiredScroll = session?.minScrollPercentage || 80;
  const timeProgressPercent = Math.min(100, Math.round((accumulatedSeconds / requiredDuration) * 100));

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
          <Badge
            label={isQualified ? 'QUALIFIED' : `${remainingSeconds}s LEFT`}
            variant={isQualified ? 'verified' : 'gold'}
          />
        </View>
      </View>

      {/* Progress Bars (Time & Scroll) */}
      {!isLoading && !initError && (
        <View style={styles.statusBarContainer}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>
              Time: {accumulatedSeconds}s / {requiredDuration}s ({timeProgressPercent}%)
            </Text>
            <Text style={styles.metricLabel}>
              Scroll: {maxScrollPercentage}% / {requiredScroll}%
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${timeProgressPercent}%`, backgroundColor: isQualified ? THEME.colors.emerald : THEME.colors.gold },
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
      ) : (
        <ScrollView
          style={styles.articleScroll}
          contentContainerStyle={styles.articleScrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* Article Header */}
          <Text style={styles.articleTitle}>{session?.articleTitle}</Text>
          <View style={styles.metaRow}>
            <Badge label="Promotional Read" variant="neutral" />
            <Text style={styles.metaText}>
              Min. {requiredDuration}s • Scroll {requiredScroll}%
            </Text>
          </View>

          <View style={styles.divider} />

          {/* Article Body Paragraphs */}
          <View style={styles.articleBody}>
            {paragraphs.map((para, index) => (
              <Text key={`para-${index}`} style={styles.paragraph}>
                {para.trim()}
              </Text>
            ))}
          </View>

          {/* Comprehension Quiz Section (if configured) */}
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

          {/* Bottom Spacing so content isn't obscured by action bar */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Floating Bottom Action Bar */}
      {!isLoading && !initError && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarInfo}>
            <Text style={styles.bottomBarStatus}>
              {isQualified
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
            title={isVerifying ? 'Verifying...' : 'Claim Promotional Reward'}
            onPress={handleVerify}
            disabled={!isQualified || isVerifying || isCompleted}
            variant={isQualified ? 'primary' : 'outline'}
            style={styles.claimButton}
          />
        </View>
      )}

      {/* Success Modal */}
      <Modal
        visible={isCompleted}
        onClose={() => {
          navigation.goBack();
        }}
        title="Promotional Points Awarded!"
      >
        <View style={styles.successModalContent}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Reward Verified</Text>
          <Text style={styles.successMessage}>
            Congratulations! Your article reading engagement and comprehension have been authoritatively verified.
          </Text>
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsValue}>+{completionResult?.points || 0} PTS</Text>
          </View>
          <Button
            title="Back to Earn Hub"
            onPress={() => {
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
