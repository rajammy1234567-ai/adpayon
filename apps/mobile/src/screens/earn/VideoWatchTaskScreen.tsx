import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useVideoPlayer, VideoView } from 'expo-video';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import {
  startVideoSessionApi,
  recordVideoProgressApi,
  verifyVideoWatchApi,
  startTaskApi,
} from '../../services/api/task.api';
import { VideoSessionData } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';

type VideoWatchTaskRouteProp = RouteProp<RootStackParamList, 'VideoWatchTask'>;

export const VideoWatchTaskScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<VideoWatchTaskRouteProp>();
  const { taskId, assignmentId: initialAssignmentId } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoSessionData | null>(null);
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const [timelineCoverageSeconds, setTimelineCoverageSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isQualified, setIsQualified] = useState(false);
  const [playbackEnded, setPlaybackEnded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentPlaybackPosition, setCurrentPlaybackPosition] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completionResult, setCompletionResult] = useState<{
    points: number;
    completionId: string;
  } | null>(null);

  // AppState & Playback tracking
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState);
  const isPlayingRef = useRef(false);
  const isBufferingRef = useRef(false);
  const playbackEndedRef = useRef(false);
  const lastReportedPosRef = useRef(0);
  const maxAllowedPositionRef = useRef(0);
  const sessionRef = useRef<VideoSessionData | null>(null);
  sessionRef.current = session;

  // Initialize or resume video player
  const videoSource = session?.videoUrl || '';
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
  });

  // 1. Initialize Task Assignment & Video Session
  const initSession = useCallback(async () => {
    setIsLoading(true);
    setInitError(null);

    try {
      let activeAssignmentId = initialAssignmentId;

      // If no assignment passed, claim or verify assignment first
      if (!activeAssignmentId) {
        try {
          const assignRes = await startTaskApi(taskId);
          if (assignRes.success && assignRes.data?.assignment) {
            activeAssignmentId = assignRes.data.assignment.id;
          }
        } catch (err: any) {
          // If assignment already exists or duplicate active, proceed to session start
        }
      }

      const res = await startVideoSessionApi(taskId, activeAssignmentId);
      if (res.success && res.data) {
        setSession(res.data);
        setAccumulatedSeconds(res.data.accumulatedWatchSeconds || 0);
        setTimelineCoverageSeconds(res.data.timelineCoverageSeconds || 0);
        setRemainingSeconds(res.data.remainingWatchSeconds);
        setPlaybackEnded(Boolean(res.data.playbackEnded));
        playbackEndedRef.current = Boolean(res.data.playbackEnded);

        const isFullPolicy = res.data.completionPolicy === 'FULL_VIDEO';
        const qualified = isFullPolicy
          ? (res.data.timelineCoverageSeconds || 0) >= (res.data.videoDuration - 1.0) && Boolean(res.data.playbackEnded)
          : (res.data.accumulatedWatchSeconds || 0) >= res.data.requiredWatchSeconds;

        setIsQualified(qualified);
        maxAllowedPositionRef.current = res.data.lastPlaybackPositionSeconds || 0;
        lastReportedPosRef.current = res.data.lastPlaybackPositionSeconds || 0;
      } else {
        setInitError('Failed to establish video session');
      }
    } catch (err: any) {
      setInitError(err.message || 'Unable to connect to video server');
    } finally {
      setIsLoading(false);
    }
  }, [taskId, initialAssignmentId]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // Telemetry helper to report progress beacon
  const sendBeacon = useCallback(
    async (extraParams?: { playbackEnded?: boolean; positionOverride?: number }) => {
      const curSession = sessionRef.current;
      if (!curSession || !player || isCompleted) return;

      const pos = extraParams?.positionOverride !== undefined
        ? extraParams.positionOverride
        : (player.currentTime || 0);
      const isPlaying = player.playing;
      const isEnded = extraParams?.playbackEnded ?? playbackEndedRef.current;

      try {
        const res = await recordVideoProgressApi(taskId, {
          sessionId: curSession.sessionId,
          playbackPositionSeconds: Math.floor(pos * 10) / 10,
          isPlaying,
          appState: AppState.currentState === 'active' ? 'active' : 'background',
          isBuffering: isBufferingRef.current,
          playbackEnded: isEnded,
        });

        if (res.success && res.data) {
          setAccumulatedSeconds(res.data.accumulatedWatchSeconds);
          setTimelineCoverageSeconds(res.data.timelineCoverageSeconds || 0);
          setRemainingSeconds(res.data.remainingWatchSeconds);
          setIsQualified(res.data.isQualified);
          setPlaybackEnded(Boolean(res.data.playbackEnded));
          lastReportedPosRef.current = pos;
        }
      } catch (err: any) {
        // Beacon failure resilience
      }
    },
    [taskId, isCompleted, player]
  );

  // 2. Playback state and event listeners
  useEffect(() => {
    if (!player) return;

    const playingSub = player.addListener('playingChange', (event) => {
      isPlayingRef.current = event.isPlaying;
    });

    const statusSub = player.addListener('statusChange', (event) => {
      const buffering = event.status === 'loading';
      isBufferingRef.current = buffering;
      setIsBuffering(buffering);
    });

    const endedSub = player.addListener('playToEnd', () => {
      playbackEndedRef.current = true;
      setPlaybackEnded(true);
      // Immediately send beacon on natural video end
      const curSession = sessionRef.current;
      const finalPos = curSession ? curSession.videoDuration : (player.currentTime || 0);
      sendBeacon({ playbackEnded: true, positionOverride: finalPos });
    });

    const timeSub = player.addListener('timeUpdate', (event) => {
      const currentPos = event.currentTime;
      setCurrentPlaybackPosition(currentPos);
      const currentSession = sessionRef.current;

      if (!currentSession) return;

      if (!currentSession.allowSeeking) {
        // Enforce client-side anti-seeking: prevent forward skips
        if (currentPos > maxAllowedPositionRef.current + 2.0) {
          player.currentTime = maxAllowedPositionRef.current;
          return;
        }
        if (currentPos > maxAllowedPositionRef.current) {
          maxAllowedPositionRef.current = currentPos;
        }
      }
    });

    return () => {
      playingSub.remove();
      statusSub.remove();
      endedSub.remove();
      timeSub.remove();
    };
  }, [player, sendBeacon]);

  // 3. Periodic Telemetry Beacon (every 2.5 seconds during active playback)
  useEffect(() => {
    if (!session || isCompleted) return;

    const interval = setInterval(async () => {
      if (AppState.currentState !== 'active' || !player) return;
      await sendBeacon();
    }, 2500);

    return () => clearInterval(interval);
  }, [session, isCompleted, player, sendBeacon]);

  // 4. Foreground / Background AppState Listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const wasActive = appStateStatus === 'active';
      const isNowActive = nextState === 'active';
      setAppStateStatus(nextState);

      if (wasActive && !isNowActive) {
        // App went to background -> PAUSE playback immediately
        if (player && player.playing) {
          player.pause();
        }

        // Send pause telemetry to server
        if (sessionRef.current) {
          recordVideoProgressApi(taskId, {
            sessionId: sessionRef.current.sessionId,
            playbackPositionSeconds: player ? player.currentTime : 0,
            isPlaying: false,
            appState: 'background',
            isBuffering: false,
            playbackEnded: playbackEndedRef.current,
          }).catch(() => {});
        }
      }
    });

    return () => subscription.remove();
  }, [appStateStatus, taskId, player]);

  // 5. Verification & Reward Trigger
  const handleVerify = async () => {
    if (!session || isVerifying || isCompleted) return;
    setIsVerifying(true);

    try {
      // Pause playback during verification
      if (player && player.playing) {
        player.pause();
      }

      const res = await verifyVideoWatchApi(taskId, session.sessionId);
      if (res.success && res.data) {
        setIsCompleted(true);
        setCompletionResult({
          points: res.data.completion.rewardPoints,
          completionId: res.data.completion.id,
        });
      } else {
        Alert.alert(
          'Verification Incomplete',
          'Could not verify complete playback. Please ensure the full video has played to the end.'
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Verification Error',
        err.message || 'Unable to complete reward verification. Please complete the full video watch.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const isFullVideoPolicy = session?.completionPolicy === 'FULL_VIDEO';

  // Compute progress percentage
  const totalTarget = isFullVideoPolicy
    ? (session?.videoDuration || 1)
    : (session?.requiredWatchSeconds || 1);
  const currentCoverage = isFullVideoPolicy
    ? timelineCoverageSeconds
    : accumulatedSeconds;
  const progressPercent = Math.min(100, Math.round((currentCoverage / totalTarget) * 100));

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
        <Text style={styles.headerTitle}>Promotional Video Task</Text>
        <View style={styles.headerRight}>
          <Badge
            label={isQualified ? 'QUALIFIED' : `${remainingSeconds}s LEFT`}
            variant={isQualified ? 'verified' : 'gold'}
          />
        </View>
      </View>

      {/* Main Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={THEME.colors.emerald} />
          <Text style={styles.loadingText}>Initializing secure video stream...</Text>
        </View>
      ) : initError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Video Unavailable</Text>
          <Text style={styles.errorSubtitle}>{initError}</Text>
          <Button
            title="Retry Connection"
            onPress={initSession}
            variant="outline"
            style={styles.retryButton}
          />
        </View>
      ) : (
        <View style={styles.content}>
          {/* Video Player Surface */}
          <View style={styles.playerWrapper}>
            <VideoView
              style={styles.videoPlayer}
              player={player}
              allowsPictureInPicture={false}
              nativeControls={session?.allowSeeking || false}
              requiresLinearPlayback={!session?.allowSeeking}
            />

            {/* Seeking Policy Overlay */}
            {!session?.allowSeeking && (
              <View style={styles.seekingPolicyBanner}>
                <Text style={styles.seekingPolicyText}>
                  ⚠️ Continuous linear playback required. Forward skipping is disabled.
                </Text>
              </View>
            )}
          </View>

          {/* Controls Bar (if native controls are disabled for anti-seeking) */}
          {!session?.allowSeeking && (
            <View style={styles.customControls}>
              <TouchableOpacity
                onPress={() => {
                  if (player.playing) {
                    player.pause();
                  } else {
                    player.play();
                  }
                }}
                style={styles.playPauseButton}
              >
                <Text style={styles.playPauseText}>
                  {player.playing ? '⏸ Pause' : '▶ Play Video'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Progress Card */}
          <View style={styles.progressCard}>
            {/* Policy indicator */}
            <View style={styles.policyRow}>
              <Text style={styles.policyBadge}>
                {isFullVideoPolicy ? 'FULL VIDEO MANDATORY' : 'MINIMUM DURATION'}
              </Text>
              <Text style={styles.playerPosText}>
                Position: {Math.round(currentPlaybackPosition * 10) / 10}s / {session?.videoDuration}s
              </Text>
            </View>

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>
                {isFullVideoPolicy ? 'Verified Timeline Coverage' : 'Verified Watch Time'}
              </Text>
              <Text style={styles.progressValue}>
                {Math.round(currentCoverage * 10) / 10}s / {totalTarget}s ({progressPercent}%)
              </Text>
            </View>

            {/* Visual Progress Bar */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progressPercent}%` },
                  isQualified && styles.progressBarFillQualified,
                ]}
              />
            </View>

            <View style={styles.metricsRow}>
              <Text style={styles.metricText}>
                {isFullVideoPolicy
                  ? `Required: 100% video completion`
                  : `Required: ${session?.requiredWatchSeconds} seconds`}
              </Text>
              <Text style={styles.metricText}>
                {isQualified
                  ? '✓ Requirement Verified'
                  : `${remainingSeconds}s coverage remaining`}
              </Text>
            </View>

            {/* Buffering Banner */}
            {isBuffering && (
              <View style={styles.bufferingNotice}>
                <Text style={styles.bufferingNoticeText}>
                  ⏳ Video buffering... watch time accumulation paused
                </Text>
              </View>
            )}

            {/* Background Notice */}
            {appStateStatus !== 'active' && (
              <View style={styles.pausedNotice}>
                <Text style={styles.pausedNoticeText}>
                  ⏸ Playback paused while app is in background
                </Text>
              </View>
            )}

            {/* Completion Requirements Checklist */}
            {isFullVideoPolicy && (
              <View style={styles.checklist}>
                <Text style={styles.checklistItem}>
                  {timelineCoverageSeconds >= ((session?.videoDuration || 0) - 1.0) ? '✅' : '⏳'}{' '}
                  Timeline coverage: {Math.round(timelineCoverageSeconds * 10) / 10}s / {session?.videoDuration}s
                </Text>
                <Text style={styles.checklistItem}>
                  {playbackEnded ? '✅' : '⏳'} Natural playback completion reached
                </Text>
              </View>
            )}
          </View>

          {/* Action / Claim Button */}
          <View style={styles.actionContainer}>
            <Button
              title={
                isCompleted
                  ? 'Reward Claimed'
                  : isVerifying
                  ? 'Verifying Coverage...'
                  : isQualified
                  ? 'Claim Reward Points'
                  : isFullVideoPolicy
                  ? `Watch Complete Video to Unlock (${remainingSeconds}s left)`
                  : `Watch ${remainingSeconds}s More to Unlock`
              }
              onPress={handleVerify}
              variant={isQualified ? 'primary' : 'secondary'}
              disabled={!isQualified || isVerifying || isCompleted}
              isLoading={isVerifying}
              style={styles.claimButton}
            />
          </View>
        </View>
      )}

      {/* Completion Confirmation Modal */}
      <Modal
        visible={isCompleted}
        onClose={() => {
          setIsCompleted(false);
          navigation.goBack();
        }}
        title="Promotional Reward Verified!"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalSuccessIcon}>🎉</Text>
          <Text style={styles.modalTitle}>Reward Credited!</Text>
          <Text style={styles.modalPoints}>
            +{completionResult?.points || 0} PTS
          </Text>
          <Text style={styles.modalSubtitle}>
            Your video watch has been verified by the server. Promotional reward points
            have been added to your balance.
          </Text>
          <Button
            title="Done"
            onPress={() => {
              setIsCompleted(false);
              navigation.goBack();
            }}
            variant="primary"
            style={styles.modalButton}
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
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  backButton: {
    paddingVertical: THEME.spacing.xs,
    paddingHorizontal: THEME.spacing.sm,
  },
  backButtonText: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    marginTop: THEME.spacing.md,
    fontSize: 14,
  },
  errorTitle: {
    color: THEME.colors.danger,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: THEME.spacing.sm,
  },
  errorSubtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  retryButton: {
    minWidth: 160,
  },
  content: {
    flex: 1,
    padding: THEME.spacing.lg,
  },
  playerWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: THEME.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  seekingPolicyBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(9, 12, 16, 0.85)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  seekingPolicyText: {
    color: THEME.colors.gold,
    fontSize: 11,
    fontWeight: '500',
  },
  customControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: THEME.spacing.md,
  },
  playPauseButton: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.xl,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  playPauseText: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginVertical: THEME.spacing.md,
  },
  policyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
    paddingBottom: THEME.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.borderSubtle,
  },
  policyBadge: {
    color: THEME.colors.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  playerPosText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  progressLabel: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  progressValue: {
    color: THEME.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.full,
    overflow: 'hidden',
    marginVertical: THEME.spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.gold,
    borderRadius: THEME.borderRadius.full,
  },
  progressBarFillQualified: {
    backgroundColor: THEME.colors.emerald,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: THEME.spacing.xs,
  },
  metricText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
  bufferingNotice: {
    marginTop: THEME.spacing.sm,
    padding: THEME.spacing.xs,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: THEME.borderRadius.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  bufferingNoticeText: {
    color: THEME.colors.gold,
    fontSize: 12,
    fontWeight: '600',
  },
  pausedNotice: {
    marginTop: THEME.spacing.sm,
    padding: THEME.spacing.xs,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.xs,
    alignItems: 'center',
  },
  pausedNoticeText: {
    color: THEME.colors.warning,
    fontSize: 12,
  },
  checklist: {
    marginTop: THEME.spacing.sm,
    paddingTop: THEME.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
  },
  checklistItem: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginVertical: 2,
  },
  actionContainer: {
    marginTop: 'auto',
    marginBottom: THEME.spacing.md,
  },
  claimButton: {
    width: '100%',
  },
  modalContent: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.md,
  },
  modalSuccessIcon: {
    fontSize: 48,
    marginBottom: THEME.spacing.sm,
  },
  modalTitle: {
    color: THEME.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: THEME.spacing.xs,
  },
  modalPoints: {
    color: THEME.colors.emerald,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: THEME.spacing.sm,
  },
  modalSubtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: THEME.spacing.lg,
  },
  modalButton: {
    width: '100%',
  },
});
